import Phaser from 'phaser';
import { useGameStore } from '../../state/useGameStore';
import { BRAWL_CONFIG, tensionFull } from '../../state/brawl';
import { logMessage } from '../../state/activityLog';
import { soundFx } from '../audio/soundFx';
import { playCharacterHit } from '../sprites/CharacterSprites';
import { Navigation } from '../Navigation';
import type { WorkerContext, WorkerInstance } from './types';

const CFG = BRAWL_CONFIG;

interface Brawl {
  a: WorkerInstance;
  b: WorkerInstance;
  /** Seconds until each side's next swing. */
  swingA: number;
  swingB: number;
  elapsed: number;
}

/**
 * General brawls on the map. Every frame it counts clashes (two Generals bumping
 * into each other); when a pair's tension gauge is full and no wave is on, the two
 * square off and trade blows until one is knocked down. The winner absorbs the
 * loser's base stats through the store (`resolveBrawl`). Tuned in src/data/brawl.json.
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

  update(generals: WorkerInstance[], deltaSec: number): void {
    const store = useGameStore.getState();
    const battle = store.invasion.isActive;
    if (this.brawl) {
      // A wave interrupts the brawl: both return to the defence, nobody wins
      if (battle) this.stop(null);
      else this.fight(this.brawl, deltaSec);
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
    this.brawl = { a, b, swingA: 0.2, swingB: 0.5, elapsed: 0 };
    for (const w of [a, b]) {
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
    if (a.hp <= 0 || b.hp <= 0 || !a.container.active || !b.container.active) {
      this.stop(null);
      return;
    }
    brawl.elapsed += deltaSec;
    const reach = CFG.brawl.reachPx;
    for (const [me, foe, side] of [[a, b, 'A'], [b, a, 'B']] as const) {
      const d = Math.hypot(foe.container.x - me.container.x, foe.container.y - me.container.y);
      if (d > reach) {
        this.ctx.moveToward(me, foe.container.x, foe.container.y, me.speed * CFG.brawl.approachSpeed * deltaSec, deltaSec);
        continue;
      }
      const key = side === 'A' ? 'swingA' : 'swingB';
      brawl[key] -= deltaSec;
      if (brawl[key] > 0) continue;
      brawl[key] = CFG.brawl.swingSeconds * Phaser.Math.FloatBetween(0.85, 1.15);
      this.ctx.playMinionAttack(me, foe.container.x, foe.container.y);
      const dmg = Math.max(1, Math.round((me.attackPower || 20) * CFG.brawl.damageRatio * Phaser.Math.FloatBetween(0.8, 1.2)));
      foe.hp = Math.max(1, foe.hp - dmg);
      if (foe.sprite) playCharacterHit(foe.sprite);
      soundFx.playMonsterBash();
    }
    const floor = (w: WorkerInstance) => w.maxHp * CFG.knockoutHpRatio;
    const aDown = a.hp <= floor(a);
    const bDown = b.hp <= floor(b);
    if (aDown || bDown) {
      this.stop(aDown && bDown ? (a.hp / a.maxHp >= b.hp / b.maxHp ? a : b) : aDown ? b : a);
    } else if (brawl.elapsed > CFG.brawl.maxSeconds) {
      // Time's up: the one standing healthier takes it
      this.stop(a.hp / a.maxHp >= b.hp / b.maxHp ? a : b);
    }
  }

  private stop(winner: WorkerInstance | null): void {
    const brawl = this.brawl;
    this.brawl = null;
    if (!brawl) return;
    for (const w of [brawl.a, brawl.b]) w.status = 'IDLE';
    if (!winner) {
      logMessage('brawlInterrupted', { a: brawl.a.name, b: brawl.b.name });
      return;
    }
    const loser = winner === brawl.a ? brawl.b : brawl.a;
    loser.hp = Math.max(1, Math.round(loser.maxHp * CFG.knockoutHpRatio));
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
