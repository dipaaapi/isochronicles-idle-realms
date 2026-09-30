import Phaser from 'phaser';
import { IsometricHelper } from '../IsometricHelper';
import { Navigation } from '../Navigation';
import type { InvasionManager } from '../InvasionManager';
import type { ActiveInvader } from '../invaders/types';
import type { WorkerManager } from '../WorkerManager';
import type { WorkerInstance } from '../workers/types';
import type { StructureManager } from '../StructureManager';
import type { DefenderSystem } from '../DefenderSystem';
import { useGameStore } from '../../state/useGameStore';
import { INVADER_CONFIGS } from '../../types/game';
import { isBuildingOperational } from '../../state/defenseStats';
import { soundFx } from '../audio/soundFx';
import { activateMod, advanceCombatClock, auras, isModActive, resetCombatMods } from './combatMods';

/** Screen pixels per grid tile along one axis (for knockbacks and visuals). */
const TILE_PX = (() => {
  const a = IsometricHelper.gridToScreen(0, 0);
  const b = IsometricHelper.gridToScreen(1, 0);
  return Math.hypot(b.x - a.x, b.y - a.y);
})();

type Point = { x: number; y: number };

/** Distance in grid tiles between two world points. */
const tilesBetween = (a: Point, b: Point): number => {
  const ga = Navigation.toGrid(a.x, a.y);
  const gb = Navigation.toGrid(b.x, b.y);
  return Math.hypot(ga.x - gb.x, ga.y - gb.y);
};

const byDistanceTo = (p: Point) => (a: { container: Point }, b: { container: Point }) =>
  tilesBetween(a.container, p) - tilesBetween(b.container, p);

/** Ground effects that last a few seconds: magma, time stasis, tidal surge. */
interface Zone {
  kind: 'magma' | 'stasis' | 'tidal';
  x: number;
  y: number;
  radiusTiles: number;
  left: number;
  tick: number;
  gfx: Phaser.GameObjects.Graphics;
}

/** The Slime and the Ent cannot be hurt by invaders. */
const isImmune = (w: WorkerInstance) => w.unitClass === 'AQUA_SLIME' || w.unitClass === 'TREANT';

/**
 * Every unit's active skill and passive, plus the establishment skills fired
 * from the Establishment modal. Beasts cast while fighting; invaders cast when
 * a target is in reach; each has its own cooldown.
 */
export class SkillSystem {
  private cooldowns = new Map<string, number>();
  private zones: Zone[] = [];
  private repairCarry = 0;
  private auraTick = 0;

  constructor(
    private scene: Phaser.Scene,
    private layer: Phaser.GameObjects.Container,
    private workers: WorkerManager,
    private invasion: InvasionManager,
    private structures: StructureManager,
    private defenders: DefenderSystem
  ) {
    resetCombatMods();
    invasion.onInvaderKilled = (inv) => this.onInvaderKilled(inv);
  }

  update(deltaMs: number): void {
    const dt = deltaMs / 1000;
    advanceCombatClock(dt);
    for (const [key, left] of this.cooldowns) if (left > 0) this.cooldowns.set(key, left - dt);

    const store = useGameStore.getState();
    const invaders = this.invasion
      .getInvaders()
      .filter((i) => !i.isDead && !i.isRetreating && (i.emerge ?? 0) <= 0 && i.container.active);
    const workers = this.workers.getWorkers().filter((w) => w.hp > 0 && w.container?.active);

    auras.cyberCommand = invaders.some((i) => i.type === 'MECHA_VALKYRIE');
    const { castleHp, castleMaxHp } = store.defense;
    auras.bloodFrenzy = isModActive('bloodFrenzy') ||
      (store.castleBuilt && castleHp > 0 && castleHp < castleMaxHp * 0.3 && isBuildingOperational(store.resourceBuildings.KENNEL));

    this.rulerPassives(dt, workers);
    for (const cast of store.takeSkillCasts()) this.castStructureSkill(cast, invaders, workers);
    this.updateZones(dt, invaders, workers);

    if (!store.invasion.isActive || invaders.length === 0) return;
    for (const w of workers) if ((w.stunTimer ?? 0) <= 0) this.beastSkill(w, invaders, workers);
    for (const inv of invaders) if ((inv.frozenTimer ?? 0) <= 0 && (inv.charmTimer ?? 0) <= 0) this.invaderSkill(inv, invaders, workers);
  }

