import { CASTLE_GATE, NODE_SPOTS } from '../state/buildingLayout';
import type { GridPoint, HarvestTask } from '../types/game';

/** Gathering / support tasks: where each is worked and how it is shown. */

// Work spots beside each structure's footprint (src/data/buildingLayout.json)
export const TASK_NODE_LOCATIONS: Record<HarvestTask, GridPoint> = {
  AETHER: NODE_SPOTS.AETHER,   // Crystal Spire (West)
  STONE: NODE_SPOTS.STONE,     // Runic Quarry (East)
  METAL: NODE_SPOTS.METAL,     // Metal Mine (East)
  WOOD: NODE_SPOTS.WOOD,       // Ancient Grove (South-East)
  ESSENCE: NODE_SPOTS.ESSENCE, // Mystic Cave (South)
  FISH: NODE_SPOTS.PORT,       // Port fishing spot
  WATER: NODE_SPOTS.PORT,      // Port freshwater intake
  HEAL: CASTLE_GATE,           // Healing task (roams dynamically, fallback gate)
  BUILD: CASTLE_GATE,          // Castle repair / Node replenishment (roams dynamically)
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
