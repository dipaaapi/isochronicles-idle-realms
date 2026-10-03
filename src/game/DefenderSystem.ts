import { markShadow } from './graphicsFx';
import Phaser from 'phaser';
import { IsometricHelper } from './IsometricHelper';
import { Navigation, NavAgent } from './Navigation';
import type { ActiveInvader, InvaderBlocker, InvasionManager } from './InvasionManager';
import type { StructureManager } from './StructureManager';
import { useGameStore } from '../state/useGameStore';
import { CASTLE_GATE, GRID_SIZE, PORTAL_SITES, ROAD_TILES, TileRect, expandRect, isLandTile, rectCenter, type PortalSite } from '../state/buildingLayout';
import type { ResourceBuildingId, TowerId, Resources } from '../types/state';
import { UNIT_CLASSES, type UnitClass, type HarvestTask } from '../types/game';
import { createMinionSprite, faceCharacterSprite, playCharacterAttack, playCharacterWork } from './sprites/CharacterSprites';
import { soundFx } from './audio/soundFx';
import { useTenantCounts, type TenantCount } from '../state/tenantCounts';
import { logFloatingText, logMessage, resourceName } from '../state/activityLog';
import { CREW_CONFIG, ESTABLISHMENT_CREWS, vengeanceExtraInvaders, type GatherJob, type GatherSource } from '../state/establishmentCrews';

export type DefenderState =
  | 'HARVESTING' | 'HAULING_TO_CASTLE' | 'RETREAT_TO_GARRISON' | 'GARRISONED' | 'DETACHED_COMBAT'
  // Portal expedition: walk into a rift, gather in the human realm, come back loaded
  | 'TO_PORTAL' | 'IN_HUMAN_REALM';

type GridPoint = { x: number; y: number };

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
  /** The gather job (tiles + yield) of the current trip. */
  job?: GatherJob;
  targetNodePos?: { x: number; y: number };
  workTimer: number;
  cargo: Partial<Resources>;
  /** Rift the tenant is using for a human-realm expedition. */
  portal?: PortalSite;
  /** Seconds left gathering in the human realm. */
  awayTimer?: number;
  takeHit: (damage: number) => void;
}

const MAX_PER_ESTABLISHMENT = 5;
const BASE_SPAWN_INTERVAL = CREW_CONFIG.spawnIntervalSeconds; // base seconds between tenant spawns
const DEFENDER_HP = 80;
const DEFENDER_DAMAGE = 16;
const DEFENDER_SPEED = 72;
const DEFENDER_REACH = 28;
const IDLE_REGEN = 4;

/** Harvest task (for the work animation / Slime logic) that best matches a gather source. */
const SOURCE_TASK: Record<GatherSource, HarvestTask> = {
  OCEAN: 'FISH',
  GRASS: 'WOOD',
  PAVEMENT: 'STONE',
  ESTABLISHMENT: 'METAL',
  PORTAL: 'ESSENCE',
};