  destroy(): void {
    for (const z of this.zones) z.gfx.destroy();
    this.zones = [];
    this.invasion.onInvaderKilled = undefined;
    resetCombatMods();
  }

  /** Starts `key`'s cooldown and returns true when it was ready. */
  private ready(key: string, cooldown: number): boolean {
    if ((this.cooldowns.get(key) ?? 0) > 0) return false;
    this.cooldowns.set(key, cooldown);
    return true;
  }

  // ── Ruler passives ──────────────────────────────────────────────────────────

  private rulerPassives(dt: number, workers: WorkerInstance[]): void {
    const store = useGameStore.getState();
    // World Tree Roots: the Ent mends the citadel walls (+25 HP/s)
    const { castleHp, castleMaxHp } = store.defense;
    if (store.castleBuilt && castleHp > 0 && castleHp < castleMaxHp && workers.some((w) => w.unitClass === 'TREANT')) {
      this.repairCarry += 25 * dt;
      if (this.repairCarry >= 1) {
        const heal = Math.floor(this.repairCarry);
        this.repairCarry -= heal;
        useGameStore.setState((s) => ({ defense: { ...s.defense, castleHp: Math.min(s.defense.castleMaxHp, s.defense.castleHp + heal) } }));
      }
    }
    // Immune Jelly: allies near the Slime regain 1% max HP per second (10% every 10s)
    this.auraTick += dt;
    if (this.auraTick < 1) return;
    this.auraTick = 0;
    const slime = workers.find((w) => w.unitClass === 'AQUA_SLIME');
    if (!slime) return;
    for (const ally of workers) {
      if (ally === slime || ally.hp >= ally.maxHp || tilesBetween(ally.container, slime.container) > 3) continue;
      ally.hp = Math.min(ally.maxHp, ally.hp + Math.max(1, Math.round(ally.maxHp * 0.01)));
    }
  }

  // ── Beast skills ────────────────────────────────────────────────────────────

