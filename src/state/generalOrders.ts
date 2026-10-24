import config from '../data/generalOrders.json';

/**
 * General command orders: one battle priority per General (set from the sidebar
 * Generals panel), the rage gauge that unlocks an ordered brawl, and how a
 * General's brawl bonus is invested into its establishment's sturdiness.
 * Numbers and text live in src/data/generalOrders.json.
 */

export const GENERAL_ORDERS = config;
export type GeneralOrder = 'AUTO' | 'CATERPILLAR' | 'LEVIATHAN' | 'KIROV' | 'RIFTS' | 'LOOT';
export const ORDER_IDS = config.priorities.map((p) => p.id) as GeneralOrder[];
export const RAGE = config.rage;

export const isGeneralOrder = (v: unknown): v is GeneralOrder => typeof v === 'string' && (ORDER_IDS as string[]).includes(v);

/** Who an order goes to: the General, its minions, or both. */
export type OrderScope = 'GENERAL' | 'MINIONS' | 'BOTH';
/** Most priorities one unit can stack (followed first to last, falling back to AUTO). */
export const MAX_ORDERS = 3;

/** Clean priority list: known, non-AUTO, no repeats, at most MAX_ORDERS. */
export const normalizeOrders = (raw: unknown): GeneralOrder[] => {
  if (!Array.isArray(raw)) return [];
  const out: GeneralOrder[] = [];
  for (const o of raw) if (isGeneralOrder(o) && o !== 'AUTO' && !out.includes(o) && out.length < MAX_ORDERS) out.push(o);
  return out;
};

/** A General's priority list (reads the legacy single order too). */
export const ordersOf = (u: { order?: GeneralOrder; orders?: GeneralOrder[] } | undefined): GeneralOrder[] =>
  !u ? [] : u.orders ? normalizeOrders(u.orders) : u.order && u.order !== 'AUTO' ? [u.order] : [];
export const minionOrdersOf = (u: { minionOrders?: GeneralOrder[] } | undefined): GeneralOrder[] => normalizeOrders(u?.minionOrders);

export const orderInfo = (id: GeneralOrder) => config.priorities.find((p) => p.id === id) ?? config.priorities[0];

/** Extra establishment max HP bought by spending a General's brawl bonus. */
export const sturdyFromBonus = (brawlAttack: number, brawlHp: number): number =>
  Math.round(Math.max(0, brawlHp) * config.invest.hpPerBrawlHp + Math.max(0, brawlAttack) * config.invest.hpPerBrawlAttack);

export const clampSturdy = (n: number): number => Math.max(0, Math.min(config.invest.maxSturdy, Math.round(n)));
