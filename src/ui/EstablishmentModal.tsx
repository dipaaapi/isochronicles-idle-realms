import React, { useState } from 'react';
import { useGameStore } from '../state/useGameStore';
import { RESOURCE_BUILDING_CONFIG } from '../state/useGameStore';
import { BUILDING_IDS } from '../state/buildingLayout';
import { buildingHpOf, buildingMaxHp, towerLevelOf } from '../state/defenseStats';
import { ESTABLISHMENT_SKILLS } from '../data/establishmentSkills';
import type { ResourceBuildingId } from '../types/state';
import type { StructureId } from '../game/StructureManager';

// ── Types ──────────────────────────────────────────────────────────────────────

type EstabTab = 'ANALYZE' | 'UPGRADES' | 'AUTO_BUY';

interface EstablishmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedId: StructureId | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ESTABLISHMENTS_LIST: { id: StructureId; label: string; labelEn: string; icon: string }[] = [
  { id: 'CASTLE', label: 'Kastilyo', labelEn: 'Castle', icon: '🏰' },
  ...BUILDING_IDS.map((id) => ({
    id: id as StructureId,
    label: RESOURCE_BUILDING_CONFIG[id].label,
    labelEn: RESOURCE_BUILDING_CONFIG[id].labelEn,
    icon: RESOURCE_BUILDING_CONFIG[id].icon,
  })),
];

function fmtNum(n: number): string {
  return n.toLocaleString();
}

function CooldownBar({ label, cooldown, maxCooldown, color, icon }: {
  label: string;
  cooldown: number;
  maxCooldown: number;
  color: string;
  icon: string;
}) {
  const pct = maxCooldown > 0 ? Math.max(0, Math.min(1, 1 - cooldown / maxCooldown)) : 1;
  const ready = cooldown <= 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 justify-between">
        <span className="text-xs font-semibold text-slate-200">{icon} {label}</span>
        <span className={`text-xs font-mono ${ready ? 'text-green-400' : 'text-orange-300'}`}>
          {ready ? 'READY' : `${Math.ceil(cooldown)}s`}
        </span>
      </div>
      <div className="w-full bg-slate-700 rounded-full h-1.5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct * 100}%`, background: ready ? color : '#6b7280' }}
        />
      </div>
    </div>
  );
}

// ── Main Modal Component ───────────────────────────────────────────────────────