  private beastSkill(w: WorkerInstance, invaders: ActiveInvader[], workers: WorkerInstance[]): void {
    const near = (tiles: number) => invaders.filter((i) => tilesBetween(i.container, w.container) <= tiles).sort(byDistanceTo(w.container));
    const atk = Math.max(10, w.attackPower || 20);
    const key = `${w.id}:skill`;

    switch (w.unitClass) {
      case 'TREANT': {
        // Nature's Grasp: root every ground invader within 5 tiles for 6s
        const targets = near(5).filter((i) => !INVADER_CONFIGS[i.type].flying);
        if (targets.length === 0 || !this.ready(key, 28)) return;
        for (const i of targets) this.invasion.applySlow(i, 0.02, 6);
        this.ring(w.container, 5, 0x22c55e);
        this.shout(w, "🌿 Nature's Grasp");
        return;
      }
      case 'AQUA_SLIME': {
        // Primordial Tsunami: heal every ally 150 and wash nearby invaders 3 tiles back
        const hurt = workers.some((a) => a.hp < a.maxHp * 0.7);
        const close = near(3);
        if ((!hurt && close.length === 0) || !this.ready(key, 20)) return;
        for (const a of workers) a.hp = Math.min(a.maxHp, a.hp + 150);
        for (const i of close) this.invasion.knockback(i, w.container.x, w.container.y, TILE_PX * 3);
        this.ring(w.container, 3, 0x38bdf8);
        this.shout(w, '🌊 Primordial Tsunami');
        return;
      }
    }

    if (w.status !== 'COMBAT') return;
    switch (w.unitClass) {
      case 'GOLEM': {
        // Seismic Taunt: the 5 nearest invaders must attack the Golem; +50% armor for 8s
        const targets = near(4).slice(0, 5);
        if (targets.length === 0 || !this.ready(key, 15)) return;
        for (const i of targets) {
          i.tauntTimer = 8;
          i.tauntBy = w;
          i.retargetTimer = 0;
        }
        w.armorBuffTimer = 8;
        this.ring(w.container, 2, 0xa8a29e);
        this.shout(w, '🪨 Seismic Taunt');
        return;
      }
      case 'MERMAN': {
        // Abyssal Pierce: a trident thrust through a line of invaders, shredding armor 30%
        const target = near(4)[0];
        if (!target || !this.ready(key, 10)) return;
        const dx = target.container.x - w.container.x;
        const dy = target.container.y - w.container.y;
        const len = Math.hypot(dx, dy) || 1;
        const reach = TILE_PX * 5;
        for (const i of invaders) {
          const px = i.container.x - w.container.x;
          const py = i.container.y - w.container.y;
          const along = (px * dx + py * dy) / len;
          const off = Math.abs(px * dy - py * dx) / len;
          if (along < 0 || along > reach || off > TILE_PX * 0.7) continue;
          i.vulnTimer = 6;
          this.invasion.damageInvader(i, atk * 2, '🔱');
        }
        this.beam(w.container, { x: w.container.x + (dx / len) * reach, y: w.container.y + (dy / len) * reach }, 0x06b6d4);
        this.shout(w, '🔱 Abyssal Pierce');
        return;
      }
      case 'KRAKEN': {
        // Abyssal Grip: four tentacles slam the nearest invaders with a water splash
        const targets = near(5).slice(0, 4);
        if (targets.length === 0 || !this.ready(key, 25)) return;
        for (const t of targets) {
          this.invasion.damageInvader(t, Math.round(atk * 2.5), '🐙');
          this.invasion.applySlow(t, 0.5, 2);
          for (const o of invaders) {
            if (o !== t && tilesBetween(o.container, t.container) <= 1) this.invasion.damageInvader(o, Math.round(atk * 1.25), undefined, true);
          }
          this.ring(t.container, 1, 0x0ea5e9);
        }
        this.shout(w, '🐙 Abyssal Grip');
        return;
      }
      case 'DEMON_HOUND': {
        // Hellfire Rush: leap onto the weakest invader and burn 5% of its max HP per second
        const target = near(7).sort((a, b) => a.hp - b.hp)[0];
        if (!target || !this.ready(key, 8)) return;
        const land = { x: target.container.x - 14, y: target.container.y + 6 };
        this.scene.tweens.add({ targets: w.container, x: land.x, y: land.y, duration: 220, ease: 'Quad.easeOut' });
        this.invasion.damageInvader(target, atk, '🔥');
        this.invasion.applyBurn(target, Math.max(2, Math.round(target.maxHp * 0.05)), 4);
        this.shout(w, '🔥 Hellfire Rush');
        return;
      }
      case 'SUCCUBUS': {
        // Alluring Charm: the strongest non-ruler invader fights its allies for 5s
        const target = near(6)
          .filter((i) => INVADER_CONFIGS[i.type].role !== 'RULER')
          .sort((a, b) => b.hp - a.hp)[0];
        if (!target || invaders.length < 2 || !this.ready(key, 18)) return;
        target.charmTimer = 5;
        target.retargetTimer = 0;
        if (target.sprite?.active) target.sprite.setTint(0xf9a8d4);
        this.scene.time.delayedCall(5000, () => target.sprite?.active && target.sprite.clearTint());
        this.shout(w, '💘 Alluring Charm');
        return;
      }
      case 'LAVA_GARGOYLE': {
        // Volcanic Dive: crash down on the densest pack and leave a burning magma pool
        const pool = near(6);
        const target = pool.sort((a, b) =>
          invaders.filter((o) => tilesBetween(o.container, b.container) <= 1.5).length -
          invaders.filter((o) => tilesBetween(o.container, a.container) <= 1.5).length)[0];
        if (!target || !this.ready(key, 16)) return;
        const at = { x: target.container.x, y: target.container.y };
        this.scene.tweens.add({ targets: w.container, x: at.x, y: at.y - 4, duration: 420, ease: 'Cubic.easeIn' });
        this.scene.time.delayedCall(420, () => {
          for (const o of this.invasion.getInvaders()) {
            if (!o.isDead && tilesBetween(o.container, at) <= 1.5) this.invasion.damageInvader(o, atk * 2, '🌋');
          }
          this.addZone('magma', at, 1.5, 5, 0xf97316);
          soundFx.playExplosion();
        });
        this.shout(w, '🌋 Volcanic Dive');
        return;
      }
      case 'HARPY': {
        // Gale Slash: wind blades at up to 4 invaders, critical against flyers
        const targets = near(5).slice(0, 4);
        if (targets.length === 0 || !this.ready(key, 11)) return;
        for (const t of targets) {
          const crit = INVADER_CONFIGS[t.type].flying ? 2.5 : 1;
          this.invasion.damageInvader(t, Math.round(atk * 1.5 * crit), crit > 1 ? '🌪️ CRIT' : '🌪️');
          this.beam(w.container, t.container, 0xfde68a);
        }
        this.shout(w, '🌪️ Gale Slash');
        return;
      }
    }
  }

