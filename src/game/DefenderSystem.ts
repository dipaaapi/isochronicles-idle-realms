import Phaser from 'phaser';
import { IsometricHelper } from './IsometricHelper';
import { Navigation, NavAgent } from './Navigation';
import type { ActiveInvader, InvaderBlocker, InvasionManager } from './InvasionManager';
import type { StructureManager } from './StructureManager';
import { useGameStore } from '../state/useGameStore';
import { CASTLE_GATE, TileRect, expandRect, isLandTile } from '../state/buildingLayout';
import type { TowerId, Resources } from '../types/state';
import { TASK_NODE_LOCATIONS, type UnitClass, type HarvestTask } from '../types/game';
import { createMinionSprite, faceCharacterSprite, playCharacterAttack, playCharacterWork } from './sprites/CharacterSprites';
import { soundFx } from './audio/soundFx';
import { useTenantCounts, type TenantCount } from '../state/tenantCounts';
import { logFloatingText } from '../state/activityLog';

export type DefenderState = 'HARVESTING' | 'HAULING_TO_CASTLE' | 'RETREAT_TO_GARRISON' | 'GARRISONED' | 'DETACHED_COMBAT';

/** A tenant summoned by an establishment, or a temporary summon ally (skeletons). */
export interface Defender extends InvaderBlocker, NavAgent {
  armorShield?: number;
  activeSlimeBuff?: import('./workers/types').SlimeMoraleBuffDef;
  id: string;
  home: TowerId | 'SUMMON';
  state: DefenderState;
  unitClass: UnitClass;
  tag?: string;
  life?: number;
  damage: number;
  container: Phaser.GameObjects.Container;
  sprite?: Phaser.GameObjects.Sprite;
  hpBar: Phaser.GameObjects.Graphics;
  garrisonBadge?: Phaser.GameObjects.Graphics;
  maxHp: number;
  cooldown: number;
  postX: number;
  postY: number;
  target?: ActiveInvader;
  lastX: number;
  lastY: number;
  isDetached?: boolean;
  // Harvesting fields
  harvestTask: HarvestTask;
  targetNodePos?: { x: number; y: number };
  workTimer: number;
  cargo: Partial<Resources>;
  takeHit: (damage: number) => void;
}

const MAX_PER_ESTABLISHMENT = 5;
const BASE_SPAWN_INTERVAL = 18; // base seconds between tenant spawns
const DEFENDER_HP = 80;
const DEFENDER_DAMAGE = 16;
const DEFENDER_SPEED = 72;
const DEFENDER_REACH = 28;
const IDLE_REGEN = 4;

const GUARD_CONFIG: Record<TowerId, { unitClass: UnitClass; task: HarvestTask; yieldRes: Partial<Resources>; resIcon: string }> = {
  WOOD: { unitClass: 'LAVA_GARGOYLE', task: 'WOOD', yieldRes: { wood: 2 }, resIcon: '🌲' },
  MINE: { unitClass: 'DEMON_HOUND', task: 'WOOD', yieldRes: { metal: 2, coal: 1 }, resIcon: '⛏️' },
  QUARRY: { unitClass: 'GOLEM', task: 'STONE', yieldRes: { stone: 2 }, resIcon: '🪨' },
  PORT: { unitClass: 'MERMAN', task: 'FISH', yieldRes: { fish: 2, water: 2 }, resIcon: '🐟' },
  CAVE: { unitClass: 'NECROMANCER', task: 'ESSENCE', yieldRes: { arcaneEssence: 2 }, resIcon: '🔮' },
  SPIRE: { unitClass: 'SUCCUBUS', task: 'ESSENCE', yieldRes: { arcaneEssence: 2, aetherShards: 1 }, resIcon: '✨' },
  TRENCH: { unitClass: 'KRAKEN', task: 'FISH', yieldRes: { abyssalPearl: 1, fish: 2 }, resIcon: '🐙' },
  CRYPT: { unitClass: 'NECROMANCER', task: 'ESSENCE', yieldRes: { soulFragments: 1 }, resIcon: '💀' },
  PERCH: { unitClass: 'HARPY', task: 'AETHER', yieldRes: { aetherShards: 1, wood: 2 }, resIcon: '🦅' },
  KENNEL: { unitClass: 'DEMON_HOUND', task: 'WOOD', yieldRes: { obsidianShard: 1 }, resIcon: '🐺' },
};

