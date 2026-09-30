/**
 * Timed, realm-wide combat modifiers switched on by skills (Stone Fortress,
 * Nature Surge, Eagle Eye …) and read by the managers that apply them.
 * Timed on the SkillSystem's own game-speed-aware clock.
 */
export type CombatMod =
  | 'fortress' // establishments take 50% less damage
  | 'beastSurge' // beasts move 30% faster
  | 'eagleEye' // Brimstone Perch fires twice as fast
  | 'spireOvercharge' // Crystal Spire fires twice as fast
  | 'ironSkin' // (visual flag) minions coated in armor
  | 'corpseExplosion' // Crypt: slain invaders explode
  | 'bloodFrenzy'; // Kennel: melee beasts steal life

const until: Partial<Record<CombatMod, number>> = {};
let clock = 0;

/** Flags recomputed every frame by the SkillSystem. */
export const auras = {
  /** Mecha Valkyrie alive: mecha attack 25% faster. */
  cyberCommand: false,
  /** Castle under 30% with the Infernal Kennel standing: melee beasts steal life. */
  bloodFrenzy: false,
};

export const advanceCombatClock = (seconds: number): void => {
  clock += seconds;
};

export const activateMod = (mod: CombatMod, seconds: number): void => {
  until[mod] = Math.max(until[mod] ?? 0, clock + seconds);
};

export const isModActive = (mod: CombatMod): boolean => (until[mod] ?? 0) > clock;

export const resetCombatMods = (): void => {
  for (const key of Object.keys(until) as CombatMod[]) delete until[key];
  auras.cyberCommand = false;
  auras.bloodFrenzy = false;
};