  /** Soul Harvest & Reanimate (Necromancer) and Corpse Explosion (Crypt of Souls). */
  private onInvaderKilled(dead: ActiveInvader): void {
    const at = { x: dead.container.x, y: dead.container.y };
    if (isModActive('corpseExplosion')) {
      for (const o of this.invasion.getInvaders()) {
        if (o !== dead && !o.isDead && tilesBetween(o.container, at) <= 1.5) this.invasion.damageInvader(o, 45, '💥', true);
      }
      this.ring(at, 1.5, 0x4ade80);
    }
    const necro = this.workers.getWorkers().find((w) => w.unitClass === 'NECROMANCER' && w.hp > 0);
    if (!necro || this.defenders.summonCount('skeleton') >= 4 || !this.ready(`${necro.id}:skill`, 22)) return;
    const cfg = INVADER_CONFIGS[dead.type];
    this.defenders.summon(at.x, at.y, {
      tag: 'skeleton', unitClass: 'NECROMANCER', tint: 0xe5e7eb,
      hp: Math.max(20, Math.round(dead.maxHp * 0.3)), damage: Math.max(4, Math.round(cfg.damage * 0.3)), life: 45,
    });
    this.shout(necro, '💀 Reanimate');
  }

  // ── Invader skills ──────────────────────────────────────────────────────────