export interface SummonOptions {
  tag: string;
  unitClass: UnitClass;
  hp: number;
  damage: number;
  life: number;
  tint?: number;
}

export class DefenderSystem {
  private defenders: Defender[] = [];
  private spawnTimers = new Map<TowerId, number>();
  private nextId = 1;
  private wasWaveActive = false;

  constructor(
    private scene: Phaser.Scene,
    private layer: Phaser.GameObjects.Container,
    private structures: StructureManager,
    private invasion: InvasionManager,
    private nav: Navigation
  ) {}

  /** Raises a temporary ally at a world point (Necromancer skeletons, Raise the Dead). */
  summon(x: number, y: number, opts: SummonOptions): void {
    const pos = this.nav.pushOut(x, y, 0.18);
    this.createUnit('SUMMON', opts.unitClass, pos, opts.hp, opts.damage, 'WOOD', { wood: 1 }, '💀', opts);
  }

  /** Living summons with this tag. */
  summonCount(tag: string): number {
    return this.defenders.filter((d) => !d.dead && d.tag === tag).length;
  }

  /** Living defenders / tenants list */
  getDefenders(): Defender[] {
    return this.defenders;
  }

  /** Invaders fight defenders that get in their way. */
  getBlockers(): InvaderBlocker[] {
    return this.defenders;
  }

  /** Number of living garrisoned tenants tethered at an establishment. */
  getGarrisonCount(home: TowerId): number {
    return this.defenders.filter((d) => !d.dead && d.home === home && !d.isDetached && (d.state === 'GARRISONED' || d.state === 'RETREAT_TO_GARRISON')).length;
  }

  /** Total living tenants belonging to an establishment (garrisoned + detached). */
  getLivingTenantsCount(home: TowerId): number {
    return this.defenders.filter((d) => !d.dead && d.home === home).length;
  }

  /**
   * 20% Defense Tether Detachment:
   * When an establishment loses defense bar from taking damage, garrisoned tenants
   * detach from the establishment and enter DETACHED_COMBAT mode to counter-attack
   * invaders threatening their parent establishment or the Citadel!
   * Returns true if a tenant absorbed or detached for the hit.
   */
  absorbBuildingHit(home: TowerId, _damage: number): boolean {
    const store = useGameStore.getState();
    const researchTetherBonus = (store.upgrades.tenantDefenseBar ?? 1) - 1;

    // Find an attached garrisoned tenant to detach
    const attachedTenant = this.defenders.find(
      (d) => !d.dead && d.home === home && !d.isDetached && (d.state === 'GARRISONED' || d.state === 'RETREAT_TO_GARRISON')
    );

    if (!attachedTenant) return false;

    // Detach the tenant: Each represents 20% of the establishment defense bar!
    attachedTenant.isDetached = true;
    attachedTenant.state = 'DETACHED_COMBAT';
    attachedTenant.armorShield = (attachedTenant.armorShield || 0) + 50 + researchTetherBonus * 15;

    this.spawnFloatingPopup(attachedTenant.container.x, attachedTenant.container.y - 35, '⚡ Tenant Detached (20% Def)!', '#38bdf8');
    soundFx.playCastleHit();
    return true;
  }

