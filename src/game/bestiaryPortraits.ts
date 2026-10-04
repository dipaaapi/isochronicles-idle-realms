// Pixel-art portraits sliced from the Demon Lord Codex sheet ("Select Your Forces").
// Files live in public/portraits/ (160x160 PNG), keyed here by UnitClass / InvaderType.

const portrait = (name: string) => `/portraits/${name}.png`;

export const BEAST_PORTRAITS: Record<string, string> = {
  TREANT: portrait('ancient-ent'),
  AQUA_SLIME: portrait('slime'),
  GOLEM: portrait('golem'),
  MERMAN: portrait('merman'),
  NECROMANCER: portrait('necromancer'),
  LAVA_GARGOYLE: portrait('lava-gargoyle'),
  SUCCUBUS: portrait('succubus'),
  KRAKEN: portrait('kraken'),
  DEMON_HOUND: portrait('demon-hound'),
  HARPY: portrait('harpy'),
  // Rendered from the voxel models (front idle frame)
  DRYAD: portrait('dryad'),
  MINOTAUR: portrait('minotaur'),
  EMBER_IMP: portrait('ember-imp'),
  VOID_WRAITH: portrait('void-wraith'),
  BONE_KNIGHT: portrait('bone-knight'),
  PRISM_WARDEN: portrait('prism-warden'),
};

export const INVADER_PORTRAITS: Record<string, string> = {
  HUMAN_KNIGHT: portrait('human-knight'),
  HUMAN_ARCHER: portrait('human-archer'),
  MECHA_SCOUT: portrait('mecha-scout'),
  MECHA_TITAN: portrait('mecha-titan'),
  HIGH_PRIEST: portrait('high-priest'),
  MECHA_VALKYRIE: portrait('mecha-valkyrie'),
  ASSASSIN: portrait('assassin'),
  MECHA_DRONE: portrait('mecha-drone'),
  MECHA_SIEGE_TANK: portrait('mecha-siege-tank'),
  CHRONO: portrait('chrono-time-mage'),
  // Rendered from the voxel model (front idle frame)
  TECHNICIAN: portrait('technician'),
};