  private invaderSkill(inv: ActiveInvader, invaders: ActiveInvader[], workers: WorkerInstance[]): void {
    const key = `${inv.id}:skill`;
    const targets = (tiles: number, fighting = false) => workers
      .filter((w) => !isImmune(w) && (!fighting || w.status === 'COMBAT') && tilesBetween(w.container, inv.container) <= tiles)
      .sort(byDistanceTo(inv.container));
    const dmg = inv.damage;

    switch (inv.type) {
      case 'HIGH_PRIEST': {
        // Sanctified Aegis: the 3 nearest allies become invulnerable for 4s
        const allies = invaders.filter((o) => o !== inv && tilesBetween(o.container, inv.container) <= 4).sort(byDistanceTo(inv.container)).slice(0, 3);
        if (allies.length === 0 || !this.ready(key, 30)) return;
        for (const a of allies) {
          a.invulnTimer = 4;
          this.ring(a.container, 0.6, 0xfde047);
        }
        this.shoutAt(inv.container, '✝️ Sanctified Aegis', '#fde68a');
        return;
      }
      case 'MECHA_VALKYRIE': {
        // Orbital Particle Beam: a sustained laser on a fighting minion, or on the citadel
        const victim = targets(8, true)[0];
        const castle = this.structures.getCastleTarget();
        if ((!victim && !castle) || !this.ready(key, 25)) return;
        const aim = victim ? victim.container : { x: castle!.x, y: castle!.y - 30 };
        for (let n = 0; n < 6; n++) {
          this.scene.time.delayedCall(n * 500, () => {
            if (inv.isDead) return;
            this.beam({ x: aim.x, y: aim.y - 220 }, aim, 0xef4444);
            if (victim) this.invasion.strikeWorker(inv, victim, Math.round(dmg * 0.5));
            else if (castle) this.structures.damage(castle, Math.round(dmg * 0.5));
          });
        }
        this.shoutAt(inv.container, '🛰️ Orbital Beam', '#fca5a5');
        return;
      }
      case 'HUMAN_ARCHER': {
        // Rain of Arrows: flaming arrows over a 3×3 area around a minion
        const target = targets(5)[0];
        if (!target || !this.ready(key, 14)) return;
        const at = { x: target.container.x, y: target.container.y };
        for (const w of targets(99)) if (tilesBetween(w.container, at) <= 1.5) this.invasion.strikeWorker(inv, w, Math.round(dmg * 1.2));
        this.ring(at, 1.5, 0xf97316);
        this.shoutAt(inv.container, '🏹 Rain of Arrows', '#fdba74');
        return;
      }
      case 'MECHA_SCOUT': {
        // Target Lock: marks a minion (or the nearest structure) to take +20% damage
        if (!this.ready(key, 12)) return;
        const target = targets(5)[0];
        if (target) {
          target.markedTimer = 6;
          this.ring(target.container, 0.6, 0xef4444);
        } else {
          const s = this.structures.getTargets().sort((a, b) => tilesBetween(a, inv.container) - tilesBetween(b, inv.container))[0];
          if (!s) return;
          this.invasion.markStructure(s.id, 6);
          this.ring(s, 1.5, 0xef4444);
        }
        this.shoutAt(inv.container, '🎯 Target Lock', '#fca5a5');
        return;
      }
      case 'MECHA_TITAN': {
        // Siege Stomp: stuns adjacent minions for 2.5s
        const hit = targets(1.5);
        if (hit.length === 0 || !this.ready(key, 18)) return;
        for (const w of hit) w.stunTimer = 2.5;
        this.ring(inv.container, 1.5, 0xf43f5e);
        this.scene.cameras.main.shake(180, 0.004, true);
        this.shoutAt(inv.container, '💥 Siege Stomp', '#fda4af');
        return;
      }
      case 'ASSASSIN': {
        // Shadow Step: vanish and reappear behind a minion for a guaranteed critical
        const target = targets(8)[0];
        if (!target || !this.ready(key, 12)) return;
        const behind = { x: target.container.x + 12, y: target.container.y - 6 };
        inv.container.setAlpha(0.2);
        this.scene.tweens.add({ targets: inv.container, x: behind.x, y: behind.y, alpha: 1, duration: 260 });
        this.scene.time.delayedCall(260, () => !inv.isDead && this.invasion.strikeWorker(inv, target, Math.round(dmg * 2.5)));
        this.shoutAt(inv.container, '🗡️ Shadow Step', '#cbd5e1');
        return;
      }
      case 'MECHA_DRONE': {
        // Laser Strafe: three quick laser pulses
        const target = targets(4)[0];
        if (!target || !this.ready(key, 6)) return;
        for (let n = 0; n < 3; n++) {
          this.scene.time.delayedCall(n * 150, () => {
            if (inv.isDead) return;
            this.beam(inv.container, target.container, 0x84cc16);
            this.invasion.strikeWorker(inv, target, Math.round(dmg * 0.6));
          });
        }
        return;
      }
      case 'MECHA_SIEGE_TANK': {
        // Siege Mode Bombardment: anchors, then shells the citadel from any range
        const castle = this.structures.getCastleTarget();
        if (!castle || !this.ready(key, 20)) return;
        inv.frozenTimer = 1.5;
        this.shoutAt(inv.container, '⚓ Siege Mode', '#bef264');
        this.scene.time.delayedCall(1500, () => {
          if (inv.isDead) return;
          this.beam(inv.container, { x: castle.x, y: castle.y - 30 }, 0xf97316);
          this.structures.damage(castle, dmg * 3);
          this.ring(castle, 1.5, 0xf97316);
          soundFx.playExplosion();
        });
        return;
      }
      case 'CHRONO': {
        // Temporal Stasis: beasts inside the clock move and fight 70% slower for 6s
        if (targets(3).length === 0 || !this.ready(key, 24)) return;
        this.addZone('stasis', inv.container, 2, 6, 0x818cf8);
        this.shoutAt(inv.container, '⏳ Temporal Stasis', '#c7d2fe');
        return;
      }
    }
  }

  // ── Establishment & citadel skills ──────────────────────────────────────────