export const EstablishmentModal: React.FC<EstablishmentModalProps> = ({ isOpen, onClose, selectedId }) => {
  const [activeTab, setActiveTab] = useState<EstabTab>('ANALYZE');
  const [activeEstab, setActiveEstab] = useState<StructureId>(selectedId ?? 'CASTLE');

  const {
    language,
    roster,
    resourceBuildings,
    defense,
    castleBuilt,
    resources,
    entAssignments,
    establishmentSkillCooldowns,
    autoBuyBuildingMaterials,
    assignEntToEstablishment,
    clearEntAssignment,
    triggerEstablishmentSkill,
    upgradeResourceBuilding,
    upgradeTower,
    repairBuilding,
    toggleBuildingAutoBuy,
    autoBuyMaterialsForUpgrade,
  } = useGameStore();

  const tl = language === 'TL';

  // Sync activeEstab when selectedId changes externally
  React.useEffect(() => {
    if (selectedId) setActiveEstab(selectedId);
  }, [selectedId]);

  if (!isOpen) return null;

  const isCastle = activeEstab === 'CASTLE';
  const buildingState = isCastle ? null : resourceBuildings[activeEstab as ResourceBuildingId];
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

  // Ent assignment
  const assignedEntId = isCastle ? null : entAssignments[bid];
  const assignedEnt = assignedEntId ? roster.find((u) => u.id === assignedEntId) : null;
  const unassignedEnts = roster.filter(
    (u) => u.unitClass === 'TREANT' && !Object.values(entAssignments).includes(u.id)
  );

  // Skills
  const skillPair = isCastle ? null : ESTABLISHMENT_SKILLS[bid] ?? null;
  const cooldowns = isCastle ? null : (establishmentSkillCooldowns[bid] ?? { skill1: 0, skill2: 0 });

  // Upgrade cost
  const nextLevel = buildingState ? buildingState.level + 1 : 1;
  const upgradeCost = buildingConfig?.costs[nextLevel - 1] ?? null;
  const canUpgrade = castleBuilt && !!buildingState && buildingState.level >= 1 &&
    !!upgradeCost && Object.entries(upgradeCost).every(([k, v]) => ((resources[k as keyof typeof resources] ?? 0) as number) >= (v as number));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-lg max-h-[90vh] flex flex-col bg-slate-900 border border-slate-700/80 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-800/90 border-b border-slate-700/60 shrink-0">
          <h2 className="text-sm font-bold text-slate-100 tracking-wide">
            {tl ? 'Mga Pasilidad' : 'Establishments'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 text-lg leading-none">✕</button>
        </div>

        {/* ── Establishment Switcher ── */}
        <div className="flex overflow-x-auto gap-1.5 px-3 py-2 bg-slate-800/70 border-b border-slate-700/50 shrink-0 scrollbar-hide">
          {ESTABLISHMENTS_LIST.map(({ id, label, labelEn, icon }) => {
            const active = id === activeEstab;
            const isBuilt = id === 'CASTLE' ? castleBuilt : (resourceBuildings[id as ResourceBuildingId]?.level ?? 0) >= 1;
            return (
              <button
                key={id}
                onClick={() => setActiveEstab(id)}
                className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg text-xs shrink-0 border transition-all ${
                  active
                    ? 'bg-indigo-600/80 border-indigo-500 text-white'
                    : 'bg-slate-700/50 border-slate-600/40 text-slate-300 hover:bg-slate-700'
                } ${!isBuilt ? 'opacity-40' : ''}`}
              >
                <span className="text-base">{icon}</span>
                <span className="font-medium leading-tight">{tl ? label : labelEn}</span>
              </button>
            );
          })}
        </div>

        {/* ── HP & Defence bars ── */}
        <div className="px-4 py-2.5 bg-slate-800/50 border-b border-slate-700/40 shrink-0 space-y-2">
          {/* HP bar */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 w-5">HP</span>
            <div className="flex-1 bg-slate-700 rounded-full h-2 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${hpPct * 100}%`, background: hpColor }} />
            </div>
            <span className="text-[10px] font-mono text-slate-300 w-20 text-right">{fmtNum(Math.round(hp))} / {fmtNum(Math.round(maxHp))}</span>
            {/* +Level indicator */}
            {!isCastle && buildingState?.level >= 1 && (
              <span className="text-[10px] font-bold text-amber-400 ml-1 shrink-0">+{tLevel}</span>
            )}
            {/* Skill dots */}
            {!isCastle && cooldowns && (
              <div className="flex gap-1 ml-1 shrink-0">
                <div className={`w-2.5 h-2.5 rounded-full border border-slate-600 ${cooldowns.skill1 <= 0 ? 'bg-cyan-400' : 'bg-red-500'}`} title={cooldowns.skill1 <= 0 ? 'Skill 1 Ready' : `${Math.ceil(cooldowns.skill1)}s`} />
                <div className={`w-2.5 h-2.5 rounded-full border border-slate-600 ${cooldowns.skill2 <= 0 ? 'bg-purple-400' : 'bg-red-500'}`} title={cooldowns.skill2 <= 0 ? 'Skill 2 Ready' : `${Math.ceil(cooldowns.skill2)}s`} />
              </div>
            )}
          </div>
          {/* Defence / Shield bar */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 w-5">{isCastle ? '🛡️' : '🗼'}</span>
            <div className="flex-1 bg-slate-700 rounded-full h-2 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${defPct * 100}%`, background: defColor }} />
            </div>
            <span className="text-[10px] font-mono text-slate-300 w-20 text-right">
              {isCastle ? `${fmtNum(defense.shieldHp)} / ${fmtNum(defense.shieldMaxHp)}` : `Lv ${tLevel} / 5`}
            </span>
          </div>
        </div>

        {/* ── Sub-tabs ── */}
        <div className="flex border-b border-slate-700/60 shrink-0 bg-slate-800/60">
          {(['ANALYZE', 'UPGRADES', 'AUTO_BUY'] as EstabTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                activeTab === t
                  ? 'text-indigo-300 border-b-2 border-indigo-400 bg-slate-800'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t === 'ANALYZE' ? (tl ? '📊 Impormasyon' : '📊 Info & Analysis') :
               t === 'UPGRADES' ? (tl ? '⬆️ Upgrade/Repair' : '⬆️ Upgrades') :
               (tl ? '🛒 Auto-Bilhin' : '🛒 Auto-Buy')}
            </button>
          ))}
        </div>

        {/* ── Tab Content ── */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">

          {/* ─── ANALYZE tab ─────────────────────────────────────────────── */}
          {activeTab === 'ANALYZE' && (
            <>
              {/* Full info */}
              <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-3 space-y-2">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  {tl ? 'Buong Impormasyon' : 'Full Information'}
                </h3>
                {isCastle ? (
                  <div className="space-y-1 text-xs text-slate-300">
                    <div className="flex justify-between"><span className="text-slate-400">{tl ? 'Kastilyo HP' : 'Castle HP'}</span><span className="font-mono">{fmtNum(defense.castleHp)} / {fmtNum(defense.castleMaxHp)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">{tl ? 'Kalasag' : 'Shield'}</span><span className="font-mono">{fmtNum(defense.shieldHp)} / {fmtNum(defense.shieldMaxHp)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">{tl ? 'Antas ng Pader' : 'Wall Level'}</span><span className="font-mono">{defense.wallLevel}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">{tl ? 'Beacon' : 'Provoke Beacon'}</span><span className="font-mono">{defense.beaconLevel}</span></div>
                  </div>
                ) : (
                  <div className="space-y-1 text-xs text-slate-300">
                    <div className="flex justify-between"><span className="text-slate-400">{tl ? 'Antas ng Produksyon' : 'Production Level'}</span><span className="font-mono">{buildingState?.level ?? 0}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">{tl ? 'Antas ng Tore' : 'Tower Level'}</span><span className="font-mono">{tLevel} / 5</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">{tl ? 'HP' : 'HP'}</span><span className="font-mono">{fmtNum(Math.round(hp))} / {fmtNum(Math.round(maxHp))}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">{tl ? 'Mga Output' : 'Outputs'}</span><span className="font-mono">{buildingState?.unlockedOutputs?.join(', ') || '—'}</span></div>
                  </div>
                )}
              </div>

              {/* Ent Caretaker section */}
              {!isCastle && (
                <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-3 space-y-2">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    🌲 {tl ? 'Tagapag-alaga na Ent' : 'Ent Caretaker'}
                  </h3>
                  {assignedEnt ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-emerald-300">{assignedEnt.name}</p>
                          <p className="text-[10px] text-slate-400">
                            {tl ? 'Ent Tagapag-alaga (Lv.' : 'Caretaker Ent (Lv.'}{assignedEnt.treantEvolutionLevel ?? 1})
                          </p>
                        </div>
                        <button
                          onClick={() => clearEntAssignment(assignedEnt.id)}
                          className="text-[10px] bg-red-900/50 hover:bg-red-800/60 text-red-300 border border-red-700/50 px-2 py-0.5 rounded"
                        >
                          {tl ? 'Alisin' : 'Unassign'}
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-400">
                        {tl
                          ? 'Ang Ent na ito ay awtomatikong nagkukumpuni, nag-a-upgrade, at nagre-relocate ng pasilidad na ito.'
                          : 'This Ent automatically repairs, upgrades, and can relocate this establishment.'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-amber-400">
                        ⚠️ {tl ? 'Walang Ent caretaker. Hindi maaaring i-repair, i-upgrade, o ilipat.' : 'No Ent caretaker. Cannot be repaired, upgraded, or relocated.'}
                      </p>
                      {unassignedEnts.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {unassignedEnts.map((ent) => (
                            <button
                              key={ent.id}
                              onClick={() => assignEntToEstablishment(ent.id, bid)}
                              className="text-xs bg-emerald-900/60 hover:bg-emerald-800/60 text-emerald-300 border border-emerald-700/50 px-2 py-0.5 rounded"
                            >
                              🌲 {ent.name}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-500">
                          {tl ? 'Walang libreng Ent. Summon ng Ent mula sa Citadel.' : 'No free Ents available. Summon one from the Citadel.'}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Establishment Skills */}
              {!isCastle && skillPair && cooldowns && (
                <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-3 space-y-3">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    ⚡ {tl ? 'Mga Kasanayan ng Pasilidad' : 'Establishment Skills'}
                  </h3>
                  {/* Skill 1 */}
                  <div className="space-y-1.5 border border-cyan-800/40 rounded-lg p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-cyan-300">
                        {skillPair.skill1.icon} {tl ? skillPair.skill1.nameTl : skillPair.skill1.nameEn}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${cooldowns.skill1 <= 0 ? 'bg-cyan-400' : 'bg-red-500'}`} />
                        <button
                          disabled={cooldowns.skill1 > 0 || !buildingState || buildingState.level < 1}
                          onClick={() => triggerEstablishmentSkill(bid, 0)}
                          className="text-[10px] bg-cyan-900/60 hover:bg-cyan-800/60 disabled:opacity-40 text-cyan-200 border border-cyan-700/50 px-2 py-0.5 rounded"
                        >
                          {cooldowns.skill1 <= 0 ? (tl ? 'Gamitin' : 'Use') : `${Math.ceil(cooldowns.skill1)}s`}
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400">{tl ? skillPair.skill1.descriptionTl : skillPair.skill1.descriptionEn}</p>
                    <CooldownBar
                      label=""
                      cooldown={cooldowns.skill1}
                      maxCooldown={skillPair.skill1.cooldownSeconds}
                      color="#22d3ee"
                      icon=""
                    />
                    <p className="text-[10px] text-slate-500">{tl ? 'Cooldown:' : 'Cooldown:'} {skillPair.skill1.cooldownSeconds}s</p>
                  </div>
                  {/* Skill 2 */}
                  <div className="space-y-1.5 border border-purple-800/40 rounded-lg p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-purple-300">
                        {skillPair.skill2.icon} {tl ? skillPair.skill2.nameTl : skillPair.skill2.nameEn}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${cooldowns.skill2 <= 0 ? 'bg-purple-400' : 'bg-red-500'}`} />
                        <button
                          disabled={cooldowns.skill2 > 0 || !buildingState || buildingState.level < 1}
                          onClick={() => triggerEstablishmentSkill(bid, 1)}
                          className="text-[10px] bg-purple-900/60 hover:bg-purple-800/60 disabled:opacity-40 text-purple-200 border border-purple-700/50 px-2 py-0.5 rounded"
                        >
                          {cooldowns.skill2 <= 0 ? (tl ? 'Gamitin' : 'Use') : `${Math.ceil(cooldowns.skill2)}s`}
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400">{tl ? skillPair.skill2.descriptionTl : skillPair.skill2.descriptionEn}</p>
                    <CooldownBar
                      label=""
                      cooldown={cooldowns.skill2}
                      maxCooldown={skillPair.skill2.cooldownSeconds}
                      color="#a855f7"
                      icon=""
                    />
                    <p className="text-[10px] text-slate-500">{tl ? 'Cooldown:' : 'Cooldown:'} {skillPair.skill2.cooldownSeconds}s</p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ─── UPGRADES tab ─────────────────────────────────────────────── */}
          {activeTab === 'UPGRADES' && (
            <>
              {isCastle ? (
                <div className="text-xs text-slate-400 text-center py-4">
                  {tl ? 'Gamitin ang Citadel Command para i-upgrade ang Kastilyo.' : 'Use the Citadel Command modal to upgrade the Castle.'}
                </div>
              ) : (
                <>
                  {/* Production Upgrade */}
                  {buildingConfig && upgradeCost && (
                    <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-3 space-y-2">
                      <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                        ⬆️ {tl ? 'Production Upgrade' : 'Production Upgrade'} → Lv. {nextLevel}
                      </h3>
                      <div className="space-y-1">
                        {Object.entries(upgradeCost).map(([key, val]) => {
                          const have = (resources[key as keyof typeof resources] ?? 0) as number;
                          const enough = have >= (val as number);
                          return (
                            <div key={key} className={`flex justify-between text-xs ${enough ? 'text-slate-300' : 'text-red-400'}`}>
                              <span className="capitalize">{key}</span>
                              <span className="font-mono">{fmtNum(have)} / {fmtNum(val as number)}</span>
                            </div>
                          );
                        })}
                      </div>
                      <button
                        disabled={!canUpgrade || !assignedEntId}
                        onClick={() => upgradeResourceBuilding(bid)}
                        className="w-full mt-1 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition-colors"
                      >
                        {!assignedEntId
                          ? (tl ? '🌲 Kailangan ng Ent Caretaker' : '🌲 Requires Ent Caretaker')
                          : canUpgrade
                            ? (tl ? '⬆️ I-Upgrade' : '⬆️ Upgrade Building')
                            : (tl ? 'Kulang ang Materyales' : 'Insufficient Materials')}
                      </button>
                    </div>
                  )}

                  {/* Tower Upgrade */}
                  <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-3 space-y-2">
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      🗼 {tl ? 'Tower Upgrade' : 'Defence Tower'} (Lv. {tLevel} / 5)
                    </h3>
                    <button
                      disabled={!buildingState || buildingState.level < 1 || tLevel >= 5}
                      onClick={() => upgradeTower(bid)}
                      className="w-full py-1.5 rounded-lg text-xs font-bold bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 text-white transition-colors"
                    >
                      {tLevel >= 5 ? (tl ? 'MAX LEVEL' : 'Max Tower Level') : (tl ? '🗼 I-Upgrade ang Tore' : '🗼 Upgrade Tower')}
                    </button>
                  </div>

                  {/* Repair */}
                  <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-3 space-y-2">
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      🔨 {tl ? 'Kumpunihin' : 'Repair'}
                    </h3>
                    <p className="text-[10px] text-slate-400">
                      {tl ? 'I-repair ang pinsala sa pasilidad. Kinukonsume ng Mana (Arcane Essence).' : 'Repair structural damage. Consumes Mana (Arcane Essence) only — no gold cost.'}
                    </p>
                    <button
                      disabled={!buildingState || buildingState.level < 1 || hp >= maxHp}
                      onClick={() => repairBuilding(bid)}
                      className="w-full py-1.5 rounded-lg text-xs font-bold bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white transition-colors"
                    >
                      {hp >= maxHp ? (tl ? 'Buo na ang HP' : 'HP Full') : (tl ? '🔨 I-Repair' : '🔨 Repair Building')}
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* ─── AUTO_BUY tab ─────────────────────────────────────────────── */}
          {activeTab === 'AUTO_BUY' && (
            <>
              {isCastle ? (
                <div className="text-xs text-slate-400 text-center py-4">
                  {tl ? 'Ang Kastilyo ay walang auto-buy materials.' : 'The Castle has no auto-buy materials.'}
                </div>
              ) : (
                <>
                  <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                        🛒 {tl ? 'Auto-Bumili ng Materyales' : 'Auto-Buy Materials'}
                      </h3>
                      <button
                        onClick={() => toggleBuildingAutoBuy(bid)}
                        className={`text-xs font-bold px-2.5 py-0.5 rounded-full border transition-colors ${
                          autoBuyBuildingMaterials[bid]
                            ? 'bg-emerald-600/80 border-emerald-500 text-white'
                            : 'bg-slate-700/60 border-slate-600 text-slate-400'
                        }`}
                      >
                        {autoBuyBuildingMaterials[bid] ? (tl ? 'ON' : 'ON') : (tl ? 'OFF' : 'OFF')}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      {tl
                        ? 'Kapag naka-ON, awtomatikong binibili ang kulang na materyales para sa susunod na upgrade gamit ang mga barya.'
                        : 'When ON, automatically purchases missing upgrade materials using coins when resources are insufficient.'}
                    </p>

                    {/* Material requirements for next upgrade */}
                    {upgradeCost && (
                      <>
                        <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                          {tl ? 'Para sa Upgrade Lv.' : 'For Upgrade Lv.'} {nextLevel}
                        </div>
                        <div className="space-y-1.5">
                          {Object.entries(upgradeCost).map(([key, val]) => {
                            const have = (resources[key as keyof typeof resources] ?? 0) as number;
                            const need = val as number;
                            const enough = have >= need;
                            const shortage = Math.max(0, need - have);
                            return (
                              <div key={key} className="flex items-center gap-2">
                                <div className="flex-1">
                                  <div className="flex justify-between text-[10px] mb-0.5">
                                    <span className={`capitalize font-medium ${enough ? 'text-slate-300' : 'text-orange-300'}`}>{key}</span>
                                    <span className={`font-mono ${enough ? 'text-emerald-400' : 'text-red-400'}`}>
                                      {fmtNum(have)} / {fmtNum(need)}
                                    </span>
                                  </div>
                                  <div className="w-full bg-slate-700 rounded-full h-1">
                                    <div
                                      className="h-full rounded-full"
                                      style={{ width: `${Math.min(1, have / Math.max(1, need)) * 100}%`, background: enough ? '#22c55e' : '#f59e0b' }}
                                    />
                                  </div>
                                </div>
                                {!enough && shortage > 0 && (
                                  <span className="text-[9px] text-red-400 shrink-0">-{fmtNum(shortage)}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <button
                          onClick={() => autoBuyMaterialsForUpgrade(bid)}
                          className="w-full py-1.5 rounded-lg text-xs font-bold bg-amber-600/80 hover:bg-amber-600 text-white transition-colors"
                        >
                          🛒 {tl ? 'Bilhin Ngayon ang Kulang' : 'Buy Missing Materials Now'}
                        </button>
                      </>
                    )}
                    {!upgradeCost && (
                      <p className="text-xs text-slate-500 text-center">
                        {tl ? 'Max level na ang pasilidad.' : 'Building is at max production level.'}
                      </p>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