  update(deltaMs: number): void {
    const dt = deltaMs / 1000;
    const store = useGameStore.getState();
    const castleAlive = store.defense.castleHp > 0;
    const isWaveActive = (store.invasion.isActive || this.invasion.getInvaders().some((i) => !i.isDead && !i.isRetreating)) && castleAlive;

    const castleGatePos = IsometricHelper.gridToScreen(CASTLE_GATE.x + 0.5, CASTLE_GATE.y + 0.5);

    // Research multipliers
    const researchAtkBonus = 1 + ((store.upgrades.tenantAttackCounter ?? 1) - 1) * 0.25;
    const researchHpBonus = ((store.upgrades.tenantDefenseBar ?? 1) - 1) * 40;
    const researchCdBonus = Math.min(0.6, ((store.upgrades.tenantCooldownSummon ?? 1) - 1) * 0.12);
    const spawnInterval = Math.max(5, BASE_SPAWN_INTERVAL * (1 - researchCdBonus));

    // ── Wave End Check: Re-anchor surviving detached tenants ──
    if (this.wasWaveActive && !isWaveActive) {
      for (const d of this.defenders) {
        if (!d.dead && d.home !== 'SUMMON') {
          d.isDetached = false;
          d.state = 'HARVESTING';
          d.target = undefined;
          this.spawnFloatingPopup(d.container.x, d.container.y - 30, '✨ Tenant Recovered', '#22c55e');
        }
      }
    }
    this.wasWaveActive = isWaveActive;

    // ── 1. Spawn / Re-summon Tenants for Establishments ──
    // Fallen tenants wait until post-wave / peace cooldown to be re-summoned with zero cost
    for (const tower of this.structures.getTowers()) {
      if (!castleAlive) continue;
      const cfg = GUARD_CONFIG[tower.id];
      if (!cfg) continue;

      const livingGuards = this.getLivingTenantsCount(tower.id);
      if (livingGuards >= MAX_PER_ESTABLISHMENT) {
        this.spawnTimers.set(tower.id, spawnInterval);
        continue;
      }

      // If in wave, killed tenants must wait until wave finish or pure cooldown
      const timer = (this.spawnTimers.get(tower.id) ?? spawnInterval) - dt;
      if (timer <= 0) {
        this.spawn(tower.id, tower.rect, cfg, DEFENDER_HP + researchHpBonus, Math.round(DEFENDER_DAMAGE * researchAtkBonus));
        this.spawnTimers.set(tower.id, spawnInterval);
      } else {
        this.spawnTimers.set(tower.id, timer);
      }
    }

    // Live counts for the Citadel Command / establishment windows
    const counts: Record<string, TenantCount> = {};
    for (const tower of this.structures.getTowers()) {
      if (!GUARD_CONFIG[tower.id]) continue;
      counts[tower.id] = {
        living: this.getLivingTenantsCount(tower.id),
        garrisoned: this.getGarrisonCount(tower.id),
        max: MAX_PER_ESTABLISHMENT,
      };
    }
    useTenantCounts.getState().publish(counts);

    const invaders = this.invasion
      .getInvaders()
      .filter((i) => !i.isDead && !i.isRetreating && (i.emerge ?? 0) <= 0 && i.container.active);

    // ── 2. Update Defenders & Tenants Behavior ──
    for (const d of [...this.defenders]) {
      if (d.dead || !d.container.active) continue;

      // Temporary Summons decay
      if (d.life !== undefined) {
        d.life -= dt;
        if (d.life <= 0) {
          this.kill(d);
          continue;
        }
      }

      // Temporary summons fight directly
      if (d.home === 'SUMMON') {
        this.updateSummonCombat(d, invaders, dt);
        continue;
      }

      // ── Slime Morale Buff Update ──
      if (d.activeSlimeBuff && d.activeSlimeBuff.duration > 0) {
        d.activeSlimeBuff.duration -= dt;
        if (d.activeSlimeBuff.regenPerSec && d.hp < d.maxHp) {
          d.hp = Math.min(d.maxHp, d.hp + d.activeSlimeBuff.regenPerSec * dt);
        }
        if (d.activeSlimeBuff.duration <= 0) {
          d.activeSlimeBuff = undefined;
        }
      }
      const slimeAtkMult = d.activeSlimeBuff?.attackMultiplier ?? 1.0;
      const slimeSpdMult = d.activeSlimeBuff?.speedMultiplier ?? 1.0;

      // ── Establishment Tenant Logic ──
      const homeTower = this.structures.getTowers().find((t) => t.id === d.home);
      const homeCenter = homeTower ? { x: homeTower.x, y: homeTower.y } : { x: d.postX, y: d.postY };
      const castleCenter = this.structures.getCastleTarget() ?? { x: castleGatePos.x, y: castleGatePos.y };

      // ── DETACHED COMBAT: Target enemies attacking parent establishment or Castle! ──
      if (d.isDetached || d.state === 'DETACHED_COMBAT') {
        this.updateGarrisonVisuals(d, false, true);

        // Find enemies attacking parent establishment or castle, or nearest invader
        if (!d.target || d.target.isDead || d.target.isRetreating) {
          d.target = invaders
            .sort((a, b) => {
              // Priority 1: Invaders targeting parent establishment or castle
              const aTargetHome = a.target?.kind === 'structure' && (a.target.structure.id === d.home || a.target.structure.id === 'CASTLE');
              const bTargetHome = b.target?.kind === 'structure' && (b.target.structure.id === d.home || b.target.structure.id === 'CASTLE');
              if (aTargetHome && !bTargetHome) return -1;
              if (!aTargetHome && bTargetHome) return 1;
              return this.dist(d, a.container) - this.dist(d, b.container);
            })[0];
        }

        if (d.target) {
          const tx = d.target.container.x;
          const ty = d.target.container.y;
          const dist = Math.hypot(tx - d.container.x, ty - d.container.y);

          if (dist <= DEFENDER_REACH) {
            if (d.sprite) faceCharacterSprite(d.sprite, tx - d.container.x, ty - d.container.y, false);
            d.cooldown -= dt;
            if (d.cooldown <= 0) {
              d.cooldown = 0.9;
              if (d.sprite) playCharacterAttack(d.sprite);
              const totalDmg = Math.round(d.damage * researchAtkBonus * slimeAtkMult);
              this.invasion.damageInvader(d.target, totalDmg, '⚔️');
            }
          } else {
            this.step(d, tx, ty, dt, DEFENDER_SPEED * 1.15 * slimeSpdMult);
          }
        } else {
          // Patrol between parent establishment and castle
          const distToHome = Math.hypot(homeCenter.x - d.container.x, homeCenter.y - d.container.y);
          if (distToHome > 30) {
            this.step(d, homeCenter.x, homeCenter.y, dt, DEFENDER_SPEED * slimeSpdMult);
          }
        }
        continue;
      }

      // ── ATTACHED GARRISON (Battle Active) ──
      if (isWaveActive) {
        const distToHome = Math.hypot(homeCenter.x - d.container.x, homeCenter.y - d.container.y);

        if (distToHome > 45) {
          d.state = 'RETREAT_TO_GARRISON';
          this.step(d, homeCenter.x, homeCenter.y, dt, DEFENDER_SPEED * 1.25);
          this.updateGarrisonVisuals(d, false, false);
        } else {
          d.state = 'GARRISONED';
          this.updateGarrisonVisuals(d, true, false);

          // ── Real-time Assistance: If home establishment is clear of local threats, 
          // assist and fight back against any invaders threatening other establishments or the Citadel ──
          const localThreat = invaders.find((inv) => Math.hypot(inv.container.x - homeCenter.x, inv.container.y - homeCenter.y) <= 130);
          
          if (!d.target || d.target.isDead || d.target.isRetreating) {
            if (localThreat) {
              // Priority 1: Defend own establishment if directly threatened
              d.target = localThreat;
            } else {
              // Priority 2: Assist Realm! Target enemies attacking the Castle, nearest establishment, or roaming
              d.target = invaders
                .slice()
                .sort((a, b) => {
                  const aAttackingCore = a.target?.kind === 'structure';
                  const bAttackingCore = b.target?.kind === 'structure';
                  if (aAttackingCore && !bAttackingCore) return -1;
                  if (!aAttackingCore && bAttackingCore) return 1;
                  return this.dist(d, a.container) - this.dist(d, b.container);
                })[0];
            }
          }

          if (d.target) {
            const tx = d.target.container.x;
            const ty = d.target.container.y;
            const dist = Math.hypot(tx - d.container.x, ty - d.container.y);

            if (dist <= DEFENDER_REACH) {
              if (d.sprite) faceCharacterSprite(d.sprite, tx - d.container.x, ty - d.container.y, false);
              d.cooldown -= dt;
              if (d.cooldown <= 0) {
                d.cooldown = 1.0;
                if (d.sprite) playCharacterAttack(d.sprite);
                this.invasion.damageInvader(d.target, Math.round(d.damage * researchAtkBonus));
              }
            } else {
              this.step(d, tx, ty, dt, DEFENDER_SPEED);
            }
          } else {
            // Idle around the garrison perimeter
            const distToPost = Math.hypot(d.postX - d.container.x, d.postY - d.container.y);
            if (distToPost > 8) {
              this.step(d, d.postX, d.postY, dt, DEFENDER_SPEED * 0.7);
            }
          }
        }
      } else {
        // ── Peacetime: Harvest Goods & Haul to Castle ──
        this.updateGarrisonVisuals(d, false, false);

        if ((d.state as string) === 'RETREAT_TO_GARRISON' || (d.state as string) === 'GARRISONED' || (d.state as string) === 'DETACHED_COMBAT') {
          d.state = 'HARVESTING';
          d.workTimer = 0;
        }

        if (d.state === 'HARVESTING') {
          // Find harvest target point
          if (!d.targetNodePos) {
            const nodeTile = TASK_NODE_LOCATIONS[d.harvestTask] ?? { x: 16, y: 16 };
            const jitterX = Math.sin(parseInt(d.id, 36) || 0) * 1.5;
            const jitterY = Math.cos(parseInt(d.id, 36) || 0) * 1.5;
            d.targetNodePos = IsometricHelper.gridToScreen(nodeTile.x + jitterX, nodeTile.y + jitterY);
          }

          const distToNode = Math.hypot(d.targetNodePos.x - d.container.x, d.targetNodePos.y - d.container.y);

          if (distToNode > 20) {
            this.step(d, d.targetNodePos.x, d.targetNodePos.y, dt, DEFENDER_SPEED);
          } else {
            // At node: Work / Harvest
            d.workTimer += dt;
            if (d.sprite && Math.floor(d.workTimer * 4) % 2 === 0) {
              playCharacterWork(d.sprite);
            }

            if (d.workTimer >= 3.0) {
              // Collected goods!
              const cfg = GUARD_CONFIG[d.home as TowerId];
              d.cargo = { ...(cfg?.yieldRes ?? { wood: 1 }) };
              d.workTimer = 0;
              d.state = 'HAULING_TO_CASTLE';
              this.spawnFloatingPopup(d.container.x, d.container.y - 25, `${cfg?.resIcon ?? '📦'} Collected!`, '#a7f3d0');
            }
          }
        } else if (d.state === 'HAULING_TO_CASTLE') {
          // Walk to Castle Gate
          const distToGate = Math.hypot(castleGatePos.x - d.container.x, castleGatePos.y - d.container.y);

          if (distToGate > 28) {
            this.step(d, castleGatePos.x, castleGatePos.y, dt, DEFENDER_SPEED * 0.9);
          } else {
            // Deposit cargo into player's stockpile!
            if (Object.keys(d.cargo).length > 0) {
              useGameStore.getState().addResources(d.cargo);
              const cfg = GUARD_CONFIG[d.home as TowerId];
              this.spawnFloatingPopup(castleGatePos.x + (Math.random() - 0.5) * 20, castleGatePos.y - 35, `+${cfg?.resIcon ?? '💎'} Deposited!`, '#38bdf8');
              soundFx.playClick();
              d.cargo = {};
            }
            d.targetNodePos = undefined;
            d.state = 'HARVESTING';
          }
        }
      }

      // Regeneration when out of combat
      if (!d.target && d.hp < d.maxHp) {
        d.hp = Math.min(d.maxHp, d.hp + IDLE_REGEN * dt);
        this.drawHp(d);
      }

      // Sprite facing & walking animation
      const mx = d.container.x - d.lastX;
      const my = d.container.y - d.lastY;
      if (d.sprite && Math.hypot(mx, my) > 0.02) faceCharacterSprite(d.sprite, mx, my, true);
      else if (d.sprite && !(d.target && Math.hypot(d.target.container.x - d.container.x, d.target.container.y - d.container.y) <= DEFENDER_REACH)) {
        faceCharacterSprite(d.sprite, 0, 1, false);
      }
      d.lastX = d.container.x;
      d.lastY = d.container.y;
    }
  }