  private castStructureSkill(id: string, invaders: ActiveInvader[], workers: WorkerInstance[]): void {
    const building = id.split('_')[0];
    const tower = this.structures.getTowers().find((t) => t.id === building);
    const castle = this.structures.getCastleTarget();
    const origin: Point = tower ?? castle ?? { x: 0, y: 0 };
    const inZone = (i: ActiveInvader) => {
      if (!tower) return true;
      const g = Navigation.toGrid(i.container.x, i.container.y);
      const z = tower.zone;
      return g.x >= z.x - 0.5 && g.x <= z.x + z.w - 0.5 && g.y >= z.y - 0.5 && g.y <= z.y + z.h - 0.5;
    };
    const zoneInvaders = invaders.filter(inZone);
    const nearest = (n: number) => [...invaders].sort(byDistanceTo(origin)).slice(0, n);
    soundFx.playFanfare();

    switch (id) {
      case 'QUARRY_SEISMIC_SHATTER':
        for (const i of zoneInvaders) this.invasion.damageInvader(i, 120, '💥');
        this.ring(origin, 3, 0xf59e0b);
        break;
      case 'QUARRY_STONE_FORTRESS':
        activateMod('fortress', 20);
        break;
      case 'MINE_SPIKE_VOLLEY':
        for (const i of nearest(3)) {
          this.beam(origin, i.container, 0xd1d5db);
          this.invasion.damageInvader(i, 90, '🔩');
        }
        break;
      case 'MINE_IRON_SKIN':
        for (const w of workers) {
          w.armorShield += 40;
          w.armorShieldTimer = Math.max(w.armorShieldTimer, 15);
        }
        break;
      case 'WOOD_ANCIENT_ROOTS':
        for (const i of zoneInvaders) this.invasion.applySlow(i, 0.02, 8);
        this.ring(origin, 3, 0x22c55e);
        break;
      case 'WOOD_NATURE_SURGE':
        for (const w of workers) w.hp = Math.min(w.maxHp, w.hp + Math.round(w.maxHp * 0.25));
        activateMod('beastSurge', 12);
        break;
      case 'PORT_TIDAL_WAVE':
        for (const i of zoneInvaders) {
          this.invasion.damageInvader(i, 80, '🌊');
          this.invasion.knockback(i, origin.x, origin.y, TILE_PX * 2);
        }
        this.ring(origin, 3, 0x38bdf8);
        break;
      case 'PORT_FROST_BIND':
        for (const i of nearest(5)) {
          i.frozenTimer = 10;
          this.invasion.applySlow(i, 0.02, 10);
        }
        break;
      case 'CAVE_SOUL_SIPHON': {
        let drained = 0;
        for (const i of zoneInvaders) {
          const take = Math.min(30, i.hp);
          drained += take;
          this.invasion.damageInvader(i, 30, '🔮');
        }
        if (drained > 0) {
          useGameStore.setState((s) => ({ defense: { ...s.defense, castleHp: Math.min(s.defense.castleMaxHp, s.defense.castleHp + drained) } }));
        }
        break;
      }
      case 'CAVE_INFERNO_BURST': {
        const target = nearest(1)[0];
        if (!target) break;
        this.invasion.damageInvader(target, 200, '🔥');
        for (const o of invaders) if (o !== target && tilesBetween(o.container, target.container) <= 1.5) this.invasion.damageInvader(o, 60, undefined, true);
        this.ring(target.container, 1.5, 0xf97316);
        break;
      }
      case 'TRENCH_TIDAL_SURGE':
        this.addZone('tidal', origin, 4, 8, 0x0ea5e9);
        break;
      case 'TRENCH_PEARL_BLESSING':
        useGameStore.setState((s) => ({ defense: { ...s.defense, shieldHp: Math.min(s.defense.shieldMaxHp, s.defense.shieldHp + Math.round(s.defense.shieldMaxHp * 0.5)) } }));
        break;
      case 'CRYPT_CORPSE_EXPLOSION':
        activateMod('corpseExplosion', 15);
        break;
      case 'CRYPT_RAISE_DEAD':
        for (let n = 0; n < 2; n++) {
          this.defenders.summon(origin.x + (n ? 18 : -18), origin.y + 10, {
            tag: 'skeleton', unitClass: 'NECROMANCER', tint: 0xe5e7eb, hp: 80, damage: 10, life: 40,
          });
        }
        break;
      case 'PERCH_FLAK_BARRAGE':
        for (const i of invaders) {
          if (!INVADER_CONFIGS[i.type].flying) continue;
          this.beam(origin, i.container, 0xf97316);
          this.invasion.damageInvader(i, 120, '🌋');
        }
        break;
      case 'PERCH_EAGLE_EYE':
        activateMod('eagleEye', 10);
        break;
      case 'KENNEL_BLOOD_FRENZY':
        activateMod('bloodFrenzy', 12);
        break;
      case 'KENNEL_HELLFIRE_CHARGE':
        for (const i of zoneInvaders) this.invasion.applyBurn(i, 10, 3);
        this.ring(origin, 3, 0xef4444);
        break;
      case 'CASTLE_OVERDRIVE':
        // Abyssal Overdrive: a shockwave throws every invader near the walls back
        for (const i of invaders) {
          if (castle && tilesBetween(i.container, castle) > 4) continue;
          this.invasion.damageInvader(i, 30, '🌀');
          this.invasion.knockback(i, origin.x, origin.y, TILE_PX * 3);
        }
        this.ring(origin, 4, 0xa855f7);
        this.scene.cameras.main.shake(220, 0.006, true);
        break;
      case 'SPIRE_OVERCHARGE':
        activateMod('spireOvercharge', 10);
        break;
    }
  }

