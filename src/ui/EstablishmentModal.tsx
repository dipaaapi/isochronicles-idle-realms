import React, { useState } from 'react';
import { useGameStore } from '../state/useGameStore';
import { RESOURCE_BUILDING_CONFIG, RESOURCE_PRICES } from '../state/useGameStore';
import { BUILDING_IDS } from '../state/buildingLayout';
import { DEFENSE_TEXT, buildingHpOf, buildingMaxHp, towerBuildingOf, towerLevelOf } from '../state/defenseStats';
import { ESTABLISHMENT_SKILLS, type EstablishmentSkillDef } from '../data/establishmentSkills';
import { useTranslation } from '../i18n/translations';
import { BEAST_PORTRAITS } from '../game/bestiaryPortraits';
import { UNIT_CLASSES } from '../data/units';
import { RESEARCH_CATEGORIES, ResearchNodeConfig } from '../data/researchConfig';
import { techUpgradeCost, getUnitSummonCost } from '../state/economy';
import { canAfford } from '../state/resources';
import { soundFx } from '../game/audio/soundFx';
import type { ResourceBuildingId, Resources } from '../types/state';
import type { StructureId } from '../game/StructureManager';
import type { UnitClass, HarvestTask } from '../types/game';
import { TASK_CONFIG } from '../data/tasks';

// ── Types ──────────────────────────────────────────────────────────────────────

export type EstabTab = 'ESTABLISHMENT' | 'TENANT' | 'GENERAL_UPGRADES';

interface EstablishmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedId: StructureId | null;
  initialTab?: EstabTab;
}

// ── Helpers & Constants ────────────────────────────────────────────────────────

const ESTABLISHMENTS_LIST: { id: StructureId; label: string; labelEn: string; icon: string }[] = [
  { id: 'CASTLE', label: 'Kastilyo', labelEn: 'Castle', icon: '🏰' },
  { id: 'SPIRE', label: DEFENSE_TEXT.spireName.tl, labelEn: DEFENSE_TEXT.spireName.en, icon: '💎' },
  ...BUILDING_IDS.map((id) => ({
    id: id as StructureId,
    label: RESOURCE_BUILDING_CONFIG[id]?.label ?? id,
    labelEn: RESOURCE_BUILDING_CONFIG[id]?.labelEn ?? id,
    icon: RESOURCE_BUILDING_CONFIG[id]?.icon ?? '🏛️',
  })),
];

const ESTABLISHMENT_CHAMPIONS: Partial<Record<StructureId, UnitClass[]>> = {
  SPIRE: ['SUCCUBUS'],
  QUARRY: ['GOLEM'],
  WOOD: ['LAVA_GARGOYLE'],
  PORT: ['MERMAN'],
  CRYPT: ['NECROMANCER'],
  TRENCH: ['KRAKEN'],
  KENNEL: ['DEMON_HOUND'],
  PERCH: ['HARPY'],
  MINE: ['DEMON_HOUND'],
  CAVE: ['NECROMANCER'],
  CASTLE: ['TREANT', 'AQUA_SLIME'],
};

function fmtNum(n: number): string {
  return n.toLocaleString();
}

function CooldownBar({ cooldown, maxCooldown, color }: {
  cooldown: number;
  maxCooldown: number;
  color: string;
}) {
  const pct = maxCooldown > 0 ? Math.max(0, Math.min(1, 1 - cooldown / maxCooldown)) : 1;
  const ready = cooldown <= 0;
  return (
    <div className="w-full bg-slate-700/80 rounded-full h-1.5 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-200"
        style={{ width: `${pct * 100}%`, background: ready ? color : '#6b7280' }}
      />
    </div>
  );
}

