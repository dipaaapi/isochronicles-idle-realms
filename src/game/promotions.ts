import type { UnitClass } from '../types/game';

/**
 * General classes whose tenant is mid-promotion (star badge, then growing
 * into the General). The Treant must not summon a replacement meanwhile.
 */
export const promotingClasses = new Set<UnitClass>();
