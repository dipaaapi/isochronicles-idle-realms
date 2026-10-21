import { projectileFor, shootProjectile } from '../battleFx';
import { soundFx } from '../audio/soundFx';
import { battleTargets, type OrderTarget } from '../battleTargets';
import { useGameStore } from '../../state/useGameStore';
import { RAGE, type GeneralOrder } from '../../state/generalOrders';
import type { WorkerContext, WorkerFrame, WorkerInstance } from './types';

/**
 * Orders from the Generals panel: the battle priority each General follows, and its
 * rage gauge (fills from combat, an ordered brawl spends it). Tuned in
 * src/data/generalOrders.json.
 */

/** This General's current battle priority (from its roster entry). */
export function orderOf(worker: WorkerInstance): GeneralOrder {
  return useGameStore.getState().roster.find((u) => u.id === worker.id)?.order ?? 'AUTO';
}

export function addRage(worker: WorkerInstance, amount: number): void {
  worker.rage = Math.max(0, Math.min(RAGE.max, (worker.rage ?? 0) + amount));
}

/** Per-frame rage upkeep: HP lost fills it, it slowly cools otherwise. */
export function tickRage(worker: WorkerInstance, deltaSec: number): void {
  const last = worker.rageLastHp ?? worker.hp;
  if (worker.hp < last && worker.maxHp > 0) addRage(worker, ((last - worker.hp) / worker.maxHp) * 100 * RAGE.perHpLostPct);
  worker.rageLastHp = worker.hp;
  if ((worker.rage ?? 0) > 0) addRage(worker, -RAGE.decayPerSecond * deltaSec);
}

const WILD_OF: Partial<Record<GeneralOrder, string>> = { CATERPILLAR: 'BROOD', LEVIATHAN: 'SEA' };

/** Boss first, then the closest of its faction. */
function pickWild(worker: WorkerInstance, list: OrderTarget[]): OrderTarget | null {
  let best: OrderTarget | null = null;
  let bestScore = Infinity;
  for (const t of list) {
    const score = Math.hypot(t.x - worker.container.x, t.y - worker.container.y) - (t.boss ? 400 : 0);
    if (score < bestScore) { bestScore = score; best = t; }
  }
  return best;
}

/**
 * Follows a hunt order (Caterpillar / Leviathan / Kirov) this frame. Returns true when
 * it took over; false lets the normal combat AI run (target not on the map, or the
 * General is already under the Kirov where the anti-air fire does the work).
 */
export function followHuntOrder(ctx: WorkerContext, worker: WorkerInstance, frame: WorkerFrame, order: GeneralOrder): boolean {
  const { config, deltaSec, effectiveSpeed, effectiveAttack } = frame;
  const wx = worker.container.x;
  const wy = worker.container.y;

  if (order === 'KIROV') {
    const ship = battleTargets.kirov?.();
    if (!ship) return false;
    if (Math.hypot(ship.x - wx, ship.y - wy) <= 90) return false;
    worker.overrideEmote = '🎈';
    worker.overrideEmoteTimer = 600;
    ctx.moveToward(worker, ship.x, ship.y, effectiveSpeed * 1.35 * deltaSec, deltaSec);
    return true;
  }

  const faction = WILD_OF[order];
  const target = faction ? pickWild(worker, battleTargets.wild[faction]?.() ?? []) : null;
  if (!target) return false;
  const reach = config.attackRange + 20;
  if (Math.hypot(target.x - wx, target.y - wy) > reach) {
    worker.overrideEmote = order === 'CATERPILLAR' ? '🐛' : '🐉';
    worker.overrideEmoteTimer = 600;
    ctx.moveToward(worker, target.x, target.y, effectiveSpeed * 1.35 * deltaSec, deltaSec);
    return true;
  }
  worker.combatCooldown -= deltaSec;
  if (worker.combatCooldown > 0) return true;
  worker.combatCooldown = 0.85;
  ctx.playMinionAttack(worker, target.x, target.y);
  worker.overrideEmote = '⚔️';
  worker.overrideEmoteTimer = 900;
  const dmg = Math.round(effectiveAttack);
  if (config.attackRange > 60) {
    soundFx.playLaser();
    shootProjectile({ x: wx, y: wy - 16 }, { x: target.x, y: target.y - 10 }, projectileFor(String(worker.unitClass ?? ''), true), {
      tint: config.lanternColor,
      onHit: () => target.strike(dmg, worker),
    });
  } else {
    soundFx.playSwordClang();
    target.strike(dmg, worker);
  }
  addRage(worker, RAGE.perHitDealt);
  return true;
}
