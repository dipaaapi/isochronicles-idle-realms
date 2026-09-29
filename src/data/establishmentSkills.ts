/**
 * 2 unique establishment skills per ResourceBuildingId.
 * Skills are completely distinct from armed-unit abilities.
 */

import type { ResourceBuildingId } from '../types/state';

export interface EstablishmentSkillDef {
  id: string;
  nameEn: string;
  nameTl: string;
  descriptionEn: string;
  descriptionTl: string;
  /** Duration of one-time activation effect in seconds (0 = instant) */
  effectDuration: number;
  /** Cooldown in seconds before the skill can be used again */
  cooldownSeconds: number;
  /** Hex color for the active skill dot */
  activeColor: string;
  icon: string;
}

export interface EstablishmentSkillPair {
  skill1: EstablishmentSkillDef;
  skill2: EstablishmentSkillDef;
}

export const ESTABLISHMENT_SKILLS: Record<ResourceBuildingId, EstablishmentSkillPair> = {
  QUARRY: {
    skill1: {
      id: 'QUARRY_SEISMIC_SHATTER',
      nameEn: 'Seismic Shatter',
      nameTl: 'Lindol na Pagkasira',
      descriptionEn: 'Sends a shockwave that deals 120 damage to all invaders in the defense zone.',
      descriptionTl: 'Nagpapadala ng shock wave na nagdudulot ng 120 pinsala sa lahat ng manlulupig sa loob ng depensa.',
      effectDuration: 0,
      cooldownSeconds: 45,
      activeColor: '#f59e0b',
      icon: '💥',
    },
    skill2: {
      id: 'QUARRY_STONE_FORTRESS',
      nameEn: 'Stone Fortress',
      nameTl: 'Kuta ng Bato',
      descriptionEn: 'Temporarily reinforces all establishments, reducing incoming damage by 50% for 20 seconds.',
      descriptionTl: 'Pansamantalang nagpapatibay sa lahat ng gusali, binabawasan ang pinsalang natanggap ng 50% sa loob ng 20 segundo.',
      effectDuration: 20,
      cooldownSeconds: 90,
      activeColor: '#d97706',
      icon: '🏰',
    },
  },
  MINE: {
    skill1: {
      id: 'MINE_SPIKE_VOLLEY',
      nameEn: 'Spike Volley+',
      nameTl: 'Tulos na Pag-ulan',
      descriptionEn: 'Launches iron spikes at the 3 nearest invaders, dealing 90 damage each.',
      descriptionTl: 'Naglulunsad ng mga tulos na bakal sa 3 pinakamalapit na manlulupig, nagdudulot ng 90 pinsala sa bawat isa.',
      effectDuration: 0,
      cooldownSeconds: 35,
      activeColor: '#94a3b8',
      icon: '⚙️',
    },
    skill2: {
      id: 'MINE_IRON_SKIN',
      nameEn: 'Iron Skin',
      nameTl: 'Bakal na Balat',
      descriptionEn: 'Coats allied minions in metallic armor for 15 seconds (+40 armor shield each).',
      descriptionTl: 'Binabalatak ang mga kasamahang minyon ng metal na baluti sa loob ng 15 segundo (+40 kalasag ng armor bawat isa).',
      effectDuration: 15,
      cooldownSeconds: 80,
      activeColor: '#64748b',
      icon: '🛡️',
    },
  },
  WOOD: {
    skill1: {
      id: 'WOOD_ANCIENT_ROOTS',
      nameEn: 'Ancient Roots',
      nameTl: 'Sinaunang Ugat',
      descriptionEn: 'Erupts roots that immobilize all invaders in the zone for 8 seconds.',
      descriptionTl: 'Pumutok ang mga ugat na pumipigil sa lahat ng manlulupig sa loob ng 8 segundo.',
      effectDuration: 8,
      cooldownSeconds: 60,
      activeColor: '#4ade80',
      icon: '🌿',
    },
    skill2: {
      id: 'WOOD_NATURE_SURGE',
      nameEn: 'Nature Surge',
      nameTl: 'Lakas ng Kalikasan',
      descriptionEn: 'Regenerates 25% HP for all allied minions and boosts their speed by 30% for 12 seconds.',
      descriptionTl: 'Nagrehenerate ng 25% HP para sa lahat ng kasamahang minyon at pinapabilis ang kanilang bilis ng 30% sa loob ng 12 segundo.',
      effectDuration: 12,
      cooldownSeconds: 100,
      activeColor: '#22c55e',
      icon: '✨',
    },
  },
  PORT: {
    skill1: {
      id: 'PORT_TIDAL_WAVE',
      nameEn: 'Tidal Wave',
      nameTl: 'Alon ng Dagat',
      descriptionEn: 'Unleashes a massive wave that pushes all invaders back and deals 80 damage.',
      descriptionTl: 'Naglalabas ng malaking alon na nagtutulak sa lahat ng manlulupig at nagdudulot ng 80 pinsala.',
      effectDuration: 0,
      cooldownSeconds: 50,
      activeColor: '#38bdf8',
      icon: '🌊',
    },
    skill2: {
      id: 'PORT_FROST_BIND',
      nameEn: 'Frost Bind',
      nameTl: 'Yelong Gapos',
      descriptionEn: 'Freezes the 5 closest invaders solid for 10 seconds (cannot move or attack).',
      descriptionTl: 'Nagyeyelo ng 5 pinakamalapit na manlulupig ng 10 segundo (hindi makagalaw o makaatake).',
      effectDuration: 10,
      cooldownSeconds: 75,
      activeColor: '#06b6d4',
      icon: '❄️',
    },
  },
  CAVE: {
    skill1: {
      id: 'CAVE_SOUL_SIPHON',
      nameEn: 'Soul Siphon',
      nameTl: 'Pagsipsip ng Kaluluwa',
      descriptionEn: 'Drains 30 HP from each invader in range and heals the Castle for the same total amount.',
      descriptionTl: 'Sumusupsop ng 30 HP mula sa bawat manlulupig sa loob ng hanay at nagpapagaling ng Kastilyo ng parehong kabuuang halaga.',
      effectDuration: 0,
      cooldownSeconds: 40,
      activeColor: '#a855f7',
      icon: '💀',
    },
    skill2: {
      id: 'CAVE_INFERNO_BURST',
      nameEn: 'Inferno Burst',
      nameTl: 'Pagsabog ng Apoy',
      descriptionEn: 'Triggers a massive explosion dealing 200 damage to the nearest invader and 60 splash damage to those nearby.',
      descriptionTl: 'Nagdudulot ng malaking pagsabog na nagdudulot ng 200 pinsala sa pinakamalapit na manlulupig at 60 splash na pinsala sa mga kalapit.',
      effectDuration: 0,
      cooldownSeconds: 120,
      activeColor: '#f97316',
      icon: '🔥',
    },
  },
};
