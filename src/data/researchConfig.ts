import type { Resources, UpgradesState } from '../types/state';

export interface ResearchNodeConfig {
  key: keyof UpgradesState;
  column: 1 | 2 | 3;
  columnTitleTagalog: string;
  columnTitleEnglish: string;
  nameTagalog: string;
  nameEnglish: string;
  descriptionTagalog: string;
  descriptionEnglish: string;
  icon: string;
  baseCost: Partial<Resources>;
  costMultiplier: number;
  maxLevel: number;
}

export interface ResearchCategoryConfig {
  id: 'SLIME' | 'ENT' | 'CASTLE' | 'ESTABLISHMENTS' | 'TENANTS';
  titleTagalog: string;
  titleEnglish: string;
  descriptionTagalog: string;
  descriptionEnglish: string;
  icon: string;
  nodes: ResearchNodeConfig[];
}

export const RESEARCH_CATEGORIES: ResearchCategoryConfig[] = [
  {
    id: 'SLIME',
    titleTagalog: '1. Ang Support Slime',
    titleEnglish: '1. The Support Slime',
    descriptionTagalog: 'Pangunahing tagapangalaga, kagamitan sa kalakalan, at lunas sa buong kaharian.',
    descriptionEnglish: 'Primary guardian, trading automation, and realm-wide healing support.',
    icon: '💧',
    nodes: [
      {
        key: 'slimeAttackHeal',
        column: 1,
        columnTitleTagalog: 'Atake / Lunas / Konstruksyon',
        columnTitleEnglish: 'Attack / Heal / Construct',
        nameTagalog: 'Banal na Pagpapagaling',
        nameEnglish: 'Divine Aura Healing',
        descriptionTagalog: '+15% lakas ng panggagamot at +2 karagdagang target kada antas.',
        descriptionEnglish: '+15% healing potency and +2 additional targets per level.',
        icon: '💚',
        baseCost: { aetherShards: 25, water: 40, coins: 15 },
        costMultiplier: 1.35,
        maxLevel: 20
      },
      {
        key: 'slimeDefenseAbsorb',
        column: 2,
        columnTitleTagalog: 'Depensa / HP Bar / Pagsipsip',
        columnTitleEnglish: 'Defense / HP Bar / Absorption',
        nameTagalog: 'Kalasag ng Tubig & Pagsipsip',
        nameEnglish: 'Aqueous Absorption Barrier',
        descriptionTagalog: '+10% proteksyon sa pinsala at pagsipsip ng 5% enerhiya mula sa kaaway.',
        descriptionEnglish: '+10% damage absorption and 5% energy siphoning from enemies.',
        icon: '🛡️',
        baseCost: { aetherShards: 30, stone: 35, coins: 20 },
        costMultiplier: 1.4,
        maxLevel: 20
      },
      {
        key: 'slimeCooldownBurst',
        column: 3,
        columnTitleTagalog: 'Cooldown / Bilang (Max 3) / Ultimates',
        columnTitleEnglish: 'Cooldown / Count (Max 3) / Ultimate',
        nameTagalog: 'Kusang Bilis & Burst Pulse',
        nameEnglish: 'Rapid Pulse & Cooldowns',
        descriptionTagalog: '-10% bilis ng cooldown sa pagbuhay (Resurrection) at pabilisin ang auto-actions.',
        descriptionEnglish: '-10% cooldown on resurrection and faster support action pulses.',
        icon: '⚡',
        baseCost: { aetherShards: 45, arcaneEssence: 20, coins: 30 },
        costMultiplier: 1.45,
        maxLevel: 20
      }
    ]
  },
  {
    id: 'ENT',
    titleTagalog: '2. Ang Matandang Treant',
    titleEnglish: '2. The Ancient Treant',
    descriptionTagalog: 'Arkitekto ng kaharian, tagapagtanggol sa kalikasan, at gumagamit ng survival skills (QWERT).',
    descriptionEnglish: 'Realm architect, nature defender, and wielder of survival skills (QWERT).',
    icon: '🌲',
    nodes: [
      {
        key: 'entAttackConstruct',
        column: 1,
        columnTitleTagalog: 'Atake / Lunas / Konstruksyon',
        columnTitleEnglish: 'Attack / Heal / Construct',
        nameTagalog: 'Mabilis na Pagtatayo & Pukpok',
        nameEnglish: 'Titan Construct & Root Smash',
        descriptionTagalog: '+20% bilis ng pagkukumpuni sa mga gusali at +15% lakas ng atake ng Treant.',
        descriptionEnglish: '+20% structure repair speed and +15% Treant branch strike damage.',
        icon: '🔨',
        baseCost: { wood: 50, stone: 30, coins: 20 },
        costMultiplier: 1.35,
        maxLevel: 20
      },
      {
        key: 'entDefenseHpBar',
        column: 2,
        columnTitleTagalog: 'Depensa / HP Bar / Pagsipsip',
        columnTitleEnglish: 'Defense / HP Bar / Absorption',
        nameTagalog: 'Balisasang Kahoy & Balat-Bato',
        nameEnglish: 'Barkskin Armor & Max HP',
        descriptionTagalog: '+25% Max HP at +10% resistensya sa lahat ng uri ng pinsala.',
        descriptionEnglish: '+25% Max HP and +10% elemental damage reduction.',
        icon: '🪵',
        baseCost: { wood: 60, stone: 45, coins: 25 },
        costMultiplier: 1.4,
        maxLevel: 20
      },
      {
        key: 'entCooldownSurvival',
        column: 3,
        columnTitleTagalog: 'Cooldown / Bilang (Max 3) / Ultimates',
        columnTitleEnglish: 'Cooldown / Count (Max 3) / Ultimate',
        nameTagalog: 'QWERT Survival Mastery',
        nameEnglish: 'QWERT Survival Skill Mastery',
        descriptionTagalog: '-12% cooldown sa Root Slam, Barkskin, Spore Fog, at Verdant Surge.',
        descriptionEnglish: '-12% cooldown reduction on all active QWERT survival abilities.',
        icon: '🌿',
        baseCost: { wood: 40, arcaneEssence: 25, coins: 35 },
        costMultiplier: 1.45,
        maxLevel: 20
      }
    ]
  },
  {
    id: 'CASTLE',
    titleTagalog: '3. Ang Muog / Citadel',
    titleEnglish: '3. The Citadel & Spire',
    descriptionTagalog: 'Puso ng kaharian at sentro ng kuta laban sa sumasalakay na mga nilalang.',
    descriptionEnglish: 'The fortress core and centerpiece of kingdom defense against invasions.',
    icon: '🏰',
    nodes: [
      {
        key: 'castleAttackTurret',
        column: 1,
        columnTitleTagalog: 'Atake / Lunas / Konstruksyon',
        columnTitleEnglish: 'Attack / Heal / Construct',
        nameTagalog: 'Kanyon ng Muog & Beacon',
        nameEnglish: 'Citadel Artillery & Beacon',
        descriptionTagalog: '+20% pinsala ng tore ng kuta at mas malawak na sakop ng Provoke Beacon.',
        descriptionEnglish: '+20% citadel tower damage and extended provocation beacon range.',
        icon: '🏹',
        baseCost: { stone: 60, wood: 40, coins: 25 },
        costMultiplier: 1.38,
        maxLevel: 20
      },
      {
        key: 'castleDefenseArmor',
        column: 2,
        columnTitleTagalog: 'Depensa / HP Bar / Pagsipsip',
        columnTitleEnglish: 'Defense / HP Bar / Absorption',
        nameTagalog: 'Bakasang Pader & Kinetic Shield',
        nameEnglish: 'Reinforced Walls & Shield',
        descriptionTagalog: '+30% Castle Max HP at mas mabilis na pag-charge ng kinetic barrier.',
        descriptionEnglish: '+30% Castle Max HP and accelerated kinetic barrier regeneration.',
        icon: '🧱',
        baseCost: { stone: 80, aetherShards: 30, coins: 30 },
        costMultiplier: 1.42,
        maxLevel: 20
      },
      {
        key: 'castleCooldownUltimate',
        column: 3,
        columnTitleTagalog: 'Cooldown / Bilang (Max 3) / Ultimates',
        columnTitleEnglish: 'Cooldown / Count (Max 3) / Ultimate',
        nameTagalog: 'Abyssal Overdrive & Overcharge',
        nameEnglish: 'Citadel Ultimate Overcharge',
        descriptionTagalog: '-15% cooldown sa Abyssal Overdrive at Arcane Spire Resonance.',
        descriptionEnglish: '-15% cooldown on Abyssal Overdrive and Spire Arcane Resonance.',
        icon: '🔮',
        baseCost: { arcaneEssence: 40, aetherShards: 50, coins: 45 },
        costMultiplier: 1.5,
        maxLevel: 20
      }
    ]
  },
  {
    id: 'ESTABLISHMENTS',
    titleTagalog: '4. Mga Gusali / Establishments',
    titleEnglish: '4. Establishments & Outposts',
    descriptionTagalog: 'Tahanan ng produksyon, minahan, daungan, at tagapagtaguyod ng mga Tenants.',
    descriptionEnglish: 'Production hubs, mines, docks, and the living quarters of Tenants.',
    icon: '🏭',
    nodes: [
      {
        key: 'establishmentAttackWork',
        column: 1,
        columnTitleTagalog: 'Atake / Lunas / Konstruksyon',
        columnTitleEnglish: 'Attack / Heal / Construct',
        nameTagalog: 'Lakas ng Produksyon & Tore',
        nameEnglish: 'Outpost Yield & Tower Fire',
        descriptionTagalog: '+15% ani ng mga gusali at +15% lakas ng atake ng kanilang depensang tore.',
        descriptionEnglish: '+15% resource production rate and +15% outpost defense tower damage.',
        icon: '⚙️',
        baseCost: { wood: 50, stone: 50, coins: 25 },
        costMultiplier: 1.35,
        maxLevel: 20
      },
      {
        key: 'establishmentDefenseBar',
        column: 2,
        columnTitleTagalog: 'Depensa / HP Bar / Pagsipsip',
        columnTitleEnglish: 'Defense / HP Bar / Absorption',
        nameTagalog: 'Kondisyon ng Gusali (HP Bar)',
        nameEnglish: 'Establishment Defense Bar',
        descriptionTagalog: '+25% HP bar sa lahat ng gusali. Pinipigilan ang pagkasira at pag-detach ng tenants.',
        descriptionEnglish: '+25% structure integrity bar. Prevents tenant detachment under siege.',
        icon: '🛡️',
        baseCost: { stone: 70, wood: 45, coins: 30 },
        costMultiplier: 1.4,
        maxLevel: 20
      },
      {
        key: 'establishmentCooldownSkill',
        column: 3,
        columnTitleTagalog: 'Cooldown / Bilang (Max 3) / Ultimates',
        columnTitleEnglish: 'Cooldown / Count (Max 3) / Ultimate',
        nameTagalog: 'Bilis ng Kasanayan sa Gusali',
        nameEnglish: 'Establishment Skill Speed',
        descriptionTagalog: '-15% cooldown sa mga aktibong kakayahan ng lahat ng establisyimento.',
        descriptionEnglish: '-15% cooldown on all active establishment skills and boosts.',
        icon: '⏱️',
        baseCost: { aetherShards: 40, arcaneEssence: 30, coins: 35 },
        costMultiplier: 1.45,
        maxLevel: 20
      }
    ]
  },
  {
    id: 'TENANTS',
    titleTagalog: '5. Mga Umuupa / Tenants',
    titleEnglish: '5. Tenants & Defenders',
    descriptionTagalog: 'Mga ipinatawag na residente na nagbibigay ng 20% depensa at gumaganti kapag na-detach.',
    descriptionEnglish: 'Summoned residents granting 20% establishment defense and retaliating upon detachment.',
    icon: '👥',
    nodes: [
      {
        key: 'tenantAttackCounter',
        column: 1,
        columnTitleTagalog: 'Atake / Lunas / Konstruksyon',
        columnTitleEnglish: 'Attack / Heal / Construct',
        nameTagalog: 'Ganti ng Umuupa (Counter-Attack)',
        nameEnglish: 'Tenant Retaliation & Counter',
        descriptionTagalog: '+25% lakas ng atake ng na-detach na tenant laban sa umaatake sa kanilang gusali o muog.',
        descriptionEnglish: '+25% tenant attack power when defending detached parent outposts and castle.',
        icon: '⚔️',
        baseCost: { wood: 45, stone: 45, coins: 25 },
        costMultiplier: 1.38,
        maxLevel: 20
      },
      {
        key: 'tenantDefenseBar',
        column: 2,
        columnTitleTagalog: 'Depensa / HP Bar / Pagsipsip',
        columnTitleEnglish: 'Defense / HP Bar / Absorption',
        nameTagalog: 'Tether ng Depensa (20% Defense Shield)',
        nameEnglish: 'Tenant Defense Tether Shield',
        descriptionTagalog: '+5% dagdag na kalasag sa bawat tenant (tumaas mula 20% tungo sa 25%+) at +30% Tenant HP.',
        descriptionEnglish: '+5% bonus tether defense per tenant and +30% individual tenant health.',
        icon: '🔰',
        baseCost: { stone: 60, aetherShards: 35, coins: 30 },
        costMultiplier: 1.4,
        maxLevel: 20
      },
      {
        key: 'tenantCooldownSummon',
        column: 3,
        columnTitleTagalog: 'Cooldown / Bilang (Max 3) / Ultimates',
        columnTitleEnglish: 'Cooldown / Count (Max 3) / Ultimate',
        nameTagalog: 'Mabilis na Pagbabalik (Free Resummon)',
        nameEnglish: 'Tenant Free Resummon Cooldown',
        descriptionTagalog: '-20% cooldown bago muling matawag ang napatay na tenant matapos ang alon nang walang bayad.',
        descriptionEnglish: '-20% cooldown timer for establishments to freely re-summon fallen tenants after waves.',
        icon: '🔄',
        baseCost: { arcaneEssence: 35, aetherShards: 40, coins: 35 },
        costMultiplier: 1.45,
        maxLevel: 20
      }
    ]
  }
];

export function calcResearchCost(node: ResearchNodeConfig, currentLevel: number): Partial<Resources> {
  const cost: Partial<Resources> = {};
  const multiplier = Math.pow(node.costMultiplier, Math.max(0, currentLevel - 1));
  for (const [key, val] of Object.entries(node.baseCost) as [keyof Resources, number][]) {
    cost[key] = Math.max(1, Math.floor((val ?? 0) * multiplier));
  }
  return cost;
}