/** "3 Metal, 1 Scrap Metal" in both languages. */
const describeLoot = (loot: Partial<Resources>): { en: string; tl: string } => {
  const parts = Object.entries(loot).filter(([, n]) => (n ?? 0) > 0).map(([key, n]) => ({ n, name: resourceName(key) }));
  return {
    en: parts.map((p) => `${p.n} ${p.name.en}`).join(', '),
    tl: parts.map((p) => `${p.n} ${p.name.tl}`).join(', '),
  };
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
    this.createUnit('SUMMON', opts.unitClass, pos, opts.hp, opts.damage, 'WOOD', opts);
  }

  /** Living summons with this tag. */
  summonCount(tag: string): number {
    return this.defenders.filter((d) => !d.dead && d.tag === tag).length;
  }

  /** Living defenders / tenants on the island (not those away in the human realm). */
  getDefenders(): Defender[] {
    return this.defenders.filter((d) => d.state !== 'IN_HUMAN_REALM');
  }

  /** Invaders fight defenders that get in their way. */
  getBlockers(): InvaderBlocker[] {
    return this.getDefenders();
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
        if (!d.dead && d.home !== 'SUMMON' && d.state !== 'IN_HUMAN_REALM') {
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
      const crew = ESTABLISHMENT_CREWS[tower.id as ResourceBuildingId];
      if (!crew) continue;

      const livingGuards = this.getLivingTenantsCount(tower.id);
      if (livingGuards >= MAX_PER_ESTABLISHMENT) {
        this.spawnTimers.set(tower.id, spawnInterval);
        continue;
      }

      // If in wave, killed tenants must wait until wave finish or pure cooldown
      const timer = (this.spawnTimers.get(tower.id) ?? spawnInterval) - dt;
      if (timer <= 0) {
        this.spawn(tower.id, tower.rect, crew.general, DEFENDER_HP + researchHpBonus, Math.round(DEFENDER_DAMAGE * researchAtkBonus));
        this.spawnTimers.set(tower.id, spawnInterval);
      } else {
        this.spawnTimers.set(tower.id, timer);
      }
    }

    // Live counts for the Citadel Command / establishment windows
    const counts: Record<string, TenantCount> = {};
    for (const tower of this.structures.getTowers()) {
      if (!ESTABLISHMENT_CREWS[tower.id as ResourceBuildingId]) continue;
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

      // ── Human-realm expedition: out of reach of the fight until they come back ──
      if (d.state === 'IN_HUMAN_REALM') {
        this.updateExpedition(d, dt, isWaveActive);
        continue;
      }

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

        if (d.state === 'TO_PORTAL' && d.portal) {
          // Rifts sit on the ocean corners: step onto the exit tile and vanish into the swirl
          const rift = IsometricHelper.gridToScreen(d.portal.exit.x, d.portal.exit.y);
          if (Math.hypot(rift.x - d.container.x, rift.y - d.container.y) > 10) {
            this.step(d, rift.x, rift.y, dt, DEFENDER_SPEED);
          } else {
            this.enterHumanRealm(d);
          }
        } else if (d.state === 'HARVESTING' || d.state === 'TO_PORTAL') {
          d.state = 'HARVESTING';
          // Pick the next trip: a rift expedition, or a gather job on its own kind of tiles
          if (!d.targetNodePos) this.planTrip(d);
          if (d.state === 'HARVESTING' && d.targetNodePos) {
            const distToNode = Math.hypot(d.targetNodePos.x - d.container.x, d.targetNodePos.y - d.container.y);
            if (distToNode > 12) {
              this.step(d, d.targetNodePos.x, d.targetNodePos.y, dt, DEFENDER_SPEED);
            } else {
              // At the spot: work / harvest
              d.workTimer += dt;
              if (d.sprite && Math.floor(d.workTimer * 4) % 2 === 0) playCharacterWork(d.sprite);
              if (d.workTimer >= CREW_CONFIG.gatherSeconds) {
                d.cargo = { ...(d.job?.yield ?? { wood: 1 }) };
                d.workTimer = 0;
                d.state = 'HAULING_TO_CASTLE';
              }
            }
          }
        } else if (d.state === 'HAULING_TO_CASTLE') {
          // Walk to Castle Gate
          const distToGate = Math.hypot(castleGatePos.x - d.container.x, castleGatePos.y - d.container.y);

          if (distToGate > 28) {
            this.step(d, castleGatePos.x, castleGatePos.y, dt, DEFENDER_SPEED * 0.9);
          } else {
            // Deposit cargo into player's stockpile, narrated per resource in the activity log
            if (Object.keys(d.cargo).length > 0) {
              useGameStore.getState().addResources(d.cargo);
              const source = d.job ? CREW_CONFIG.sources[d.job.source] : CREW_CONFIG.sources.HUMAN_REALM;
              for (const [key, amount] of Object.entries(d.cargo)) {
                if (!amount) continue;
                logMessage('tenantGathered', { resource: resourceName(key), source: { en: source.en.toLowerCase(), tl: source.tl.toLowerCase() } },
                  { mergeKey: `tenant:${key}:${source.en}`, amount, icon: source.icon });
              }
              soundFx.playClick();
              d.cargo = {};
            }
            d.targetNodePos = undefined;
            d.job = undefined;
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

  /** Walkable land tiles hugging an establishment's footprint. */
  private ringAround(rect: TileRect): GridPoint[] {
    const ringRect = expandRect(rect, 1);
    const ring: GridPoint[] = [];
    for (let y = ringRect.y; y < ringRect.y + ringRect.h; y++) {
      for (let x = ringRect.x; x < ringRect.x + ringRect.w; x++) {
        const inside = x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
        if (!inside && !this.nav.isSolidTile(x, y) && isLandTile(x, y)) ring.push({ x, y });
      }
    }
    return ring;
  }

  private spawn(home: TowerId, rect: TileRect, unitClass: UnitClass, hp: number = DEFENDER_HP, damage: number = DEFENDER_DAMAGE): void {
    const ring = this.ringAround(rect);
    const spot = ring[Math.floor(Math.random() * ring.length)] ?? { x: rect.x - 1, y: rect.y };
    const pos = IsometricHelper.gridToScreen(spot.x + (Math.random() - 0.5) * 0.4, spot.y + (Math.random() - 0.5) * 0.4);
    this.createUnit(home, unitClass, pos, hp, damage, UNIT_CLASSES[unitClass]?.preferredTask ?? 'WOOD');
  }

  // ── Gathering trips ─────────────────────────────────────────────────────────

  /** Chooses the next trip: a rift expedition when a slot is free, otherwise one of the crew's gather jobs. */
  private planTrip(d: Defender): void {
    const crew = ESTABLISHMENT_CREWS[d.home as ResourceBuildingId];
    const homeTower = this.structures.getTowers().find((t) => t.id === d.home);
    if (!crew || !homeTower) return;

    const exp = crew.expedition;
    if (exp) {
      const away = this.defenders.filter((o) => !o.dead && o.home === d.home && (o.state === 'TO_PORTAL' || o.state === 'IN_HUMAN_REALM')).length;
      if (away < exp.slots && Math.random() < CREW_CONFIG.expedition.chance) {
        d.portal = this.nearestPortal(homeTower.rect);
        d.job = undefined;
        d.targetNodePos = undefined;
        d.state = 'TO_PORTAL';
        return;
      }
    }

    const job = crew.gather[Math.floor(Math.random() * crew.gather.length)];
    const tile = this.pickGatherTile(job.source, homeTower.rect);
    d.job = job;
    d.harvestTask = SOURCE_TASK[job.source];
    d.workTimer = 0;
    d.targetNodePos = IsometricHelper.gridToScreen(tile.x + (Math.random() - 0.5) * 0.5, tile.y + (Math.random() - 0.5) * 0.5);
  }

  private nearestPortal(rect: TileRect): PortalSite {
    const c = rectCenter(rect);
    return PORTAL_SITES.slice().sort((a, b) => Math.hypot(a.tile.x - c.x, a.tile.y - c.y) - Math.hypot(b.tile.x - c.x, b.tile.y - c.y))[0];
  }

  /** A tile of the job's terrain near the establishment (falls back to its own doorstep). */
  private pickGatherTile(source: GatherSource, rect: TileRect): GridPoint {
    const c = rectCenter(rect);
    const dist = (p: GridPoint) => Math.hypot(p.x - c.x, p.y - c.y);
    const pickNear = (tiles: GridPoint[], take: number): GridPoint | undefined => {
      const nearest = tiles.slice().sort((a, b) => dist(a) - dist(b)).slice(0, take);
      return nearest[Math.floor(Math.random() * nearest.length)];
    };
    const radius = CREW_CONFIG.searchRadius;
    const roads = new Set(ROAD_TILES.map((t) => `${t.x},${t.y}`));
    const last = GRID_SIZE - 1;
    let tile: GridPoint | undefined;

    switch (source) {
      case 'OCEAN': {
        // Wade out into the ocean ring (never onto the corner rifts); the ±0.25 trip jitter stays in the water tile
        const ocean: GridPoint[] = [];
        for (let i = 1; i < last; i++) ocean.push({ x: i, y: 0.05 }, { x: i, y: last - 0.05 }, { x: 0.05, y: i }, { x: last - 0.05, y: i });
        tile = pickNear(ocean, 6);
        break;
      }
      case 'GRASS':
      case 'PAVEMENT': {
        const wantRoad = source === 'PAVEMENT';
        const tiles: GridPoint[] = [];
        for (let y = 1; y < last; y++) {
          for (let x = 1; x < last; x++) {
            if (!isLandTile(x, y) || this.nav.isSolidTile(x, y)) continue;
            if (roads.has(`${x},${y}`) !== wantRoad || dist({ x, y }) > radius + 2) continue;
            tiles.push({ x, y });
          }
        }
        tile = pickNear(tiles, 8);
        break;
      }
      case 'PORTAL': {
        const rift = this.nearestPortal(rect);
        const around: GridPoint[] = [];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const p = { x: rift.exit.x + dx, y: rift.exit.y + dy };
            if (isLandTile(p.x, p.y) && !this.nav.isSolidTile(p.x, p.y)) around.push(p);
          }
        }
        tile = around[Math.floor(Math.random() * around.length)];
        break;
      }
      case 'ESTABLISHMENT':
        break;
    }
    if (tile) return tile;
    const ring = this.ringAround(rect);
    return ring[Math.floor(Math.random() * ring.length)] ?? { x: rect.x - 1, y: rect.y };
  }

  /** The tenant steps through the rift and vanishes into the human realm. */
  private enterHumanRealm(d: Defender): void {
    const { minSeconds, maxSeconds } = CREW_CONFIG.expedition;
    d.state = 'IN_HUMAN_REALM';
    d.awayTimer = minSeconds + Math.random() * (maxSeconds - minSeconds);
    d.target = undefined;
    d.container.setVisible(false);
    const portal = d.portal ?? PORTAL_SITES[0];
    logMessage('expeditionDeparts', { name: this.tenantName(d), portal: portal.name });
  }

  /** Counts down the trip; comes back through the same rift with loot once no wave is raging. */
  private updateExpedition(d: Defender, dt: number, isWaveActive: boolean): void {
    d.awayTimer = Math.max(0, (d.awayTimer ?? 0) - dt);
    if (d.awayTimer > 0 || isWaveActive) return; // they wait out a battle on the other side

    const crew = ESTABLISHMENT_CREWS[d.home as ResourceBuildingId];
    const portal = d.portal ?? PORTAL_SITES[0];
    const exit = IsometricHelper.gridToScreen(portal.exit.x, portal.exit.y);
    d.container.setPosition(exit.x, exit.y);
    d.lastX = exit.x;
    d.lastY = exit.y;
    d.container.setVisible(true);
    d.cargo = { ...(crew?.expedition?.yield ?? {}) };
    d.job = undefined;
    d.portal = undefined;
    d.state = 'HAULING_TO_CASTLE';
    logMessage('expeditionReturns', { name: this.tenantName(d), loot: describeLoot(d.cargo) }, { icon: crew?.expedition?.icon });

    // The humans notice: every few raids, one more of them joins the next wave
    const store = useGameStore.getState();
    const before = vengeanceExtraInvaders(store.invasion.vengeance ?? 0);
    store.stirVengeance(CREW_CONFIG.expedition.vengeancePerTrip);
    const after = vengeanceExtraInvaders(useGameStore.getState().invasion.vengeance ?? 0);
    if (after > before) logMessage('vengeanceStirs', { extra: after });
  }

  private tenantName(d: Defender): { en: string; tl: string } {
    const cfg = UNIT_CLASSES[d.unitClass];
    return { en: `${cfg?.nameEn ?? d.unitClass} tenant`, tl: `tenant na ${cfg?.name ?? d.unitClass}` };
  }

  private createUnit(
    home: TowerId | 'SUMMON',
    unitClass: UnitClass,
    pos: { x: number; y: number },
    hp: number,
    damage: number,
    task: HarvestTask,
    summon?: SummonOptions
  ): void {
    const container = this.scene.add.container(pos.x, pos.y);
    const shadow = markShadow(this.scene.add.ellipse(0, 3, 14, 6, 0x000000, 0.35));
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