  private updateSummonCombat(d: Defender, invaders: ActiveInvader[], dt: number): void {
    if (!d.target || d.target.isDead || d.target.isRetreating) {
      d.target = invaders
        .sort((a, b) => this.dist(d, a.container) - this.dist(d, b.container))[0];
    }

    const tx = d.target ? d.target.container.x : d.postX;
    const ty = d.target ? d.target.container.y : d.postY;
    const dist = Math.hypot(tx - d.container.x, ty - d.container.y);

    if (d.target && dist <= DEFENDER_REACH) {
      if (d.sprite) faceCharacterSprite(d.sprite, tx - d.container.x, ty - d.container.y, false);
      d.cooldown -= dt;
      if (d.cooldown <= 0) {
        d.cooldown = 1;
        if (d.sprite) playCharacterAttack(d.sprite);
        this.invasion.damageInvader(d.target, d.damage);
      }
    } else if (dist > 3) {
      this.step(d, tx, ty, dt, DEFENDER_SPEED);
    }
  }

  private updateGarrisonVisuals(d: Defender, isGarrisoned: boolean, isDetached: boolean = false): void {
    if (!d.garrisonBadge) return;
    d.garrisonBadge.clear();
    if (!isGarrisoned && !isDetached) return;

    if (isDetached) {
      // Orange/Red angry counter-attack badge
      d.garrisonBadge.fillStyle(0xef4444, 0.9);
      d.garrisonBadge.fillCircle(0, -32, 6);
      d.garrisonBadge.lineStyle(1.5, 0xfbbf24, 1);
      d.garrisonBadge.strokeCircle(0, -32, 6);
    } else {
      // Small glowing cyan defense shield icon over the garrison minion
      d.garrisonBadge.fillStyle(0x0284c7, 0.85);
      d.garrisonBadge.fillCircle(0, -32, 6);
      d.garrisonBadge.lineStyle(1.5, 0x38bdf8, 1);
      d.garrisonBadge.strokeCircle(0, -32, 6);
    }
  }

