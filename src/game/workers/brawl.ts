import Phaser from 'phaser';
import { useGameStore } from '../../state/useGameStore';
import { BRAWL_CONFIG, tensionFull } from '../../state/brawl';
import { logMessage } from '../../state/activityLog';
import { soundFx } from '../audio/soundFx';
import { playCharacterHit, playCharacterSkill } from '../sprites/CharacterSprites';
import { Navigation } from '../Navigation';
import { IsometricHelper } from '../IsometricHelper';
import { GRID_SIZE } from '../../state/buildingLayout';
import { UNIT_CLASSES } from '../../types/game';
import type { WorkerContext, WorkerInstance } from './types';

const CFG = BRAWL_CONFIG;
const skillName = (skill: { name: string; nameTl?: string }): string =>
  useGameStore.getState().language === 'TL' ? skill.nameTl ?? skill.name : skill.name;

interface Brawl {
  a: WorkerInstance;
  b: WorkerInstance;
  /** Seconds until each side's next swing. */
  swingA: number;
  swingB: number;
}

/**
 * General brawls on the map. Every frame it counts clashes (two Generals bumping
 * into each other); when a pair's tension gauge is full and no wave is on, the two
 * square off and trade blows until one dies. The winner absorbs 10% of the loser's
 * current stats through the store (`resolveBrawl`), up to 10 wins. Tuned in src/data/brawl.json.
 */
export class BrawlDirector {
  /** Pairs currently touching (a clash counts once per contact). */
  private touching = new Set<string>();
  private brawl: Brawl | null = null;

  constructor(private readonly ctx: WorkerContext) {}

  /** True while this General is in a brawl (its normal duties are paused). */
  isBrawling(worker: WorkerInstance): boolean {
    return !!this.brawl && (this.brawl.a === worker || this.brawl.b === worker);
  }

  /** The General a brawler is fighting, for the minion rally. */
  brawlers(): [WorkerInstance, WorkerInstance] | null {
    return this.brawl ? [this.brawl.a, this.brawl.b] : null;
  }

  /** Starts a player-requested brawl between two random living field Generals. */
  command(generals: WorkerInstance[]): boolean {
    if (this.brawl || useGameStore.getState().invasion.isActive) return false;
    const eligible = generals.filter((g) => g.hp > 0 && g.container.active && g.container.visible);
    if (eligible.length < 2) return false;
    const aIndex = Math.floor(Math.random() * eligible.length);
    const [a] = eligible.splice(aIndex, 1);
    const b = eligible[Math.floor(Math.random() * eligible.length)];
    this.start(a, b);
    return true;
  }

  update(generals: WorkerInstance[], deltaSec: number): void {
    const store = useGameStore.getState();
    const battle = store.invasion.isActive;
    if (this.brawl) {
      // A wave may start during a brawl, but the duel keeps going to its result.
      this.fight(this.brawl, deltaSec);
      return;
    }
    // No brawls during a wave, and fighting side by side in one does not count as a clash
    if (!battle) this.countClashes(generals, battle);
  }

  /** Cancels any brawl involving this worker (e.g. it died). */
  forget(worker: WorkerInstance): void {
    if (this.isBrawling(worker)) this.stop(null);
  }

  private countClashes(generals: WorkerInstance[], battle: boolean): void {
    const store = useGameStore.getState();
    const live = generals.filter((g) => g.hp > 0 && g.container.active && g.container.visible);
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i];
        const b = live[j];
        const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        const d = Math.hypot(a.container.x - b.container.x, a.container.y - b.container.y);
        if (d > CFG.partRadiusPx) {
          this.touching.delete(key);
          continue;
        }
        if (d > CFG.clashRadiusPx || this.touching.has(key)) continue;
        this.touching.add(key);

