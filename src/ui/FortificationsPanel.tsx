import React from 'react';
import { Hammer, Shield, Wrench, Zap } from 'lucide-react';
import { useGameStore, RESOURCE_BUILDING_CONFIG } from '../state/useGameStore';
import { BUILDING_IDS } from '../state/buildingLayout';
import {
  CastleUpgradeKey,
  DEFENSE_CONFIG,
  DEFENSE_TEXT,
  TOWERS,
  TOWER_MAX_LEVEL,
  TowerStats,
  beaconLevelOf,
  beaconStats,
  buildingHpOf,
  buildingMaxHp,
  buildingRepairCost,
  canAfford,
  castleUpgradeCost,
  towerLevelOf,
  towerStats,
  towerUpgradeCost,
} from '../state/defenseStats';
import { teamBonuses } from '../state/skillTree';
import { soundFx } from '../game/audio/soundFx';
import type { ResourceBuildingId, Resources } from '../types/state';
import { resourceIcon } from './costDisplay';

type Text = { en: string; tl: string };

const CASTLE_UPGRADES: CastleUpgradeKey[] = ['wallLevel', 'shieldLevel', 'beaconLevel'];

/** Cost chips: red when the player is short of that resource. */
const CostChips: React.FC<{ cost: Partial<Resources>; resources: Resources }> = ({ cost, resources }) => (
  <span className="flex flex-wrap gap-1">
    {Object.entries(cost).map(([key, amount]) => {
      const short = (resources[key as keyof Resources] ?? 0) < (amount ?? 0);
      return (
        <span
          key={key}
          className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold ${short ? 'bg-rose-500/15 text-rose-300' : 'bg-slate-800 text-slate-200'}`}
        >
          {amount}
          {resourceIcon(key as keyof Resources)}
        </span>
      );
    })}
  </span>
);

const Bar: React.FC<{ pct: number; color: string }> = ({ pct, color }) => (
  <div className="h-2 w-full overflow-hidden rounded-full border border-slate-800 bg-slate-900">
    <div className={`h-full rounded-full ${color} transition-all duration-300`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
  </div>
);

/**
 * Fortifications tab: the citadel's own upgrades (it no longer attacks — the
 * Provoke Beacon draws invaders onto its walls) and every establishment's
 * defense tower, production level and repairs.
 */
export const FortificationsPanel: React.FC = () => {
  const {
    language,
    resources,
    defense,
    castleBuilt,
    resourceBuildings,
    skillRanks,
    regressionCount,
    upgradeDefense,
    repairCastle,
    upgradeTower,
    repairBuilding,
    upgradeResourceBuilding,
  } = useGameStore();
  const t = (text: Text) => (language === 'TL' ? text.tl : text.en);
  const damageMultiplier = teamBonuses({ skillRanks, regressionCount }).turret;

  const click = (action: () => boolean) => {
    soundFx.playClick();
    action();
  };

  const hpPct = defense.castleMaxHp > 0 ? (defense.castleHp / defense.castleMaxHp) * 100 : 0;
  const shieldPct = defense.shieldMaxHp > 0 ? (defense.shieldHp / defense.shieldMaxHp) * 100 : 0;
  const canRepairCastle = castleBuilt && resources.coins >= 40 && defense.castleHp < defense.castleMaxHp;
  const beacon = beaconStats(beaconLevelOf(defense));

  const castleLevel = (key: CastleUpgradeKey) => (key === 'beaconLevel' ? beaconLevelOf(defense) : defense[key]);

  const statLine = (id: ResourceBuildingId, s: TowerStats): string[] => {
    const tx = DEFENSE_TEXT;
    const lines = [`${t(tx.damage)} ${s.damage}`, `${t(tx.cooldown)} ${s.cooldown}s`];
    if (id === 'QUARRY') lines.push(`${t(tx.splash)} ${s.splashTiles} ${t(tx.tiles)}`);
    if (id === 'PORT') lines.push(`${s.shards} ${t(tx.shards)}`, `${t(tx.slow)} ${Math.round((1 - s.slowFactor) * 100)}%`);
    if (id === 'WOOD') lines.push(`${s.charges} ${t(tx.charges)}`, `${s.perSummon} ${t(tx.perSummon)}`, `${t(tx.hp)} ${s.saplingHp}`);
    if (id === 'MINE') lines.push(`${s.volley} ${t(tx.volley)}`);
    if (id === 'CAVE') lines.push(`${t(tx.burn)} ${s.burnDps}/s`);
    return lines;
  };

  return (
    <div className="space-y-5">
      {/* ── Citadel ── */}
      <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-purple-500/30 bg-purple-600/20 text-lg">🏰</div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white">{t(DEFENSE_TEXT.castleTitle)}</h3>
            <p className="text-[11px] leading-snug text-slate-400">{t(DEFENSE_TEXT.castleNote)}</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] font-bold">
            <span className="flex items-center gap-1 text-slate-300"><Shield className="h-3.5 w-3.5 text-emerald-400" />{t(DEFENSE_TEXT.castleHp)}</span>
            <span className="font-mono text-emerald-300">{defense.castleHp} / {defense.castleMaxHp}</span>
          </div>
          <Bar pct={hpPct} color="bg-gradient-to-r from-emerald-500 to-teal-400" />
          <div className="flex justify-between text-[11px] font-bold">
            <span className="flex items-center gap-1 text-slate-300"><Zap className="h-3.5 w-3.5 text-sky-400" />{t(DEFENSE_TEXT.shield)}</span>
            <span className="font-mono text-sky-300">{defense.shieldHp} / {defense.shieldMaxHp}</span>
          </div>
          <Bar pct={shieldPct} color="bg-gradient-to-r from-sky-500 to-cyan-400" />
        </div>

        <button
          type="button"
          disabled={!canRepairCastle}
          onClick={() => click(repairCastle)}
          className={`flex w-full items-center justify-center gap-2 rounded-xl py-1.5 text-xs font-bold transition ${
            canRepairCastle ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'cursor-not-allowed bg-slate-800 text-slate-500'
          }`}
        >
          <Wrench className="h-3.5 w-3.5" /> {t(DEFENSE_TEXT.repairCastle)} · 40🪙
        </button>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {CASTLE_UPGRADES.map((key) => {
            const def = DEFENSE_CONFIG.castle[key];
            const level = castleLevel(key);
            const cost = castleUpgradeCost(key, level);
            const affordable = castleBuilt && canAfford(resources, cost);
            return (
              <div key={key} className="flex flex-col justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">{def.icon} {t(def.name)}</span>
                    <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">{t(DEFENSE_TEXT.level)}{level}</span>
                  </div>
                  <p className="mt-1 text-[10px] leading-snug text-slate-400">{t(def.desc)}</p>
                  {key === 'beaconLevel' && (
                    <p className="mt-1 font-mono text-[10px] text-rose-300">
                      {t(DEFENSE_TEXT.radius)} {beacon.radiusTiles} {t(DEFENSE_TEXT.tiles)} · {t(DEFENSE_TEXT.pulse)} {beacon.interval}s · {t(DEFENSE_TEXT.provoke)} {beacon.duration}s
                    </p>
                  )}
                </div>
                {cost ? (
                  <div className="space-y-1.5">
                    <CostChips cost={cost} resources={resources} />
                    <button
                      type="button"
                      disabled={!affordable}
                      onClick={() => click(() => upgradeDefense(key))}
                      className={`w-full rounded-lg py-1.5 text-xs font-bold transition ${
                        affordable ? 'bg-purple-600 text-white hover:bg-purple-500' : 'cursor-not-allowed bg-slate-800 text-slate-500'
                      }`}
                    >
                      {t(DEFENSE_TEXT.upgrade)} → {t(DEFENSE_TEXT.level)}{level + 1}
                    </button>
                  </div>
                ) : (
                  <span className="rounded-lg bg-amber-500/15 py-1.5 text-center text-xs font-black text-amber-300">{t(DEFENSE_TEXT.max)}</span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Establishments ── */}
      <section className="space-y-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-300">
            <Hammer className="h-3.5 w-3.5" /> {t(DEFENSE_TEXT.establishments)}
          </h3>
          <p className="text-[11px] leading-snug text-slate-500">{t(DEFENSE_TEXT.establishmentsNote)}</p>
        </div>

        {BUILDING_IDS.map((id) => {
          const building = resourceBuildings[id];
          const cfg = RESOURCE_BUILDING_CONFIG[id];
          const tower = TOWERS[id];
          const built = castleBuilt && (building?.level ?? 0) >= 1;
          const towerLevel = towerLevelOf(building);
          const hp = buildingHpOf(building);
          const maxHp = buildingMaxHp(Math.max(1, towerLevel));
          const wrecked = built && hp <= 0;
          const stats = towerStats(id, Math.max(1, towerLevel), damageMultiplier);
          const next = towerLevel < TOWER_MAX_LEVEL ? towerStats(id, towerLevel + 1, damageMultiplier) : null;
          const upgradeCost = built ? towerUpgradeCost(id, towerLevel) : null;
          const productionCost = built ? cfg.costs[building.level] : undefined;
          const repairCost = buildingRepairCost();
          const needsRepair = built && hp < maxHp;

          return (
            <div key={id} className={`space-y-2.5 rounded-2xl border p-3.5 ${wrecked ? 'border-rose-500/40 bg-rose-950/20' : 'border-slate-800 bg-slate-900/50'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-lg">{cfg.icon}</div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white">{language === 'TL' ? cfg.label : cfg.labelEn}</div>
                    <div className="text-[11px] font-semibold text-amber-200">{tower.icon} {t(tower.name)}</div>
                    <p className="text-[10px] leading-snug text-slate-400">{t(tower.desc)}</p>
                  </div>
                </div>
                {built && (
                  <div className="shrink-0 text-right">
                    <div className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-sky-300">
                      {t(DEFENSE_TEXT.tower)} {t(DEFENSE_TEXT.level)}{towerLevel}
                    </div>
                    <div className="mt-1 rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                      {t(DEFENSE_TEXT.production)} {t(DEFENSE_TEXT.level)}{building.level}
                    </div>
                  </div>
                )}
              </div>

              {!built ? (
                <p className="rounded-lg bg-slate-950/60 px-2.5 py-2 text-[11px] text-slate-400">🏗️ {t(DEFENSE_TEXT.notBuilt)}</p>
              ) : (
                <>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-bold">
                      <span className={wrecked ? 'text-rose-300' : 'text-slate-300'}>{wrecked ? `💥 ${t(DEFENSE_TEXT.wrecked)}` : t(DEFENSE_TEXT.hp)}</span>
                      <span className="font-mono text-slate-300">{hp} / {maxHp}</span>
                    </div>
                    <Bar pct={(hp / maxHp) * 100} color={wrecked ? 'bg-rose-600' : hp / maxHp > 0.5 ? 'bg-emerald-500' : 'bg-amber-500'} />
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {statLine(id, stats).map((line, i) => {
                      const upcoming = next ? statLine(id, next)[i] : undefined;
                      return (
                        <span key={i} className="rounded-md bg-slate-950/70 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                          {line}
                          {upcoming && upcoming !== line && <span className="text-emerald-400"> → {upcoming.split(' ').find((w) => /\d/.test(w))}</span>}
                        </span>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {/* Defense tower upgrade */}
                    <div className="space-y-1 rounded-xl bg-slate-950/60 p-2">
                      {upgradeCost ? (
                        <>
                          <CostChips cost={upgradeCost} resources={resources} />
                          <button
                            type="button"
                            disabled={!canAfford(resources, upgradeCost)}
                            onClick={() => click(() => upgradeTower(id))}
                            className={`w-full rounded-lg py-1.5 text-[11px] font-bold transition ${
                              canAfford(resources, upgradeCost) ? 'bg-sky-600 text-white hover:bg-sky-500' : 'cursor-not-allowed bg-slate-800 text-slate-500'
                            }`}
                          >
                            {tower.icon} {t(DEFENSE_TEXT.tower)} → {t(DEFENSE_TEXT.level)}{towerLevel + 1}
                          </button>
                        </>
                      ) : (
                        <div className="py-2 text-center text-[11px] font-black text-amber-300">{t(DEFENSE_TEXT.tower)} {t(DEFENSE_TEXT.max)}</div>
                      )}
                    </div>

                    {/* Production level (unlocks the second output) */}
                    <div className="space-y-1 rounded-xl bg-slate-950/60 p-2">
                      {productionCost ? (
                        <>
                          <CostChips cost={productionCost} resources={resources} />
                          <button
                            type="button"
                            disabled={!canAfford(resources, productionCost)}
                            onClick={() => click(() => upgradeResourceBuilding(id))}
                            className={`w-full rounded-lg py-1.5 text-[11px] font-bold transition ${
                              canAfford(resources, productionCost) ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'cursor-not-allowed bg-slate-800 text-slate-500'
                            }`}
                            title={`${t(DEFENSE_CONFIG.production.desc)}: ${cfg.outputs.map((o) => resourceIcon(o as keyof Resources)).join(' ')}`}
                          >
                            📦 {t(DEFENSE_TEXT.production)} → {t(DEFENSE_TEXT.level)}{building.level + 1}
                          </button>
                        </>
                      ) : (
                        <div className="py-2 text-center text-[11px] font-black text-amber-300">
                          {t(DEFENSE_TEXT.outputs)} {cfg.outputs.map((o) => resourceIcon(o as keyof Resources)).join(' ')}
                        </div>
                      )}
                    </div>

                    {/* Repair */}
                    <div className="space-y-1 rounded-xl bg-slate-950/60 p-2">
                      <CostChips cost={repairCost} resources={resources} />
                      <button
                        type="button"
                        disabled={!needsRepair || !canAfford(resources, repairCost)}
                        onClick={() => click(() => repairBuilding(id))}
                        className={`w-full rounded-lg py-1.5 text-[11px] font-bold transition ${
                          needsRepair && canAfford(resources, repairCost) ? 'bg-amber-600 text-white hover:bg-amber-500' : 'cursor-not-allowed bg-slate-800 text-slate-500'
                        }`}
                      >
                        🛠️ {t(DEFENSE_TEXT.repair)} +{Math.round(DEFENSE_CONFIG.building.repairFraction * 100)}%
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
};