  private dist(d: Defender, p: { x: number; y: number }): number {
    return Math.hypot(p.x - d.container.x, p.y - d.container.y);
  }

  private step(d: Defender, tx: number, ty: number, dt: number, speed: number = DEFENDER_SPEED): void {
    const next = this.nav.steer(d, d.container.x, d.container.y, tx, ty, dt);
    const dx = next.x - d.container.x;
    const dy = next.y - d.container.y;
    const len = Math.hypot(dx, dy) || 1;
    const stepLen = Math.min(len, speed * dt);
    const moved = this.nav.pushOut(d.container.x + (dx / len) * stepLen, d.container.y + (dy / len) * stepLen, 0.18);
    d.container.setPosition(moved.x, moved.y);
  }

  private spawn(
    home: TowerId,
    rect: TileRect,
    cfg: { unitClass: UnitClass; task: HarvestTask; yieldRes: Partial<Resources>; resIcon: string },
    hp: number = DEFENDER_HP,
    damage: number = DEFENDER_DAMAGE
  ): void {
    const ringRect = expandRect(rect, 1);
    const ring: Array<{ x: number; y: number }> = [];
    for (let y = ringRect.y; y < ringRect.y + ringRect.h; y++) {
      for (let x = ringRect.x; x < ringRect.x + ringRect.w; x++) {
        const inside = x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
        if (!inside && !this.nav.isSolidTile(x, y) && isLandTile(x, y)) ring.push({ x, y });
      }
    }
    const spot = ring[Math.floor(Math.random() * ring.length)] ?? { x: rect.x - 1, y: rect.y };
    const pos = IsometricHelper.gridToScreen(spot.x + (Math.random() - 0.5) * 0.4, spot.y + (Math.random() - 0.5) * 0.4);
    this.createUnit(home, cfg.unitClass, pos, hp, damage, cfg.task, cfg.yieldRes, cfg.resIcon);
  }