        const spot = Navigation.tileOf((a.container.x + b.container.x) / 2, (a.container.y + b.container.y) / 2);
        const tension = store.recordClash(a.id, b.id, spot.x, spot.y);
        a.overrideEmote = '💢';
        a.overrideEmoteTimer = 900;
        b.overrideEmote = '💢';
        b.overrideEmoteTimer = 900;
        const names = { a: a.name, b: b.name };
        if (tension.count === Math.ceil(CFG.clashesToBrawl * 0.7)) {
          logMessage('brawlTension', { ...names, count: tension.count, max: CFG.clashesToBrawl });
        }
        if (!battle && !this.brawl && tensionFull(tension)) this.start(a, b);
      }
    }
  }

  private start(a: WorkerInstance, b: WorkerInstance): void {
    this.brawl = { a, b, swingA: 0.2, swingB: 0.5 };
    for (const w of [a, b]) {
      w.isBrawling = true;
      w.status = 'COMBAT';
      w.currentPath = [];
      w.overrideEmote = '🥊';
      w.overrideEmoteTimer = 1500;
    }
    logMessage('brawlStarts', { a: a.name, b: b.name });
    soundFx.playSwordClang();
    this.ctx.scene.cameras.main.shake(160, 0.002);
  }

  private fight(brawl: Brawl, deltaSec: number): void {
    const { a, b } = brawl;
    if (!a.container.active || !b.container.active) {
      this.stop(null);
      return;
    }
    if (a.hp <= 0 || b.hp <= 0) {
      this.stop(a.hp <= 0 && b.hp > 0 ? b : b.hp <= 0 && a.hp > 0 ? a : null);
      return;
    }
    for (const fighter of [a, b]) {
      fighter.armorShieldTimer = Math.max(0, fighter.armorShieldTimer - deltaSec);
      if (fighter.armorShieldTimer === 0) fighter.armorShield = 0;
      fighter.armorBuffTimer = Math.max(0, (fighter.armorBuffTimer ?? 0) - deltaSec);
    }
    const reach = CFG.brawl.reachPx;
    for (const [me, foe, side] of [[a, b, 'A'], [b, a, 'B']] as const) {
      const skillDamage = this.castSkill(me, deltaSec);
      if (skillDamage > 0) {
        this.damage(foe, skillDamage);
        if (foe.sprite) playCharacterHit(foe.sprite);
        soundFx.playMonsterBash();
        if (foe.hp <= 0) {
          this.stop(me);
          return;
        }
        continue;
      }
      const d = Math.hypot(foe.container.x - me.container.x, foe.container.y - me.container.y);
      if (d > reach) {
        this.approach(me, foe, deltaSec);
        continue;
      }
      const key = side === 'A' ? 'swingA' : 'swingB';
      brawl[key] -= deltaSec;
      if (brawl[key] > 0) continue;
      brawl[key] = CFG.brawl.swingSeconds * Phaser.Math.FloatBetween(0.85, 1.15);
      this.ctx.playMinionAttack(me, foe.container.x, foe.container.y);
      const dmg = Math.max(1, Math.round((me.attackPower || 20) * CFG.brawl.damageRatio * Phaser.Math.FloatBetween(0.8, 1.2)));
      this.damage(foe, dmg);
      if (foe.sprite) playCharacterHit(foe.sprite);
      soundFx.playMonsterBash();
      if (foe.hp <= 0) {
        this.stop(me);
        return;
      }
    }
  }

  /** Brawlers steer directly at one another so normal worker path blockers cannot freeze the duel. */
  private approach(worker: WorkerInstance, target: WorkerInstance, deltaSec: number): void {
    const dx = target.container.x - worker.container.x;
    const dy = target.container.y - worker.container.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= CFG.brawl.reachPx * 0.8) return;
    const step = Math.min(worker.speed * CFG.brawl.approachSpeed * deltaSec, distance - CFG.brawl.reachPx * 0.8);
    worker.container.x += (dx / distance) * step;
    worker.container.y += (dy / distance) * step;
    const tile = Navigation.tileOf(worker.container.x, worker.container.y);
    worker.gridX = Phaser.Math.Clamp(tile.x, 0, GRID_SIZE - 1);
    worker.gridY = Phaser.Math.Clamp(tile.y, 0, GRID_SIZE - 1);
    worker.container.setDepth(IsometricHelper.getDepth(worker.gridX, worker.gridY, 6));
  }

  /** Uses each General's skill cooldowns in the duel; healing skills become defensive buffs. */
  private castSkill(worker: WorkerInstance, deltaSec: number): number {
    const skills = UNIT_CLASSES[worker.unitClass]?.skills;
    if (!skills) return 0;

    worker.ultimateCooldown = (worker.ultimateCooldown ?? skills.ultimate.cooldownSeconds * 0.4) - deltaSec;
    worker.skill1Cooldown = (worker.skill1Cooldown ?? skills.skill1.cooldownSeconds * 0.5) - deltaSec;
    worker.skill2Cooldown = (worker.skill2Cooldown ?? skills.skill2.cooldownSeconds * 0.75) - deltaSec;

    let skill: typeof skills.skill1 | typeof skills.ultimate;
    let damage = 0;
    if (worker.ultimateCooldown <= 0) {
      skill = skills.ultimate;
      worker.ultimateCooldown = skill.cooldownSeconds;
      damage = Math.round(worker.attackPower * 3.2 + 90);
    } else if (worker.skill1Cooldown <= 0) {
      skill = skills.skill1;
      worker.skill1Cooldown = skill.cooldownSeconds;
      worker.armorShield += 80;
      worker.armorShieldTimer = Math.max(worker.armorShieldTimer, 5);
    } else if (worker.skill2Cooldown <= 0) {
      skill = skills.skill2;
      worker.skill2Cooldown = skill.cooldownSeconds;
      // Brawl rules forbid healing, so a restorative skill becomes a brief guard instead.
      worker.armorBuffTimer = Math.max(worker.armorBuffTimer ?? 0, 3);
    } else {
      return 0;
    }

    const color = UNIT_CLASSES[worker.unitClass].lanternColor;
    this.ctx.spawnHarvestBurst(worker.container.x, worker.container.y - 15, color, damage > 0 ? 24 : 12);
    // Show the skill on the map: its icon in the status bubble plus a ground shockwave
    worker.overrideEmote = skill.icon;
    worker.overrideEmoteTimer = 1400;
    this.skillWave(worker, color, damage > 0);
    this.ctx.spawnFloatingPopup(worker.container.x, worker.container.y - 48, `${skill.icon} ${skillName(skill)}!`, damage > 0 ? '#f43f5e' : '#38bdf8');
    if (worker.sprite) playCharacterSkill(worker.sprite);
    soundFx.playGolemCheer();
    return damage;
  }

  /** Expanding ring under a General casting a brawl skill (bigger and red-rimmed for an ultimate). */
  private skillWave(worker: WorkerInstance, color: number, ultimate: boolean): void {
    const parent = worker.container.parentContainer;
    if (!parent) return;
    const scene = this.ctx.scene;
    const ring = scene.add.graphics();
    ring.setPosition(worker.container.x, worker.container.y);
    parent.add(ring);
    const maxR = ultimate ? 46 : 28;
    const state = { t: 0 };
    scene.tweens.add({
      targets: state,
      t: 1,
      duration: ultimate ? 650 : 450,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        const r = 6 + (maxR - 6) * state.t;
        ring.clear();
        ring.lineStyle(ultimate ? 3 : 2, color, 1 - state.t);
        ring.strokeEllipse(0, 0, r * 2, r);
        if (ultimate) {
          ring.lineStyle(1.5, 0xf43f5e, (1 - state.t) * 0.9);
          ring.strokeEllipse(0, 0, r * 1.4, r * 0.7);
          ring.fillStyle(color, (1 - state.t) * 0.25);
          ring.fillEllipse(0, 0, r * 2, r);
        }
      },
      onComplete: () => ring.destroy(),
    });
    if (ultimate) scene.cameras.main.shake(120, 0.0015);
  }

  private damage(target: WorkerInstance, rawDamage: number): void {
    const reduced = rawDamage * ((target.armorBuffTimer ?? 0) > 0 ? 0.5 : 1) * ((target.markedTimer ?? 0) > 0 ? 1.2 : 1);
    const damage = Math.max(1, Math.round(reduced));
    const absorbed = Math.min(target.armorShield, damage);
    target.armorShield = Math.max(0, target.armorShield - absorbed);
    target.hp = Math.max(0, target.hp - (damage - absorbed));
  }

  private stop(winner: WorkerInstance | null): void {
    const brawl = this.brawl;
    this.brawl = null;
    if (!brawl) return;
    for (const w of [brawl.a, brawl.b]) {
      w.isBrawling = false;
      w.status = 'IDLE';
    }
    if (!winner) {
      logMessage('brawlInterrupted', { a: brawl.a.name, b: brawl.b.name });
      return;
    }
    const loser = winner === brawl.a ? brawl.b : brawl.a;
    // Leave the defeated General at zero so the normal permadeath/promotion flow runs this frame.
    loser.hp = 0;
    loser.isBrawlDeath = true;
    loser.overrideEmote = '😵';
    loser.overrideEmoteTimer = 2500;
    winner.overrideEmote = '🏆';
    winner.overrideEmoteTimer = 2500;
    useGameStore.getState().resolveBrawl(winner.id, loser.id);
    const level = useGameStore.getState().roster.find((u) => u.id === winner.id)?.brawlLevel ?? 0;
    logMessage('brawlWon', { winner: winner.name, loser: loser.name, level });
    soundFx.playFanfare();
  }
}
