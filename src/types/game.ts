export interface GridPoint {
  x: number;
  y: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export type TileType =
  | 'VOID'
  | 'AETHER_GRASS'
  | 'ANCIENT_STONE'
  | 'NEXUS_BASE'
  | 'AETHER_CRYSTAL'
  | 'ANCIENT_GROVE'
  | 'RUNIC_PILLAR'
  | 'MYSTIC_CAVE'
  | 'OCEAN_BLOCK'
  | 'SPAWN_BLOCK'
  | 'BARRACKS';

export const PLATFORM_CONFIGS = {
  1: {
    phase: 1,
    name: 'Kuta ng Kadiliman (Demon Citadel)',
    nameEn: 'Demon Citadel',
    tagline: 'Pinagmulan ng Kapangyarihan ng Kadiliman',
    taglineEn: 'The Ancestral Seat of Infernal Might',
    description: 'Ang orihinal na kuta ng Demon Lord. Madilim na batong obsidian na pinaliligiran ng aether spires at sinaunang enerhiya.',
    descriptionEn: 'The original fortress of the Demon Lord. Obsidian stone bastions surrounded by aether spires and ancient dark energy.',
    waveRange: 'Waves 1 - 25',
    accentColor: '#9333ea', // Violet
    ambientTone: 'dark',
    tilePalette: {
      grassTop: 0x064e3b,      // Dark emerald grass
      grassLeft: 0x022c22,
      grassRight: 0x065f46,
      grassStroke: 0x10b981,
      stoneTop: 0x334155,      // Dark obsidian stone
      stoneLeft: 0x1e293b,
      stoneRight: 0x0f172a,
      stoneStroke: 0x64748b,
      waterTop: 0x0284c7,
      waterStroke: 0x38bdf8,
    },
  },
  2: {
    phase: 2,
    name: 'Muling Pagsiklab (Magma Caldera)',
    nameEn: 'Magma Caldera',
    tagline: 'Lupain ng Umaapoy na Lava at Bagang Lupa',
    taglineEn: 'Scorched Basalt and Rivers of Molten Fury',
    description: 'Isang platform na nababalot ng naglalagablab na init at kumukulong magma. Dumadagsa ang mga mechanical at human legion upang puksain ang Demon Lord!',
    descriptionEn: 'A blazing volcanic platform bordered by molten rivers and ash vents. Crusader legions and mecha divisions strike through the fire!',
    waveRange: 'Waves 26 - 50',
    accentColor: '#f97316', // Fiery Orange
    ambientTone: 'fire',
    tilePalette: {
      grassTop: 0x7c2d12,      // Charred earth / cooled lava crust
      grassLeft: 0x431407,
      grassRight: 0x9a3412,
      grassStroke: 0xea580c,
      stoneTop: 0x292524,      // Volcanic dark basalt
      stoneLeft: 0x1c1917,
      stoneRight: 0x0c0a09,
      stoneStroke: 0xf97316,
      waterTop: 0xd97706,      // Molten magma flow instead of blue ocean
      waterStroke: 0xf59e0b,
    },
  },
  3: {
    phase: 3,
    name: 'Niyebeng Kalawakan (Frost Spire)',
    nameEn: 'Frost Spire',
    tagline: 'Malamig na Yelo at Mapaminsalang Bagyo',
    taglineEn: 'Glacial Void Tundra & Howling Subzero Storms',
    description: 'Napakalamig na tuktok ng yelo at sub-zero blizzard. Matitigas na mechanical colossi at elite holy knights ang humahadlang sa pag-usad.',
    descriptionEn: 'Permafrost glacier peaks with subzero winds and frozen crystal matrices. Heavily armored titan mechas and inquisitors invade.',
    waveRange: 'Waves 51 - 75',
    accentColor: '#06b6d4', // Glacial Cyan
    ambientTone: 'frost',
    tilePalette: {
      grassTop: 0x0891b2,      // Glacial frosted ice
      grassLeft: 0x0e7490,
      grassRight: 0x155e75,
      grassStroke: 0x67e8f9,
      stoneTop: 0x475569,      // Snow-capped slate
      stoneLeft: 0x334155,
      stoneRight: 0x1e293b,
      stoneStroke: 0x94a3b8,
      waterTop: 0x0284c7,      // Frozen sea / icy deeps
      waterStroke: 0xbae6fd,
    },
  },
  4: {
    phase: 4,
    name: 'Banal na Dambana (Astral Sanctum)',
    nameEn: 'Astral Sanctum',
    tagline: 'Rurok ng Langit at Banal na Hukbo ng mga Tao',
    taglineEn: 'Celestial Spires & the Grand Zenith Crusade',
    description: 'Lumulutang na santwaryo ng ginto at puting marmol sa tuktok ng uniberso. Dito nagtitipon ang buong lakas ng sangkatauhan bago ang Regression!',
    descriptionEn: 'High-altitude floating crystal spires and radiant holy marble ruins. The ultimate human and mecha armadas challenge the supreme Demon Lord!',
    waveRange: 'Waves 76 - 100',
    accentColor: '#fbbf24', // Celestial Gold
    ambientTone: 'astral',
    tilePalette: {
      grassTop: 0x4f46e5,      // Astral nebula ground
      grassLeft: 0x3730a3,
      grassRight: 0x312e81,
      grassStroke: 0x818cf8,
      stoneTop: 0xe2e8f0,      // Celestial white marble
      stoneLeft: 0x94a3b8,
      stoneRight: 0x64748b,
      stoneStroke: 0xfef08a,
      waterTop: 0x7c3aed,      // Astral void lake
      waterStroke: 0xc084fc,
    },
  },
} as const;

export const SEASON_CONFIGS = {
  SPRING: {
    name: 'Tagsibol (Spring)',
    nameEn: 'Spring',
    icon: '🌸',
    color: '#10b981',
    description: 'Sariwang hangin at mabilis na pagtubo ng kalikasan. Normal na panahon.',
    descriptionEn: 'Fresh winds and gentle renewal. Balanced conditions across the realm.',
    dayRange: 'Day 1 - 91',
  },
  SUMMER: {
    name: 'Tag-araw (Summer)',
    nameEn: 'Summer',
    icon: '☀️',
    color: '#f59e0b',
    description: 'Mataas na sikat ng araw at matinding init. Madalas ang Heatwave.',
    descriptionEn: 'Blazing sun and sweltering temperatures. Higher heatwave frequency.',
    dayRange: 'Day 92 - 182',
  },
  AUTUMN: {
    name: 'Taglagas (Autumn)',
    nameEn: 'Autumn',
    icon: '🍂',
    color: '#ea580c',
    description: 'Malamig na simoy at pagkalagas ng dahon. Madalas ang malalakas na ulan.',
    descriptionEn: 'Crisp breezes and falling foliage. Frequent rainfalls and storms.',
    dayRange: 'Day 183 - 273',
  },
  WINTER: {
    name: 'Taglamig (Winter)',
    nameEn: 'Winter',
    icon: '❄️',
    color: '#06b6d4',
    description: 'Napakalamig na hamog at yelo. Madalas ang pag-ulan ng niyebe.',
    descriptionEn: 'Freezing temperatures and frostbite. Heavy snowfalls throughout.',
    dayRange: 'Day 274 - 365',
  },
} as const;

export type EquipmentSlot = 'TOOL' | 'ARMOR' | 'RELIC';

export interface EquipmentStats {
  bonusSpeed?: number;
  bonusCargo?: number;
  bonusAttack?: number;
  bonusHp?: number;
  bonusGatherPercent?: number;
  staminaDrainReduction?: number;
}

export interface EquipmentItem {
  id: string;
  name: string;
  slot: EquipmentSlot;
  description: string;
  icon: string;
  stats: EquipmentStats;
  costResources: {
    shards?: number;
    wood?: number;
    stone?: number;
    essence?: number;
  };
  costCoins?: number;
}

export interface WorkerEquipment {
  tool?: EquipmentItem;
  armor?: EquipmentItem;
  relic?: EquipmentItem;
}

export interface TileInfo {
  x: number;
  y: number;
  type: TileType;
  walkable: boolean;
  elevation: number;
}

export type WorkerStatus =
  | 'IDLE'
  | 'MOVING_TO_NODE'
  | 'HARVESTING'
  | 'RETURNING_TO_NEXUS'
  | 'COMBAT'
  | 'HEALING';

export type HarvestTask = 'AETHER' | 'WOOD' | 'STONE' | 'METAL' | 'ESSENCE' | 'FISH' | 'WATER' | 'HEAL' | 'BUILD';

export const TASK_NODE_LOCATIONS: Record<HarvestTask, GridPoint> = {
  AETHER: { x: 1, y: 1 },  // Crystalline Spires (North)
  STONE: { x: 8, y: 2 },   // Runic Quarry (East)
    METAL: { x: 2, y: 5 },   // Metal Mine (West)
  WOOD: { x: 8, y: 8 },    // Ancient Grove (South-East)
  ESSENCE: { x: 1, y: 8 }, // Mystic Void Cave (West)
  FISH: { x: 1, y: 8 },    // Port fishing spot
  WATER: { x: 1, y: 8 },   // Port freshwater intake
  HEAL: { x: 5, y: 5 },    // Healing task (roams dynamically, fallback center)
  BUILD: { x: 5, y: 5 },   // Castle repair / Node replenishment (roams dynamically)
};

export const TASK_CONFIG: Record<
  HarvestTask,
  {
    label: string;
    icon: string;
    resourceKey: 'aetherShards' | 'wood' | 'stone' | 'metal' | 'arcaneEssence' | 'fish' | 'water';
    color: number;
    hexColor: string;
    description: string;
  }
> = {
  AETHER: {
    label: 'Kristal (Gems)',
    icon: '💎',
    resourceKey: 'aetherShards',
    color: 0x38bdf8,
    hexColor: '#38bdf8',
    description: 'Mamitas ng makinang na asul na kristal sa hilaga',
  },
  WOOD: {
    label: 'Kahoy (Wood)',
    icon: '🌲',
    resourceKey: 'wood',
    color: 0x10b981,
    hexColor: '#10b981',
    description: 'Pumutol ng mga kahoy sa kagubatan',
  },
  STONE: {
    label: 'Bato (Stone)',
    icon: '🪨',
    resourceKey: 'stone',
    color: 0xf59e0b,
    hexColor: '#f59e0b',
    description: 'Magmina ng matitibay na bato sa minahan',
  },
  METAL: {
    label: 'Metal',
    icon: '🔩',
    resourceKey: 'metal',
    color: 0x8b5cf6,
    hexColor: '#8b5cf6',
    description: 'Magmina ng metal sa madilim na Metal Mine',
  },
  ESSENCE: {
    label: 'Magic (Potion)',
    icon: '🔮',
    resourceKey: 'arcaneEssence',
    color: 0xa855f7,
    hexColor: '#a855f7',
    description: 'Kumuha ng mahiwagang likido sa kweba',
  },
  FISH: {
    label: 'Isda (Fish)',
    icon: '🐟',
    resourceKey: 'fish',
    color: 0x0ea5e9,
    hexColor: '#0ea5e9',
    description: 'Manghuli ng isda sa karagatan',
  },
  WATER: {
    label: 'Tubig (Water)',
    icon: '💧',
    resourceKey: 'water',
    color: 0x3b82f6,
    hexColor: '#3b82f6',
    description: 'Kumuha ng sariwang tubig',
  },
  HEAL: {
    label: 'Heal (Pagpapagaling)',
    icon: '💚',
    resourceKey: 'arcaneEssence', // placeholder, doesn't actually gather
    color: 0x22c55e,
    hexColor: '#22c55e',
    description: 'Pagalingin ang mga nasugatang alagad',
  },
  BUILD: {
    label: 'Build (Pagkukumpuni at Pagtatanim)',
    icon: '🔨',
    resourceKey: 'wood', // placeholder, doesn't actually gather
    color: 0x15803d,
    hexColor: '#15803d',
    description: 'Kumpunihin ang kastilyo at magpatubo ng mga bagong yaman',
  },
};

export type UnitClass = 'GOLEM' | 'WAYFARER' | 'CHRONO' | 'AQUA_SLIME' | 'MERMAN' | 'NECROMANCER' | 'TREANT';

export interface SlimeSupportProfile {
  level: 1 | 2 | 3 | 4 | 5;
  healTargets: number;
  healPercent: number;
  fatigueRestorePercent: number;
  speedBonusPercent: number;
  armorPercent: number;
  armorDurationSeconds: number;
  resurrectionCooldownSeconds: number;
  resurrectionCost: {
    aetherShards: number;
    arcaneEssence: number;
    wood: number;
    stone: number;
  };
  label: string;
}

export const SUPPORT_SLIME_EVOLUTION: Record<1 | 2 | 3 | 4 | 5, SlimeSupportProfile> = {
  1: {
    level: 1,
    healTargets: 1,
    healPercent: 8,
    fatigueRestorePercent: 6,
    speedBonusPercent: 0,
    armorPercent: 0,
    armorDurationSeconds: 0,
    resurrectionCooldownSeconds: 60,
    resurrectionCost: {
      aetherShards: 50,
      arcaneEssence: 10,
      wood: 35,
      stone: 35,
    },
    label: 'Support Slime',
  },
  2: {
    level: 2,
    healTargets: 2,
    healPercent: 12,
    fatigueRestorePercent: 10,
    speedBonusPercent: 5,
    armorPercent: 0,
    armorDurationSeconds: 0,
    resurrectionCooldownSeconds: 45,
    resurrectionCost: {
      aetherShards: 40,
      arcaneEssence: 8,
      wood: 25,
      stone: 25,
    },
    label: 'Whisp',
  },
  3: {
    level: 3,
    healTargets: 3,
    healPercent: 16,
    fatigueRestorePercent: 15,
    speedBonusPercent: 10,
    armorPercent: 0,
    armorDurationSeconds: 0,
    resurrectionCooldownSeconds: 30,
    resurrectionCost: {
      aetherShards: 30,
      arcaneEssence: 6,
      wood: 18,
      stone: 18,
    },
    label: 'Eather',
  },
  4: {
    level: 4,
    healTargets: 4,
    healPercent: 22,
    fatigueRestorePercent: 20,
    speedBonusPercent: 15,
    armorPercent: 15,
    armorDurationSeconds: 6,
    resurrectionCooldownSeconds: 20,
    resurrectionCost: {
      aetherShards: 20,
      arcaneEssence: 4,
      wood: 12,
      stone: 12,
    },
    label: 'Gelatinous Blob',
  },
  5: {
    level: 5,
    healTargets: Infinity,
    healPercent: 30,
    fatigueRestorePercent: 30,
    speedBonusPercent: 25,
    armorPercent: 30,
    armorDurationSeconds: 12,
    resurrectionCooldownSeconds: 10, // Shortest cooldown at max level
    resurrectionCost: {
      aetherShards: 10,
      arcaneEssence: 2,
      wood: 5,
      stone: 5,
    },
    label: 'Ichor Slime',
  },
};

export interface TreantEvolutionProfile {
  level: 1 | 2 | 3 | 4 | 5;
  label: string;
  labelEn: string;
  repairAmount: number;
  replenishCooldownSeconds: number;
  castleRepairCooldownSeconds: number;
  enrichmentMultiplier: number;
  castleMajestyBonus: number; // Percent bonus to global realm productivity when castle is at peak condition
  upgradeCost: {
    aetherShards: number;
    wood: number;
    stone: number;
    coins: number;
  };
}

export const TREANT_EVOLUTION: Record<1 | 2 | 3 | 4 | 5, TreantEvolutionProfile> = {
  1: {
    level: 1,
    label: 'Sinaunang Binhi (Sprout Ent)',
    labelEn: 'Sprout Ent',
    repairAmount: 25,
    replenishCooldownSeconds: 28,
    castleRepairCooldownSeconds: 2.5,
    enrichmentMultiplier: 1.25,
    castleMajestyBonus: 10,
    upgradeCost: { aetherShards: 35, wood: 30, stone: 25, coins: 40 },
  },
  2: {
    level: 2,
    label: 'Buhay na Troso (Timber Warden)',
    labelEn: 'Timber Warden',
    repairAmount: 45,
    replenishCooldownSeconds: 22,
    castleRepairCooldownSeconds: 2.0,
    enrichmentMultiplier: 1.4,
    castleMajestyBonus: 15,
    upgradeCost: { aetherShards: 60, wood: 50, stone: 40, coins: 80 },
  },
  3: {
    level: 3,
    label: 'Bantay ng Kagubatan (Grove Sentinel)',
    labelEn: 'Grove Sentinel',
    repairAmount: 70,
    replenishCooldownSeconds: 18,
    castleRepairCooldownSeconds: 1.6,
    enrichmentMultiplier: 1.6,
    castleMajestyBonus: 20,
    upgradeCost: { aetherShards: 95, wood: 80, stone: 65, coins: 140 },
  },
  4: {
    level: 4,
    label: 'Pundasyon ng Lupa (Ironbark Titan)',
    labelEn: 'Ironbark Titan',
    repairAmount: 110,
    replenishCooldownSeconds: 14,
    castleRepairCooldownSeconds: 1.2,
    enrichmentMultiplier: 1.8,
    castleMajestyBonus: 25,
    upgradeCost: { aetherShards: 140, wood: 120, stone: 100, coins: 220 },
  },
  5: {
    level: 5,
    label: 'Diyos ng Kagubatan (World Tree Elder)',
    labelEn: 'World Tree Elder',
    repairAmount: 180,
    replenishCooldownSeconds: 10,
    castleRepairCooldownSeconds: 0.8,
    enrichmentMultiplier: 2.0,
    castleMajestyBonus: 35,
    upgradeCost: { aetherShards: 200, wood: 180, stone: 150, coins: 350 },
  },
};

export type GodBlessingId = 'CELESTIAL_HARVEST' | 'AEGIS_WRATH' | 'TITAN_AWAKENING';

export interface GodBlessingConfig {
  id: GodBlessingId;
  name: string;
  nameEn: string;
  category: 'GATHERING' | 'INVASION' | 'MINIONS';
  icon: string;
  color: string;
  description: string;
  descriptionEn: string;
  durationSeconds: number;
  costResources: {
    aetherShards: number;
    arcaneEssence: number;
    coins: number;
  };
}

export const GOD_BLESSINGS: Record<GodBlessingId, GodBlessingConfig> = {
  CELESTIAL_HARVEST: {
    id: 'CELESTIAL_HARVEST',
    name: 'Biyaya ng Kalangitan (Celestial Abundance)',
    nameEn: 'Celestial Abundance',
    category: 'GATHERING',
    icon: '✨🌾',
    color: '#fbbf24',
    description: 'Biyaya mula sa Diyos ng Kasaganaan: Triple (3x) cargo harvest yield at 50% bilis sa lahat ng minero at mangingisda.',
    descriptionEn: 'Divine Grace of Abundance: Triples (3x) cargo harvest yields and boosts gathering movement speed by +50%.',
    durationSeconds: 60,
    costResources: { aetherShards: 60, arcaneEssence: 12, coins: 120 },
  },
  AEGIS_WRATH: {
    id: 'AEGIS_WRATH',
    name: 'Poot ng Maykapal (Wrath of Aegis)',
    nameEn: 'Wrath of Aegis',
    category: 'INVASION',
    icon: '⚡🛡️',
    color: '#38bdf8',
    description: 'Biyaya mula sa Diyos ng Digmaan: Awtomatikong pinapaputok ang kidlat sa mga lumulusob, 2x lakas ng kastilyo turrets, at 50% pinsalang bawas sa pader.',
    descriptionEn: 'Divine Wrath: Smites invaders with continuous celestial lightning, doubles automated turret fire rate, and reduces castle damage by 50%.',
    durationSeconds: 45,
    costResources: { aetherShards: 75, arcaneEssence: 15, coins: 150 },
  },
  TITAN_AWAKENING: {
    id: 'TITAN_AWAKENING',
    name: 'Paggising ng Titano (Titan Awakening)',
    nameEn: 'Titan Awakening',
    category: 'MINIONS',
    icon: '🔥👑',
    color: '#f43f5e',
    description: 'Biyaya mula sa Diyos ng Lakas: Walang kapagurang stamina (0 fatigue drain), 2.5x Combat ATK, at permanenteng armor shield sa lahat ng alagad habang umiiral.',
    descriptionEn: 'Divine Empowerment: Grants infinite stamina (zero fatigue drain), +150% Combat ATK, and radiant shielding to all servants.',
    durationSeconds: 50,
    costResources: { aetherShards: 80, arcaneEssence: 18, coins: 180 },
  },
};

export interface UnitClassConfig {
  classType: UnitClass;
  name: string;
  nameEn?: string;
  subtitle: string;
  subtitleEn?: string;
  description: string;
  descriptionEn?: string;
  baseSpeed: number;
  cargoCapacity: number;
  staminaDrainRate: number;
  lanternRadius: number;
  lanternColor: number;
  lanternHex: string;
  preferredTask: HarvestTask;
  requiredNexusLevel: number;
  requiredRefineryLevel: number;
  iconEmoji: string;
  baseHp: number;
  baseAttack: number;
  attackRange: number;
}

export const UNIT_CLASSES: Record<UnitClass, UnitClassConfig> = {
  GOLEM: {
    classType: 'GOLEM',
    name: 'Golem ng Lupa (Earth Golem)',
    nameEn: 'Earth Golem',
    subtitle: 'Matibay na Alagad ng Lupa 🪨🛡️',
    subtitleEn: 'Stonebound Earth Defender 🪨🛡️',
    description: 'Isang matibay na alagad na may katawan ng bato at sandatang tagapagtanggol ng kuta. Hindi umaatake agad, ngunit nagsisilbi bilang matibay na pader ng iyong hukbo.',
    descriptionEn: 'A sturdy earth-bound guardian forged from stone, serving as a resilient wall and protector rather than a frontline aggressor.',
    baseSpeed: 75,
    cargoCapacity: 1,
    staminaDrainRate: 20,
    lanternRadius: 38,
    lanternColor: 0xef4444,
    lanternHex: '#ef4444',
    preferredTask: 'STONE',
    requiredNexusLevel: 1,
    requiredRefineryLevel: 1,
    iconEmoji: '🪨',
    baseHp: 260,
    baseAttack: 28,
    attackRange: 60,
  },
  WAYFARER: {
    classType: 'WAYFARER',
    name: 'Wayvern ng Himpapawid (Aerial Fire)',
    nameEn: 'Aerial Fire Wayvern',
    subtitle: 'Mabilis na Alagad ng Himpapawid at Apoy 🔥🪽',
    subtitleEn: 'Swift Aerial Flame Warden 🔥🪽',
    description: 'Isang manipis at mabilis na nilalang na may apoy na pakpak, tumutulong sa paglipad sa pangangasiwa at paghanda ng mga kakampi sa labanan.',
    descriptionEn: 'A swift aerial creature with flame-winged flight, supporting the party with speed, mobility, and battlefield utility instead of direct aggression.',
    baseSpeed: 110,
    cargoCapacity: 1,
    staminaDrainRate: 20,
    lanternRadius: 48,
    lanternColor: 0xf97316,
    lanternHex: '#f97316',
    preferredTask: 'WOOD',
    requiredNexusLevel: 2, 
    requiredRefineryLevel: 1,
    iconEmoji: '🪽',
    baseHp: 140,
    baseAttack: 22,
    attackRange: 75,
  },
  CHRONO: {
    classType: 'CHRONO',
    name: 'Lumilipad na Arch-Demon',
    nameEn: 'Flying Arch-Demon',
    subtitle: 'Mahiwagang Alagad na may Pakpak 🔮🦇',
    subtitleEn: 'Magical Winged Servant 🔮🦇',
    description: 'Mataas na uri ng demonyo na lumulutang gamit ang mga pakpak ng paniki. Maraming dalang Magic mula sa kweba.',
    descriptionEn: 'A high-tier demon floating on bat wings. Carries a lot of Magic Essence from the caves.',
    baseSpeed: 92,
    cargoCapacity: 2,
    staminaDrainRate: 15,
    lanternRadius: 44,
    lanternColor: 0xa855f7,
    lanternHex: '#a855f7',
    preferredTask: 'ESSENCE',
    requiredNexusLevel: 2,
    requiredRefineryLevel: 2,
    iconEmoji: '🦇',
    baseHp: 120,
    baseAttack: 45,
    attackRange: 160,
  },
  AQUA_SLIME: {
    classType: 'AQUA_SLIME',
    name: 'Support Healing Slime',
    nameEn: 'Support Healing Slime',
    subtitle: 'Walang-Kamatayang Tagapagpagaling at Tagapagbuhay 💚✨',
    subtitleEn: 'Immortal Healer & Resurrector 💚✨',
    description: 'Nag-iisang banal na slime (1 unit lamang). Hindi nangangalap ng yaman, immune sa anumang atake ng kaaway, at kusang sumusunod sa kakamping may pinakamababang HP o fatigue upang gamutin at buhaying muli gamit ang resources.',
    descriptionEn: 'A unique companion (strictly 1 unit). Cannot gather resources, is immune to enemy attacks and cannot be killed. Automatically follows the lowest HP or fatigue ally to heal and resurrect them using compensation resources.',
    baseSpeed: 95,
    cargoCapacity: 0,
    staminaDrainRate: 0,
    lanternRadius: 38,
    lanternColor: 0x22c55e,
    lanternHex: '#22c55e',
    preferredTask: 'HEAL',
    requiredNexusLevel: 1,
    requiredRefineryLevel: 1,
    iconEmoji: '💚',
    baseHp: 9999,
    baseAttack: 0,
    attackRange: 0,
  },
  MERMAN: {
    classType: 'MERMAN',
    name: 'Merman ng Tubig (Water Guardian)',
    nameEn: 'Water Merman',
    subtitle: 'Tagapangalaga ng tubig at kaligtasan 💧🛡️',
    subtitleEn: 'Water Guardian 💧🛡️',
    description: 'Isang bilis at maayos na tagapangalaga ng dagat na tumutulong sa pagsuporta at pagtulong sa mga kakampi gamit ang mga alon ng tubig.',
    descriptionEn: 'A graceful water guardian that supports allies and blasts invaders with defensive water surges.',
    baseSpeed: 85,
    cargoCapacity: 1,
    staminaDrainRate: 14,
    lanternRadius: 36,
    lanternColor: 0x06b6d4,
    lanternHex: '#06b6d4',
    preferredTask: 'FISH',
    requiredNexusLevel: 2,
    requiredRefineryLevel: 1,
    iconEmoji: '🧜',
    baseHp: 190,
    baseAttack: 18,
    attackRange: 65,
  },
  NECROMANCER: {
    classType: 'NECROMANCER',
    name: 'Lich Necromancer',
    nameEn: 'Lich Necromancer',
    subtitle: 'Manggagamot at Tagapagligtas 💀💚',
    subtitleEn: 'Healer and Savior 💀💚',
    description: 'Gumagamit ng itim na mahika para pagalingin ang mga kakampi at magdulot ng pinsala sa mga sumasalakay.',
    descriptionEn: 'Uses dark magic to heal allies and siphon health from invaders during combat.',
    baseSpeed: 90,
    cargoCapacity: 1,
    staminaDrainRate: 15,
    lanternRadius: 40,
    lanternColor: 0x22c55e,
    lanternHex: '#22c55e',
    preferredTask: 'HEAL',
    requiredNexusLevel: 3,
    requiredRefineryLevel: 2,
    iconEmoji: '💀',
    baseHp: 170,
    baseAttack: 24,
    attackRange: 90,
  },
  TREANT: {
    classType: 'TREANT',
    name: 'Sinaunang Treant (Ent Builder)',
    nameEn: 'Ancient Treant (Ent)',
    subtitle: 'Tagapagtayo ng Kastilyo at Tagapagpalaganap ng Kalikasan 🌲🔨',
    subtitleEn: 'Ancient Forest Warden & Castle Builder 🌲🔨',
    description: 'Nag-iisang tagapagtayo (1 unit lamang bawat platform). Tulad ng Slime, hindi ito nangangalap ng yaman, hindi nakikipaglaban, at immune sa anumang pinsala. Nagkukumpuni ng kastilyo at nagpapatubo muli ng mga bagong yaman sa iba-ibang dako ng isla.',
    descriptionEn: 'A unique builder minion (strictly 1 unit per platform). Cannot gather or fight, and is immune to all damage. Repairs and maintains the castle, and regrows depleted resource nodes in random platform locations.',
    baseSpeed: 70,
    cargoCapacity: 0,
    staminaDrainRate: 0,
    lanternRadius: 42,
    lanternColor: 0x16a34a,
    lanternHex: '#16a34a',
    preferredTask: 'BUILD',
    requiredNexusLevel: 1,
    requiredRefineryLevel: 1,
    iconEmoji: '🌲',
    baseHp: 9999,
    baseAttack: 0,
    attackRange: 0,
  }
};

export interface WorkerData {
  id: string;
  name: string;
  unitClass: UnitClass;
  assignedTask: HarvestTask;
  gridX: number;
  gridY: number;
  screenX: number;
  screenY: number;
  status: WorkerStatus;
  cargo: number;
  maxCargo: number;
  stamina: number;
  maxStamina: number;
  harvestProgress: number;
}

export type InvaderType = 'HUMAN_KNIGHT' | 'HUMAN_ARCHER' | 'MECHA_SCOUT' | 'MECHA_TITAN' | 'VOID_SHADE' | 'RIFT_STALKER' | 'CORRUPTED_GOLEM' | 'DEEP_ONE';

export interface InvaderConfig {
  type: InvaderType;
  name: string;
  nameEn?: string;
  category: 'HUMAN' | 'MECHA';
  subtitle: string;
  subtitleEn?: string;
  description: string;
  descriptionEn?: string;
  hp: number;
  speed: number;
  damage: number;
  attackRange: number;
  color: number;
  hexColor: string;
  bountyCoins: number;
  iconEmoji: string;
  requiredNexusLevel: number;
}

export const INVADER_CONFIGS: Record<InvaderType, InvaderConfig> = {
  HUMAN_KNIGHT: {
    type: 'HUMAN_KNIGHT',
    name: 'Kawal ng Tao (Crusader Knight)',
    nameEn: 'Crusader Knight',
    category: 'HUMAN',
    subtitle: 'Mandirigmang Tao na may Espada at Kalasag ⚔️🛡️',
    subtitleEn: 'Human Warrior with Sword & Shield ⚔️🛡️',
    description: 'Isang matapang na kawal ng kaharian ng tao na may suot na makintab na bakal at espadang pilak.',
    descriptionEn: 'A brave soldier of the human kingdom wearing shiny armor and a silver sword.',
    hp: 70,
    speed: 65,
    damage: 16,
    color: 0x38bdf8,
    hexColor: '#38bdf8',
    bountyCoins: 18,
    iconEmoji: '⚔️',
    requiredNexusLevel: 1,
    attackRange: 45,
  },
  HUMAN_ARCHER: {
    type: 'HUMAN_ARCHER',
    name: 'Mamamana ng Tao (Elven Hunter)',
    nameEn: 'Elven Hunter',
    category: 'HUMAN',
    subtitle: 'Mabilis na Mamamana ng mga Tao 🏹🍃',
    subtitleEn: 'Fast Human Archer 🏹🍃',
    description: 'Mabilis kumilos at asintado sa pagpana ng mga alagad ng Demon Lord.',
    descriptionEn: 'Moves fast and shoots arrows accurately at the Demon Lord\'s servants.',
    hp: 55,
    speed: 85,
    damage: 18,
    color: 0x22c55e,
    hexColor: '#22c55e',
    bountyCoins: 22,
    iconEmoji: '🏹',
    requiredNexusLevel: 1,
    attackRange: 160,
  },
  MECHA_SCOUT: {
    type: 'MECHA_SCOUT',
    name: 'Makinang Mecha Walker',
    nameEn: 'Mecha Walker',
    category: 'MECHA',
    subtitle: 'Mabilis na Cyber Recon Robot 🤖⚙️',
    subtitleEn: 'Fast Cyber Recon Robot 🤖⚙️',
    description: 'Robot na ginawa ng mga siyentipiko ng tao na may dalawang mekanikal na paa at laser scanner.',
    descriptionEn: 'A robot built by human scientists with two mechanical legs and a laser scanner.',
    hp: 115,
    speed: 75,
    damage: 28,
    color: 0xeab308,
    hexColor: '#eab308',
    bountyCoins: 38,
    iconEmoji: '🤖',
    requiredNexusLevel: 2,
    attackRange: 130,
  },
  MECHA_TITAN: {
    type: 'MECHA_TITAN',
    name: 'Mabigat na Mecha Titan',
    nameEn: 'Heavy Mecha Titan',
    category: 'MECHA',
    subtitle: 'Higanteng Makinang Pandigma 🦾⚡',
    subtitleEn: 'Giant War Machine 🦾⚡',
    description: 'Napakalaking bakal na robot na may dalang mga kanyon para wasakin ang kuta ng Demon Lord!',
    descriptionEn: 'A massive steel robot equipped with cannons to destroy the Demon Lord\'s citadel!',
    hp: 280,
    speed: 45,
    damage: 42,
    color: 0xf43f5e,
    hexColor: '#f43f5e',
    bountyCoins: 75,
    iconEmoji: '🦾',
    requiredNexusLevel: 3,
    attackRange: 70,
  },
  DEEP_ONE: {
    type: 'DEEP_ONE',
    name: 'Halimaw ng Karagatan (Deep One)',
    nameEn: 'Deep One',
    category: 'HUMAN', // Technically a monster, but we use HUMAN/MECHA for simplicity or maybe add WATER
    subtitle: 'Nakakatakot na Nilalang mula sa Ilalim 🐙🌊',
    subtitleEn: 'Terrifying Creature from the Depths 🐙🌊',
    description: 'Isang mabangis na halimaw ng karagatan na umaatake mula sa tubig. Sobrang lakas ng buhay at atake.',
    descriptionEn: 'A fierce ocean monster that attacks from the water. Incredibly high health and damage.',
    hp: 150,
    speed: 55,
    damage: 26,
    color: 0x0284c7,
    hexColor: '#0284c7',
    bountyCoins: 45,
    iconEmoji: '🐙',
    requiredNexusLevel: 2,
    attackRange: 50,
  },
  // Backwards compatibility aliases
  VOID_SHADE: {
    type: 'VOID_SHADE',
    name: 'Kawal ng Tao (Crusader Knight)',
    category: 'HUMAN',
    subtitle: 'Mandirigmang Tao na may Espada ⚔️',
    description: 'Isang kawal ng tao na sumusugod sa kuta ng Demon Lord.',
    hp: 55,
    speed: 65,
    damage: 18,
    color: 0x38bdf8,
    hexColor: '#38bdf8',
    bountyCoins: 15,
    iconEmoji: '⚔️',
    requiredNexusLevel: 1,
    attackRange: 45,
  },
  RIFT_STALKER: {
    type: 'RIFT_STALKER',
    name: 'Makinang Mecha Walker',
    category: 'MECHA',
    subtitle: 'Cyber Recon Robot 🤖',
    description: 'Mabilis na robot na sumusugod sa kuta ng Demon Lord.',
    hp: 95,
    speed: 75,
    damage: 26,
    color: 0xeab308,
    hexColor: '#eab308',
    bountyCoins: 35,
    iconEmoji: '🤖',
    requiredNexusLevel: 2,
    attackRange: 140,
  },
  CORRUPTED_GOLEM: {
    type: 'CORRUPTED_GOLEM',
    name: 'Mabigat na Mecha Titan',
    category: 'MECHA',
    subtitle: 'Higanteng Makinang Pandigma 🦾',
    description: 'Napakalaking bakal na robot na may dalang kanyon.',
    hp: 190,
    speed: 45,
    damage: 45,
    color: 0xf43f5e,
    hexColor: '#f43f5e',
    bountyCoins: 65,
    iconEmoji: '🦾',
    requiredNexusLevel: 3,
    attackRange: 65,
  },
};

export interface TurretBolt {
  id: string;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  progress: number;
  damage: number;
}

export const CRAFTABLE_ITEMS: EquipmentItem[] = [
  {
    id: 'rune_pickaxe',
    name: 'Rune Pickaxe',
    slot: 'TOOL',
    description: 'Forged with raw aether crystals. Increases Aether Shard gathering yield by +1 and grants +20 Combat Attack.',
    icon: '⛏️',
    stats: { bonusGatherPercent: 25, bonusAttack: 20 },
    costResources: { shards: 25, stone: 30 },
  },
  {
    id: 'lumberjack_cleaver',
    name: 'Grove Woodcleaver',
    slot: 'TOOL',
    description: 'Reinforced timber blade. Increases Grove Wood gathering speed by +20% and grants +25 Combat Attack.',
    icon: '🪓',
    stats: { bonusSpeed: 15, bonusAttack: 25 },
    costResources: { wood: 40, shards: 15 },
  },
  {
    id: 'granite_sledge',
    name: 'Granite Sledge',
    slot: 'TOOL',
    description: 'Crushes runic quarry stone with ease. +35 Combat Attack and +1 Cargo capacity on stone.',
    icon: '🔨',
    stats: { bonusCargo: 1, bonusAttack: 35 },
    costResources: { stone: 50, wood: 20 },
  },
  {
    id: 'aether_blade',
    name: 'Void Aether Blade',
    slot: 'TOOL',
    description: 'Gleaming blade woven from condensed void essence. Strikes invading crusade soldiers for +65 Combat Attack.',
    icon: '⚔️',
    stats: { bonusAttack: 65, bonusGatherPercent: 30 },
    costResources: { essence: 20, shards: 40 },
  },
  {
    id: 'ironstone_plating',
    name: 'Ironstone Plating',
    slot: 'ARMOR',
    description: 'Heavy basalt chestplate. Grants +140 Max HP and reduces damage taken from invaders.',
    icon: '🛡️',
    stats: { bonusHp: 140 },
    costResources: { stone: 45, shards: 20 },
  },
  {
    id: 'verdant_cloak',
    name: 'Verdant Travel Cloak',
    slot: 'ARMOR',
    description: 'Silken woven nomad cloak. Reduces fatigue stamina drain by 40% and increases speed by +20.',
    icon: '🦹',
    stats: { staminaDrainReduction: 40, bonusSpeed: 20 },
    costResources: { wood: 50, essence: 10 },
  },
  {
    id: 'aegis_core',
    name: 'Aegis Guardian Core',
    slot: 'ARMOR',
    description: 'Miniature kinetic field generator. Grants +220 Max HP and +30 Combat Attack.',
    icon: '💠',
    stats: { bonusHp: 220, bonusAttack: 30 },
    costResources: { essence: 25, stone: 40 },
  },
  {
    id: 'swift_boots',
    name: 'Zephyr Wind Boots',
    slot: 'RELIC',
    description: 'Lightweight enchanted boots. Grants +35 movement speed across the citadel.',
    icon: '👢',
    stats: { bonusSpeed: 35 },
    costResources: { wood: 30, shards: 25 },
    costCoins: 45,
  },
  {
    id: 'dimensional_pouch',
    name: 'Aether Cargo Pouch',
    slot: 'RELIC',
    description: 'Folded pocket dimension allowing the bearer to haul +2 extra resource cargo per trip.',
    icon: '🎒',
    stats: { bonusCargo: 2 },
    costResources: { shards: 35, wood: 25 },
    costCoins: 60,
  },
  {
    id: 'vitality_charm',
    name: 'Eternal Vitality Charm',
    slot: 'RELIC',
    description: 'Spiritual amulet granting +80 Max HP and 25% stamina drain reduction.',
    icon: '🧿',
    stats: { bonusHp: 80, staminaDrainReduction: 25 },
    costResources: { essence: 15, stone: 30 },
    costCoins: 50,
  },
];