  private createUnit(
    home: TowerId | 'SUMMON',
    unitClass: UnitClass,
    pos: { x: number; y: number },
    hp: number,
    damage: number,
    task: HarvestTask,
    yieldRes: Partial<Resources>,
    resIcon: string,
    summon?: SummonOptions
  ): void {
    const container = this.scene.add.container(pos.x, pos.y);
    const shadow = this.scene.add.ellipse(0, 3, 14, 6, 0x000000, 0.35);
    const hpBar = this.scene.add.graphics();
    const garrisonBadge = this.scene.add.graphics();
    const sprite = createMinionSprite(this.scene, unitClass) ?? undefined;

    if (sprite) {
      sprite.setScale(sprite.scaleX * 0.8);
      if (summon?.tint !== undefined) sprite.setTint(summon.tint);
      container.add([shadow, sprite, hpBar, garrisonBadge]);
    } else {
      const body = this.scene.add.graphics();
      body.fillStyle(0x64748b, 1);
      body.fillEllipse(0, -8, 10, 14);
      body.fillStyle(0x38bdf8, 1);
      body.fillRect(-2, -14, 4, 3);
      container.add([shadow, body, hpBar, garrisonBadge]);
    }
    this.layer.add(container);
    container.setScale(0.1);
    this.scene.tweens.add({ targets: container, scale: 1, duration: 380, ease: 'Back.easeOut' });

    const defender: Defender = {
      id: `def_${this.nextId++}`,
      home,
      unitClass,
      state: 'HARVESTING',
      container,
      sprite,
      hpBar,
      garrisonBadge,
      damage,
      tag: summon?.tag,
      life: summon?.life,
      hp,
      maxHp: hp,
      cooldown: 0.5,
      dead: false,
      postX: pos.x,
      postY: pos.y,
      lastX: pos.x,
      lastY: pos.y,
      harvestTask: task,
      workTimer: 0,
      cargo: {},
      takeHit: (damage: number) => this.hit(defender, damage),
    };
    this.defenders.push(defender);
  }