function SkillCard({
  skill,
  cooldown,
  onTrigger,
  disabled,
  tl,
}: {
  skill: EstablishmentSkillDef;
  cooldown: number;
  onTrigger: () => void;
  disabled: boolean;
  tl: boolean;
}) {
  const ready = cooldown <= 0;
  const isUlt = !!skill.isUltimate;

  return (
    <div
      className={`space-y-1.5 rounded-xl p-3 transition-all border ${
        isUlt
          ? 'bg-amber-950/25 border-amber-500/50 shadow-sm shadow-amber-900/30'
          : 'bg-slate-850 bg-slate-800/60 border-slate-700/60'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg shrink-0">{skill.icon}</span>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-bold truncate ${isUlt ? 'text-amber-300' : 'text-slate-100'}`}>
                {tl ? skill.nameTl : skill.nameEn}
              </span>
              {isUlt && (
                <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 font-mono">
                  ULTIMATE
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className={`w-2 h-2 rounded-full ${ready ? (isUlt ? 'bg-amber-400' : 'bg-emerald-400') : 'bg-red-500'}`} />
          <button
            disabled={disabled || !ready}
            onClick={onTrigger}
            className={`text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all border ${
              ready && !disabled
                ? isUlt
                  ? 'bg-amber-600 hover:bg-amber-500 text-slate-950 border-amber-400 shadow-sm shadow-amber-500/30 active:scale-95 cursor-pointer'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white border-cyan-400/60 active:scale-95 cursor-pointer'
                : 'bg-slate-800 text-slate-500 border-slate-700 opacity-60 cursor-not-allowed'
            }`}
          >
            {ready ? (tl ? 'Gamitin' : 'Use') : `${Math.ceil(cooldown)}s`}
          </button>
        </div>
      </div>
      <p className="text-[11px] text-slate-300/90 leading-snug">
        {tl ? skill.descriptionTl : skill.descriptionEn}
      </p>
      <CooldownBar cooldown={cooldown} maxCooldown={skill.cooldownSeconds} color={skill.activeColor} />
      <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
        <span>{tl ? 'Pahinga:' : 'Cooldown:'} {skill.cooldownSeconds}s</span>
        <span className={ready ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
          {ready ? (tl ? 'HANDA' : 'READY') : `${Math.ceil(cooldown)}s`}
        </span>
      </div>
    </div>
  );
}

// ── Main Modal Component ───────────────────────────────────────────────────────

export const EstablishmentModal: React.FC<EstablishmentModalProps> = ({
  isOpen,
  onClose,
  selectedId,
  initialTab = 'ESTABLISHMENT',
}) => {
  const [activeTab, setActiveTab] = useState<EstabTab>(initialTab);
  const [activeEstab, setActiveEstab] = useState<StructureId>(selectedId ?? 'CASTLE');
  const { isTL } = useTranslation();

  const {
    roster,
    resourceBuildings,
    spireBuilt,
    spireTower,
    defense,
    castleBuilt,
    resources,
    upgrades,
    autoBuySummon,
    establishmentSkillCooldowns,
    triggerEstablishmentSkill,
    upgradeResourceBuilding,
    upgradeTower,
    repairBuilding,
    summonUnit,
    toggleAutoBuySummon,
    assignUnitTask,
    upgradeTech,
  } = useGameStore();

  React.useEffect(() => {
    if (selectedId) setActiveEstab(selectedId);
  }, [selectedId]);

  if (!isOpen) return null;

  const isCastle = activeEstab === 'CASTLE';
  const isSpire = activeEstab === 'SPIRE';
  const buildingState = isCastle ? null : towerBuildingOf({ spireBuilt, spireTower, resourceBuildings }, activeEstab) ?? null;
  const buildingConfig = isCastle ? null : RESOURCE_BUILDING_CONFIG[activeEstab as ResourceBuildingId];
  const bid = activeEstab as ResourceBuildingId;

  // HP
  const hp = isCastle ? defense.castleHp : (buildingState ? buildingHpOf(buildingState) : 0);
  const maxHp = isCastle ? defense.castleMaxHp : (buildingState ? buildingMaxHp(towerLevelOf(buildingState)) : 0);
  const hpPct = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  const hpColor = hpPct > 0.5 ? '#22c55e' : hpPct > 0.25 ? '#f59e0b' : '#ef4444';

  // Defence / tower
  const tLevel = buildingState ? towerLevelOf(buildingState) : 0;
  const defPct = isCastle ? defense.shieldHp / Math.max(1, defense.shieldMaxHp) : tLevel / 5;
  const defColor = '#38bdf8';

  // Ancient Ent requirement check
  const hasEnt = roster.some((u) => u.unitClass === 'TREANT');

  // Skills
  const skillTrio = ESTABLISHMENT_SKILLS[activeEstab as keyof typeof ESTABLISHMENT_SKILLS] ?? null;
  const cooldowns = establishmentSkillCooldowns[activeEstab as keyof typeof establishmentSkillCooldowns] ?? { skill1: 0, skill2: 0, skill3: 0 };

  // Production Upgrade cost
  const nextLevel = buildingState ? buildingState.level + 1 : 1;
  const upgradeCost = buildingConfig?.costs[nextLevel - 1] ?? null;
  const canAffordUpgrade = castleBuilt && !!buildingState && buildingState.level >= 1 &&
    !!upgradeCost && Object.entries(upgradeCost).every(([k, v]) => ((resources[k as keyof typeof resources] ?? 0) as number) >= (v as number));

  const isOperational = isCastle ? castleBuilt : isSpire ? spireBuilt : (buildingState?.level ?? 0) >= 1;

  // Champions for this active establishment
  const championClasses = ESTABLISHMENT_CHAMPIONS[activeEstab] ?? [];

  // Allowed tasks for generals (General fighters CANNOT do BUILD)
  const availableHarvestTasks: HarvestTask[] = ['WOOD', 'STONE', 'METAL', 'FISH', 'AETHER', 'ESSENCE'];

  // Research categories for General Upgrades tab
  const activeResearchCategory = activeEstab === 'CASTLE' ? 'CASTLE' : 'ESTABLISHMENTS';
  const primaryCategory = RESEARCH_CATEGORIES.find((c) => c.id === activeResearchCategory) || RESEARCH_CATEGORIES[3];
  const tenantCategory = RESEARCH_CATEGORIES.find((c) => c.id === 'TENANTS') || RESEARCH_CATEGORIES[4];

  // Living tenants calculations for this establishment
  const tenantAttackBonus = 1 + ((upgrades.tenantAttackCounter ?? 1) - 1) * 0.25;
  const tenantHpBonus = ((upgrades.tenantDefenseBar ?? 1) - 1) * 40;
  const tenantCdBonus = Math.min(0.6, ((upgrades.tenantCooldownSummon ?? 1) - 1) * 0.12);

  const handleTechUpgrade = (node: ResearchNodeConfig) => {
    const currentLevel = (upgrades[node.key] as number) ?? 1;
    if (currentLevel >= node.maxLevel) return;
    const cost = techUpgradeCost(node.key, currentLevel);
    if (!canAfford(resources, cost)) {
      soundFx.playCastleHit();
      return;
    }
    const success = upgradeTech(node.key);
    if (success) soundFx.playFanfare();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-sm animate-fade-in select-none" onClick={onClose}>
      <div
        className="relative w-full max-w-4xl h-[90vh] flex flex-col rounded-3xl bg-slate-950 border border-slate-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Top Header ── */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-900/90 border-b border-slate-800/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-xl">
              🏛️
            </div>
            <div>
              <h2 className="text-sm md:text-base font-bold text-white tracking-wide">
                {isTL ? 'Pangangasiwa ng mga Pasilidad' : 'Establishments & Outposts'}
              </h2>
              <p className="text-[11px] text-slate-400">
                {isTL ? 'Pasilidad, Umuupa (Tenants), Kampeon, at mga Upgrade' : 'Establishment, Tenants & General Champions, and Upgrades'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* ── Top Establishment Switcher ── */}
        <div className="flex overflow-x-auto gap-2 px-4 py-2.5 bg-slate-900/60 border-b border-slate-800/70 shrink-0 custom-scrollbar">
          {ESTABLISHMENTS_LIST.map(({ id, label, labelEn, icon }) => {
            const active = id === activeEstab;
            const isBuilt = id === 'CASTLE' ? castleBuilt : id === 'SPIRE' ? spireBuilt : (resourceBuildings[id]?.level ?? 0) >= 1;
            return (
              <button
                key={id}
                onClick={() => {
                  soundFx.playClick();
                  setActiveEstab(id);
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs shrink-0 border transition-all cursor-pointer ${
                  active
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 border-indigo-400 text-white font-bold shadow-lg shadow-indigo-500/20 scale-102'
                    : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                } ${!isBuilt ? 'opacity-40' : ''}`}
              >
                <span className="text-base">{icon}</span>
                <span className="font-semibold text-xs whitespace-nowrap">{isTL ? label : labelEn}</span>
              </button>
            );
          })}
        </div>

        {/* ── Establishment Vital Stats (HP & Tower/Shield Bar) ── */}
        <div className="px-5 py-3 bg-slate-900/40 border-b border-slate-800/60 shrink-0 space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-bold text-slate-400 w-6">HP</span>
            <div className="flex-1 bg-slate-800 rounded-full h-2.5 overflow-hidden border border-slate-700/50">
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${hpPct * 100}%`, background: hpColor }} />
            </div>
            <span className="text-[11px] font-mono text-slate-200 font-bold min-w-[90px] text-right">
              {fmtNum(Math.round(hp))} / {fmtNum(Math.round(maxHp))}
            </span>
            {!isCastle && (buildingState?.level ?? 0) >= 1 && (
              <span className="text-[10px] font-bold text-amber-400 ml-1 shrink-0 px-2 py-0.5 rounded-lg bg-amber-950/60 border border-amber-500/40">
                Tower Lv.{tLevel}
              </span>
            )}
            <div className="flex gap-1.5 ml-2 shrink-0">
              <div
                className={`w-3 h-3 rounded-full border border-slate-700 ${cooldowns.skill1 <= 0 ? 'bg-cyan-400 shadow-sm shadow-cyan-400' : 'bg-red-500'}`}
                title={cooldowns.skill1 <= 0 ? 'Skill 1 Ready' : `${Math.ceil(cooldowns.skill1)}s`}
              />
              <div
                className={`w-3 h-3 rounded-full border border-slate-700 ${cooldowns.skill2 <= 0 ? 'bg-purple-400 shadow-sm shadow-purple-400' : 'bg-red-500'}`}
                title={cooldowns.skill2 <= 0 ? 'Skill 2 Ready' : `${Math.ceil(cooldowns.skill2)}s`}
              />
              <div
                className={`w-3 h-3 rounded-full border border-amber-500 ${cooldowns.skill3 <= 0 ? 'bg-amber-400 shadow-sm shadow-amber-400' : 'bg-red-900'}`}
                title={cooldowns.skill3 <= 0 ? 'Ultimate Ready' : `${Math.ceil(cooldowns.skill3)}s`}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-400 w-6">{isCastle ? '🛡️' : '🗼'}</span>
            <div className="flex-1 bg-slate-800 rounded-full h-2.5 overflow-hidden border border-slate-700/50">
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${defPct * 100}%`, background: defColor }} />
            </div>
            <span className="text-[11px] font-mono text-slate-200 font-bold min-w-[90px] text-right">
              {isCastle ? `${fmtNum(defense.shieldHp)} / ${fmtNum(defense.shieldMaxHp)}` : `Tower Lv ${tLevel} / 5`}
            </span>
          </div>
        </div>

        {/* ── 3 Main Tabs: Establishment, Tenant, General Upgrades ── */}
        <div className="flex border-b border-slate-800/80 shrink-0 bg-slate-900/80 px-4">
          {[
            { id: 'ESTABLISHMENT' as EstabTab, label: isTL ? '🏛️ Pasilidad' : '🏛️ Establishment', desc: isTL ? 'Info, Skills, Upgrade & Kumpuni' : 'Info, Skills, Upgrades & Repair' },
            { id: 'TENANT' as EstabTab, label: isTL ? '👥 Umuupa & Kampeon' : '👥 Tenant & Generals', desc: isTL ? '20% Depensa, Umuupa, at Kampeon' : '20% Defense Tether & Generals' },
            { id: 'GENERAL_UPGRADES' as EstabTab, label: isTL ? '⚡ Pangkalahatang Upgrade' : '⚡ General Upgrades', desc: isTL ? 'Sentro ng Agham at Pagsulong' : 'Domain Research Matrix' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                soundFx.playClick();
                setActiveTab(tab.id);
              }}
              className={`flex-1 py-3 px-2 text-xs md:text-sm font-bold transition-all border-b-2 cursor-pointer flex flex-col items-center gap-0.5 ${
                activeTab === tab.id
                  ? 'text-indigo-300 border-indigo-500 bg-indigo-950/20'
                  : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <span>{tab.label}</span>
              <span className="text-[10px] font-normal text-slate-400 hidden sm:inline">{tab.desc}</span>
            </button>
          ))}
        </div>

        {/* ── Tab Content Body ── */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar bg-slate-950/30 space-y-4">

          {/* ═════════ TAB 1: ESTABLISHMENT (Includes Info, Skills, Upgrades & Repair) ═════════ */}
          {activeTab === 'ESTABLISHMENT' && (
            <div className="space-y-4">
              {/* Structure Overview & Info */}
              <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <span>📊</span>
                    <span>{isTL ? 'Katayuan ng Pasilidad' : 'Establishment Status'}</span>
                  </h3>
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                    isOperational ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300' : 'bg-red-950/80 border-red-500/50 text-red-300'
                  }`}>
                    {isOperational ? (isTL ? 'Gumagana' : 'Operational') : (isTL ? 'Nakasara / Hindi Pa Naitatayo' : 'Unbuilt / Wrecked')}
                  </span>
                </div>

                {isCastle ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="text-slate-400 text-[10px]">{isTL ? 'Kastilyo HP' : 'Castle HP'}</div>
                      <div className="font-mono font-bold text-slate-100">{fmtNum(defense.castleHp)} / {fmtNum(defense.castleMaxHp)}</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="text-slate-400 text-[10px]">{isTL ? 'Kinetic Shield' : 'Shield'}</div>
                      <div className="font-mono font-bold text-cyan-300">{fmtNum(defense.shieldHp)} / {fmtNum(defense.shieldMaxHp)}</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="text-slate-400 text-[10px]">{isTL ? 'Pader' : 'Wall Level'}</div>
                      <div className="font-mono font-bold text-amber-300">Lv. {defense.wallLevel}</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="text-slate-400 text-[10px]">{isTL ? 'Provoke Beacon' : 'Provoke Beacon'}</div>
                      <div className="font-mono font-bold text-purple-300">Lv. {defense.beaconLevel}</div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="text-slate-400 text-[10px]">{isTL ? 'Antas ng Produksyon' : 'Production Level'}</div>
                      <div className="font-mono font-bold text-emerald-300">Lv. {buildingState?.level ?? 0}</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="text-slate-400 text-[10px]">{isTL ? 'Antas ng Depensang Tore' : 'Defense Tower'}</div>
                      <div className="font-mono font-bold text-cyan-300">Lv. {tLevel} / 5</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="text-slate-400 text-[10px]">{isTL ? 'Mga Output' : 'Unlocked Outputs'}</div>
                      <div className="font-mono font-bold text-indigo-300 truncate">
                        {buildingState?.unlockedOutputs?.join(', ') || 'Standard Yield'}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Skills & Ultimates */}
              {skillTrio && (
                <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                      <span>⚡</span>
                      <span>{isTL ? 'Mga Kakayahan ng Gusali' : 'Establishment Skills & Ultimates'}</span>
                    </h3>
                    <span className="text-[10px] text-slate-400 font-mono">3 / 3 Active Skills</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <SkillCard
                      skill={skillTrio.skill1}
                      cooldown={cooldowns.skill1 ?? 0}
                      onTrigger={() => triggerEstablishmentSkill(activeEstab as any, 0)}
                      disabled={!isOperational}
                      tl={isTL}
                    />
                    <SkillCard
                      skill={skillTrio.skill2}
                      cooldown={cooldowns.skill2 ?? 0}
                      onTrigger={() => triggerEstablishmentSkill(activeEstab as any, 1)}
                      disabled={!isOperational}
                      tl={isTL}
                    />
                    <SkillCard
                      skill={skillTrio.skill3}
                      cooldown={cooldowns.skill3 ?? 0}
                      onTrigger={() => triggerEstablishmentSkill(activeEstab as any, 2)}
                      disabled={!isOperational}
                      tl={isTL}
                    />
                  </div>
                </div>
              )}

              {/* Upgrades & Repair Section */}
              <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <span>🔨</span>
                    <span>{isTL ? 'Mga Upgrade & Kumpuni ng Pasilidad' : 'Establishment Upgrades & Repairs'}</span>
                  </h3>
                  <span className="text-[10px] text-indigo-400 font-mono">
                    {hasEnt ? '🌲 Ent Builder Ready' : '⚠️ Ent Required'}
                  </span>
                </div>

                {isCastle ? (
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 flex flex-col md:flex-row items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-white mb-1">🏰 {isTL ? 'Kumpuni ng Kastilyo' : 'Citadel Castle Repairs'}</div>
                      <div className="text-slate-400 text-[11px]">
                        {isTL ? 'Kusang kinukumpuni ng Ancient Ent ang Kastilyo kapag may sapat na kahoy at bato.' : 'The Ancient Ent automatically repairs and fortifies Citadel Castle HP.'}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Production Upgrade Card */}
                    {buildingConfig && upgradeCost && (
                      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between gap-2.5">
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-emerald-300">
                              ⬆️ {isTL ? 'Produksyon' : 'Production'} → Lv. {nextLevel}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">Yield +20%</span>
                          </div>
                          <div className="mt-2 space-y-1 text-[11px]">
                            {Object.entries(upgradeCost).map(([key, val]) => {
                              const have = (resources[key as keyof typeof resources] ?? 0) as number;
                              const enough = have >= (val as number);
                              return (
                                <div key={key} className={`flex justify-between ${enough ? 'text-slate-300' : 'text-rose-400 font-bold'}`}>
                                  <span className="capitalize">{key}</span>
                                  <span className="font-mono">{fmtNum(have)} / {fmtNum(val as number)}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <button
                          disabled={!hasEnt || !canAffordUpgrade}
                          onClick={() => {
                            soundFx.playFanfare();
                            upgradeResourceBuilding(isSpire ? ('SPIRE' as any) : bid);
                          }}
                          className={`w-full py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            hasEnt && canAffordUpgrade
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/30 active:scale-95'
                              : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-60'
                          }`}
                        >
                          {!hasEnt
                            ? `🌲 ${isTL ? 'Kailangan ng Ent' : 'Requires Ent'}`
                            : canAffordUpgrade
                              ? `⬆️ ${isTL ? 'I-Upgrade' : 'Upgrade'}`
                              : isTL ? 'Kulang ang Gamit' : 'Insufficient Resources'}
                        </button>
                      </div>
                    )}

                    {/* Tower Upgrade Card */}
                    <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between gap-2.5">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-cyan-300">
                            🗼 {isTL ? 'Depensang Tore' : 'Defense Tower'}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">Lv. {tLevel} / 5</span>
                        </div>
                        <p className="mt-2 text-[11px] text-slate-400 leading-snug">
                          {isTL
                            ? 'Nagdaragdag ng pinsala, bilis ng pag-atake, at sumasakop sa mga sumasalakay na kaaway.'
                            : 'Enhances projectile defense, range, and fire rate against invading siege columns.'}
                        </p>
                      </div>
                      <button
                        disabled={!buildingState || buildingState.level < 1 || tLevel >= 5}
                        onClick={() => {
                          soundFx.playFanfare();
                          upgradeTower(isSpire ? 'SPIRE' : bid);
                        }}
                        className={`w-full py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          buildingState && buildingState.level >= 1 && tLevel < 5
                            ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-600/30 active:scale-95'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-60'
                        }`}
                      >
                        {tLevel >= 5 ? (isTL ? 'PINAKAMATAAS NA ANTAS' : 'MAX TOWER LEVEL') : `🗼 ${isTL ? 'I-Upgrade ang Tore' : 'Upgrade Tower'}`}
                      </button>
                    </div>

                    {/* Repair Structure Card */}
                    <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between gap-2.5">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-amber-300">
                            🔨 {isTL ? 'Kumpunihin' : 'Repair Structure'}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {hp >= maxHp ? '100% HP' : `${Math.round(hpPct * 100)}% HP`}
                          </span>
                        </div>
                        <p className="mt-2 text-[11px] text-slate-400 leading-snug">
                          {isTL
                            ? 'Ibalik ang buong HP ng pasilidad upang maibalik ang ani at mapanatiling nakatali ang mga tenant.'
                            : 'Restores structural integrity. Prevents tenant detachment and re-activates output.'}
                        </p>
                      </div>
                      <button
                        disabled={!buildingState || buildingState.level < 1 || hp >= maxHp}
                        onClick={() => {
                          soundFx.playDeposit();
                          repairBuilding(isSpire ? 'SPIRE' : bid);
                        }}
                        className={`w-full py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          buildingState && buildingState.level >= 1 && hp < maxHp
                            ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-600/30 active:scale-95'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-60'
                        }`}
                      >
                        {hp >= maxHp ? (isTL ? 'BUO ANG HP' : 'HP FULL') : `🔨 ${isTL ? 'Kumpunihin' : 'Repair'}`}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═════════ TAB 2: TENANT & GENERALS ═════════ */}
          {activeTab === 'TENANT' && (
            <div className="space-y-4">
              {/* 20% Defense Tether Garrison Status Banner */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-950/40 via-indigo-950/40 to-slate-900/60 border border-cyan-500/40 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🛡️</span>
                    <div>
                      <h3 className="text-xs md:text-sm font-bold text-cyan-200">
                        {isTL ? '20% Depensa Bawat Umuupa (Tenant Tether System)' : '20% Defense Bar Per Living Tenant'}
                      </h3>
                      <p className="text-[11px] text-slate-300">
                        {isTL
                          ? 'Bawat umuupa ay nagbibigay ng 20% proteksyon sa bar ng gusali. Kapag inatake, sila ay kusang lalabas sa labanan upang ipagtanggol ang kuta!'
                          : 'Each living tenant fortifies 20% of this establishment\'s defense bar and detaches into combat when under siege!'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right font-mono shrink-0">
                    <span className="text-sm font-black text-cyan-400">5 / 5</span>
                    <div className="text-[10px] text-slate-400">{isTL ? 'Garrisoned' : 'Garrisoned'}</div>
                  </div>
                </div>

                {/* Tenant Combat Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-cyan-500/20 text-xs">
                  <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800">
                    <div className="text-slate-400 text-[10px]">{isTL ? 'Buhay ng Tenant (HP)' : 'Tenant HP'}</div>
                    <div className="font-mono font-bold text-emerald-300">80 {tenantHpBonus > 0 && `(+${tenantHpBonus})`}</div>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800">
                    <div className="text-slate-400 text-[10px]">{isTL ? 'Atake sa Ganti' : 'Counter Attack'}</div>
                    <div className="font-mono font-bold text-rose-300">{Math.round(16 * tenantAttackBonus)} dmg</div>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800">
                    <div className="text-slate-400 text-[10px]">{isTL ? 'Kalasag ng Baluti' : 'Armor Shield'}</div>
                    <div className="font-mono font-bold text-cyan-300">50 + Tether</div>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800">
                    <div className="text-slate-400 text-[10px]">{isTL ? 'Bilis ng Pagtawag' : 'Respawn Cooldown'}</div>
                    <div className="font-mono font-bold text-amber-300">{Math.round(18 * (1 - tenantCdBonus))}s</div>
                  </div>
                </div>
              </div>

              {/* General / Champion for this Establishment */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <span>👑</span>
                    <span>{isTL ? 'Itinalagang Kampeon / Heneral ng Pasilidad' : 'Designated Champion General'}</span>
                  </h3>
                  <span className="text-[10px] text-purple-400 font-mono">
                    {championClasses.length > 0 ? `${championClasses.length} Champion Class` : 'Citadel Defense'}
                  </span>
                </div>

                {championClasses.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 text-center text-xs text-slate-400">
                    {isTL ? 'Walang partikular na kampeon para sa pasilidad na ito.' : 'This establishment relies on the Crystal Spire resonance and garrison tenants.'}
                  </div>
                ) : (
                  championClasses.map((cls) => {
                    const cfg = UNIT_CLASSES[cls];
                    const activeUnits = roster.filter((u) => u.unitClass === cls && !u.parentBuildingId && !u.id.startsWith('tenant_')).slice(0, 1);
                    const isSummoned = activeUnits.length > 0;
                    const cost = getUnitSummonCost(cls, activeUnits.length);
                    const canAffordSummon = canAfford(resources, cost);

                    return (
                      <div
                        key={cls}
                        className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3 shadow-md hover:border-purple-500/40 transition-all"
                      >
                        {/* Champion Header & Stats */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                          <div className="flex items-center gap-3">
                            {BEAST_PORTRAITS[cls] ? (
                              <img
                                src={BEAST_PORTRAITS[cls]}
                                alt=""
                                className="h-12 w-12 rounded-xl border border-purple-500/40 object-cover [image-rendering:pixelated]"
                              />
                            ) : (
                              <span className="text-3xl p-2 rounded-xl bg-slate-800">{cfg.iconEmoji}</span>
                            )}
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-bold text-white">
                                  {isTL ? cfg.name : (cfg.nameEn || cfg.name)}
                                </h4>
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-purple-950 text-purple-300 border border-purple-500/40 font-bold">
                                  {isTL ? 'Natatanging Heneral' : 'Unique General'}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                {isTL ? cfg.subtitle : (cfg.subtitleEn || cfg.subtitle)}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 text-xs font-mono">
                            <span className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-rose-300 font-bold">
                              ⚔️ {cfg.baseAttack} ATK
                            </span>
                            <span className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-emerald-300 font-bold">
                              💚 {cfg.baseHp} HP
                            </span>
                          </div>
                        </div>

                        {/* Champion Skills Overview */}
                        {cfg.skills && (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 py-1">
                            <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 text-[11px]">
                              <div className="font-bold text-sky-300 flex items-center gap-1.5">
                                <span>{cfg.skills.skill1.icon}</span>
                                <span>{isTL ? cfg.skills.skill1.nameTl : cfg.skills.skill1.name}</span>
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">{isTL ? cfg.skills.skill1.descTl : cfg.skills.skill1.desc}</div>
                            </div>
                            <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 text-[11px]">
                              <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                                <span>{cfg.skills.skill2.icon}</span>
                                <span>{isTL ? cfg.skills.skill2.nameTl : cfg.skills.skill2.name}</span>
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">{isTL ? cfg.skills.skill2.descTl : cfg.skills.skill2.desc}</div>
                            </div>
                            <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 text-[11px]">
                              <div className="font-bold text-rose-300 flex items-center gap-1.5">
                                <span>{cfg.skills.ultimate.icon}</span>
                                <span>{isTL ? cfg.skills.ultimate.nameTl : cfg.skills.ultimate.name}</span>
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">{isTL ? cfg.skills.ultimate.descTl : cfg.skills.ultimate.desc}</div>
                            </div>
                          </div>
                        )}

                        {/* Summon or Active Duty Status */}
                        <div className="pt-2 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          {!isSummoned ? (
                            <>
                              <div className="text-xs text-slate-300 font-mono">
                                <span className="text-slate-400 mr-2">{isTL ? 'Gastos sa Pagtawag:' : 'Summon Cost:'}</span>
                                {Object.entries(cost).map(([k, amount]) => `${k === 'coins' ? '🪙' : RESOURCE_PRICES[k as keyof typeof RESOURCE_PRICES]?.icon ?? ''}${amount}`).join(' ')}
                              </div>
                              <button
                                disabled={!canAffordSummon}
                                onClick={() => {
                                  soundFx.playFanfare();
                                  summonUnit(cls);
                                }}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                  canAffordSummon
                                    ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-600/30 active:scale-95'
                                    : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-60'
                                }`}
                              >
                                {isTL ? 'Patawagin ang Heneral' : 'Summon General'}
                              </button>
                            </>
                          ) : (
                            <div className="w-full space-y-2">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                                  <span>✨</span>
                                  <span>{isTL ? 'Aktibong Heneral sa Kuta (1/1)' : 'Active General in Realm (1/1)'}</span>
                                </span>
                                <span className="text-[10px] text-cyan-400 font-mono font-bold">
                                  🛡️ {isTL ? 'Patrolya at Pagsusuri' : 'Active Patrol & Portal Scouting'}
                                </span>
                              </div>
                              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-3 text-xs">
                                <div className="flex items-center gap-2.5">
                                  <span className="text-xl">🧭</span>
                                  <div>
                                    <div className="font-bold text-slate-200">{activeUnits[0]?.name || cfg.name}</div>
                                    <div className="text-[11px] text-slate-400">
                                      {isTL
                                        ? 'Nagmamasid sa mga lagusan, nagpapatrolya sa kuta, at nakikipaglaban sa mga sumasalakay.'
                                        : 'Actively scouting rift portals, patrolling perimeter, and defending against invasions.'}
                                    </div>
                                  </div>
                                </div>
                                <span className="px-2.5 py-1 rounded-lg bg-indigo-950/80 border border-indigo-500/40 text-[10px] font-bold text-indigo-300 shrink-0">
                                  ⚔️ {isTL ? 'Tagapagbantay' : 'Guardian Scout'}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ═════════ TAB 3: GENERAL UPGRADES ═════════ */}
          {activeTab === 'GENERAL_UPGRADES' && (
            <div className="space-y-4">
              {/* Primary Category Nodes */}
              <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{primaryCategory.icon}</span>
                  <div>
                    <h3 className="text-xs md:text-sm font-bold text-white">
                      {isTL ? primaryCategory.titleTagalog : primaryCategory.titleEnglish}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      {isTL ? primaryCategory.descriptionTagalog : primaryCategory.descriptionEnglish}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-800">
                  {primaryCategory.nodes.map((node) => {
                    const currentLevel = (upgrades[node.key] as number) ?? 1;
                    const isMax = currentLevel >= node.maxLevel;
                    const cost = techUpgradeCost(node.key, currentLevel);
                    const canAffordThis = canAfford(resources, cost);

                    return (
                      <div
                        key={node.key}
                        className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between gap-3 hover:border-indigo-500/30 transition-all"
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-lg">{node.icon}</span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-indigo-950 text-indigo-300 font-bold border border-indigo-500/30">
                              Lv. {currentLevel} / {node.maxLevel}
                            </span>
                          </div>
                          <h4 className="text-xs font-bold text-white mt-1.5">
                            {isTL ? node.nameTagalog : node.nameEnglish}
                          </h4>
                          <p className="text-[10px] text-slate-400 mt-1 leading-snug">
                            {isTL ? node.descriptionTagalog : node.descriptionEnglish}
                          </p>
                        </div>

                        <div>
                          {!isMax && (
                            <div className="text-[10px] font-mono text-slate-400 mb-2">
                              {Object.entries(cost).map(([k, amt]) => `${k === 'coins' ? '🪙' : RESOURCE_PRICES[k as keyof typeof RESOURCE_PRICES]?.icon ?? ''}${amt}`).join(' ')}
                            </div>
                          )}
                          <button
                            disabled={isMax || !canAffordThis}
                            onClick={() => handleTechUpgrade(node)}
                            className={`w-full py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              isMax
                                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                : canAffordThis
                                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 active:scale-95'
                                  : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-60'
                            }`}
                          >
                            {isMax ? (isTL ? 'PINAKAMATAAS' : 'MAX') : `⬆️ ${isTL ? 'I-Upgrade' : 'Upgrade'}`}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tenant Upgrades Category Nodes */}
              <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{tenantCategory.icon}</span>
                  <div>
                    <h3 className="text-xs md:text-sm font-bold text-white">
                      {isTL ? tenantCategory.titleTagalog : tenantCategory.titleEnglish}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      {isTL ? tenantCategory.descriptionTagalog : tenantCategory.descriptionEnglish}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-800">
                  {tenantCategory.nodes.map((node) => {
                    const currentLevel = (upgrades[node.key] as number) ?? 1;
                    const isMax = currentLevel >= node.maxLevel;
                    const cost = techUpgradeCost(node.key, currentLevel);
                    const canAffordThis = canAfford(resources, cost);

                    return (
                      <div
                        key={node.key}
                        className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between gap-3 hover:border-cyan-500/30 transition-all"
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-lg">{node.icon}</span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-cyan-950 text-cyan-300 font-bold border border-cyan-500/30">
                              Lv. {currentLevel} / {node.maxLevel}
                            </span>
                          </div>
                          <h4 className="text-xs font-bold text-white mt-1.5">
                            {isTL ? node.nameTagalog : node.nameEnglish}
                          </h4>
                          <p className="text-[10px] text-slate-400 mt-1 leading-snug">
                            {isTL ? node.descriptionTagalog : node.descriptionEnglish}
                          </p>
                        </div>

                        <div>
                          {!isMax && (
                            <div className="text-[10px] font-mono text-slate-400 mb-2">
                              {Object.entries(cost).map(([k, amt]) => `${k === 'coins' ? '🪙' : RESOURCE_PRICES[k as keyof typeof RESOURCE_PRICES]?.icon ?? ''}${amt}`).join(' ')}
                            </div>
                          )}
                          <button
                            disabled={isMax || !canAffordThis}
                            onClick={() => handleTechUpgrade(node)}
                            className={`w-full py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              isMax
                                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                : canAffordThis
                                  ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-600/30 active:scale-95'
                                  : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-60'
                            }`}
                          >
                            {isMax ? (isTL ? 'PINAKAMATAAS' : 'MAX') : `⬆️ ${isTL ? 'I-Upgrade' : 'Upgrade'}`}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
