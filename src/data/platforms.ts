/** The four realms the citadel ascends through (waves 1–25, 26–50, 51–75, 76–100): names, lore and palette. */

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