  private drawHp(d: Defender): void {
    d.hpBar.clear();
    if (d.hp >= d.maxHp) return;
    d.hpBar.fillStyle(0x000000, 0.7);
    d.hpBar.fillRect(-9, -26, 18, 4);
    d.hpBar.fillStyle(0x38bdf8, 1);
    d.hpBar.fillRect(-8, -25, 16 * Math.max(0, d.hp / d.maxHp), 2);
  }

  private hit(d: Defender, damage: number): void {
    if (d.dead) return;
    d.hp -= damage;
    this.drawHp(d);
    if (d.sprite) {
      const sprite = d.sprite;
      sprite.setTintFill(0xffffff);
      this.scene.time.delayedCall(60, () => sprite.active && sprite.clearTint());
    }
    if (d.hp <= 0) this.kill(d);
  }

  private kill(d: Defender): void {
    if (d.dead) return;
    d.dead = true;
    this.defenders = this.defenders.filter((o) => o !== d);
    this.scene.tweens.add({ targets: d.container, scale: 0.1, alpha: 0, duration: 260, onComplete: () => d.container.destroy() });
  }

  /** No floating text on the map: the event is narrated in the activity log tray. */
  private spawnFloatingPopup(_x: number, _y: number, text: string, color: string): void {
    logFloatingText(text, color);
  }

  destroy(): void {
    for (const d of this.defenders) d.container.destroy();
    this.defenders = [];
  }
}