  // ── Zones ───────────────────────────────────────────────────────────────────

  private addZone(kind: Zone['kind'], at: Point, radiusTiles: number, seconds: number, color: number): void {
    const gfx = this.scene.add.graphics();
    gfx.fillStyle(color, 0.28);
    gfx.fillEllipse(0, 0, radiusTiles * TILE_PX * 2.2, radiusTiles * TILE_PX * 1.1);
    gfx.lineStyle(2, color, 0.8);
    gfx.strokeEllipse(0, 0, radiusTiles * TILE_PX * 2.2, radiusTiles * TILE_PX * 1.1);
    gfx.setPosition(at.x, at.y);
    this.layer.add(gfx);
    this.zones.push({ kind, x: at.x, y: at.y, radiusTiles, left: seconds, tick: 0, gfx });
  }

  private updateZones(dt: number, invaders: ActiveInvader[], workers: WorkerInstance[]): void {
    for (const z of [...this.zones]) {
      z.left -= dt;
      z.tick -= dt;
      z.gfx.setAlpha(Math.min(1, z.left));
      if (z.left <= 0) {
        z.gfx.destroy();
        this.zones = this.zones.filter((o) => o !== z);
        continue;
      }
      if (z.tick > 0) continue;
      z.tick = 0.5;
      const inside = (p: Point) => tilesBetween(p, z) <= z.radiusTiles;
      if (z.kind === 'magma') {
        for (const i of invaders) if (inside(i.container)) {
          this.invasion.applySlow(i, 0.5, 1);
          this.invasion.applyBurn(i, 6, 1);
        }
      } else if (z.kind === 'tidal') {
        for (const i of invaders) if (inside(i.container)) this.invasion.applySlow(i, 0.6, 1);
      } else {
        for (const w of workers) if (inside(w.container)) {
          w.slowTimer = 0.8;
          w.slowFactor = 0.3;
        }
      }
    }
  }

  // ── Visuals ─────────────────────────────────────────────────────────────────

  private ring(at: Point, radiusTiles: number, color: number): void {
    const g = this.scene.add.graphics();
    g.lineStyle(3, color, 0.9);
    g.strokeEllipse(0, 0, radiusTiles * TILE_PX * 2.2, radiusTiles * TILE_PX * 1.1);
    g.setPosition(at.x, at.y);
    g.setScale(0.2);
    this.layer.add(g);
    this.scene.tweens.add({ targets: g, scale: 1, alpha: 0, duration: 520, ease: 'Cubic.easeOut', onComplete: () => g.destroy() });
  }

  private beam(from: Point, to: Point, color: number): void {
    const g = this.scene.add.graphics();
    g.lineStyle(3, color, 0.95);
    g.lineBetween(from.x, from.y - 14, to.x, to.y - 14);
    g.setDepth(9990);
    this.layer.add(g);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 260, onComplete: () => g.destroy() });
  }

  private shout(w: WorkerInstance, text: string): void {
    this.workers.spawnFloatingPopup(w.container.x, w.container.y - 50, text, '#fde68a');
  }

  private shoutAt(at: Point, text: string, color: string): void {
    this.workers.spawnFloatingPopup(at.x, at.y - 50, text, color);
  }
}
