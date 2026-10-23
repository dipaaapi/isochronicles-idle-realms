import React, { useEffect, useState } from 'react';
import { useGameStore } from '../state/useGameStore';
import { useDevMode } from '../state/devMode';
import { devBridge } from '../game/devBridge';
import { RESOURCE_KEYS } from '../state/resources';
import { getSeasonFromDay } from '../state/store/worldSlice';
import { getPhaseFromWave } from '../state/store/defenseSlice';
import { realmIntensity } from '../state/waveBalance';
import { INVADER_CONFIGS, UNIT_CLASSES, type InvaderType, type UnitClass } from '../types/game';
import type { PlatformPhase, Resources, WeatherType } from '../types/state';

/**
 * Developer panel (dev builds only, switched on from Settings → Credits).
 * Unlocks everything so the developer can jump to any point of the game and
 * see what needs work: resources, waves, realms, time, weather, unlocks,
 * god mode / one-hit kills, plus live stats.
 */
export const DevPanel: React.FC = () => {
  const { enabled, godMode, oneHitKill, toggle, setEnabled } = useDevMode();
  const [open, setOpen] = useState(true);
  const [waveInput, setWaveInput] = useState('');
  const [alive, setAlive] = useState(0);
  const game = useGameStore();

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setAlive(devBridge.invasion?.getInvaders().filter((i) => !i.isDead).length ?? 0), 500);
    return () => window.clearInterval(id);
  }, [enabled]);

  if (!enabled) return null;

  const set = useGameStore.setState;
  const addAll = (amount: number) => {
    const delta = Object.fromEntries(RESOURCE_KEYS.map((k) => [k, amount])) as Partial<Resources>;
    game.addResources(delta);
  };
  const jumpToWave = (wave: number) => {
    const w = Math.max(1, Math.min(100, Math.round(wave)));
    set((s) => ({
      invasion: { ...s.invasion, waveNumber: w, invasionsRepelled: Math.max(s.invasion.invasionsRepelled, w - 1) },
      platformPhase: s.realmChoice ?? getPhaseFromWave(w),
    }));
  };
  const setDay = (day: number) => {
    const d = ((Math.round(day) - 1 + 365) % 365) + 1;
    set({ day: d, season: getSeasonFromDay(d) });
  };
  const unlockBestiary = () =>
    set({
      discoveredBeasts: Object.keys(UNIT_CLASSES) as UnitClass[],
      discoveredInvaders: Object.keys(INVADER_CONFIGS) as InvaderType[],
    });
  const summonAllGenerals = () => {
    let n = 0;
    for (const cls of Object.keys(UNIT_CLASSES) as UnitClass[]) {
      if (UNIT_CLASSES[cls].requiredBuilding && game.summonUnit(cls, undefined, true)) n++;
    }
    return n;
  };
  const maxEstablishments = () =>
    set((s) => ({
      resourceBuildings: Object.fromEntries(
        Object.entries(s.resourceBuildings).map(([id, b]) => [id, { ...b, level: Math.max(b.level, 5), towerLevel: 5, hp: undefined }])
      ) as typeof s.resourceBuildings,
    }));
  const healCastle = () => set((s) => ({ defense: { ...s.defense, castleHp: s.defense.castleMaxHp, shieldHp: s.defense.shieldMaxHp } }));

  const inv = game.invasion;
  const intensity = realmIntensity(inv.waveNumber, game.platformPhase);
  const btn = 'rounded-md bg-slate-800 hover:bg-slate-700 px-2 py-1 text-[10px] font-bold text-slate-200 cursor-pointer';
  const on = (v: boolean) => (v ? 'bg-lime-500 text-black hover:bg-lime-400' : '');
  const section = 'text-[9px] font-black uppercase tracking-widest text-lime-400 mt-2 mb-1';

  return (
    <div className="pointer-events-auto absolute right-2 top-2 z-40 w-64 max-h-[calc(100%-1rem)] overflow-y-auto rounded-xl border border-lime-500/50 bg-slate-950/90 p-2 text-slate-200 shadow-2xl backdrop-blur custom-scrollbar">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setOpen(!open)} className="text-xs font-black text-lime-300 cursor-pointer">
          🛠️ DEV {open ? '▾' : '▸'}
        </button>
        <button type="button" onClick={() => setEnabled(false)} className={btn}>Exit dev mode</button>
      </div>

      {open && (
        <>
          <div className={section}>Live stats</div>
          <div className="grid grid-cols-2 gap-x-2 text-[10px] font-mono text-slate-300">
            <span>Wave {inv.waveNumber}{inv.isActive ? ' ⚔️' : ''}</span>
            <span>Tactic {inv.tactic ?? '-'}</span>
            <span>Alive {alive} / left {inv.enemiesRemaining}</span>
            <span>Total {inv.totalEnemiesInWave}</span>
            <span>Realm P{game.platformPhase}{game.realmChoice ? ' (pick)' : ''}</span>
            <span>HP ×{intensity.hp.toFixed(2)}</span>
            <span>Castle {Math.round(game.defense.castleHp)}</span>
            <span>Shield {Math.round(game.defense.shieldHp ?? 0)}</span>
            <span>Roster {game.roster.length}</span>
            <span>FPS {Math.round(game.measuredFps)}</span>
            <span>Day {game.day} Y{game.year}</span>
            <span>{game.season} · {game.weather}</span>
          </div>

          <div className={section}>Cheats</div>
          <div className="flex flex-wrap gap-1">
            <button type="button" className={`${btn} ${on(godMode)}`} onClick={() => toggle('godMode')}>God mode</button>
            <button type="button" className={`${btn} ${on(oneHitKill)}`} onClick={() => toggle('oneHitKill')}>One-hit kill</button>
            <button type="button" className={btn} onClick={healCastle}>Heal castle</button>
          </div>

          <div className={section}>Resources</div>
          <div className="flex flex-wrap gap-1">
            <button type="button" className={btn} onClick={() => addAll(1000)}>+1k all</button>
            <button type="button" className={btn} onClick={() => addAll(100000)}>+100k all</button>
            <button type="button" className={btn} onClick={() => addAll(10000000)}>+10M all</button>
          </div>

          <div className={section}>Waves</div>
          <div className="flex flex-wrap gap-1">
            <button type="button" className={btn} onClick={() => game.startInvasion()} disabled={inv.isActive}>Start now</button>
            <button type="button" className={btn} onClick={() => devBridge.invasion?.devKillAll()}>Kill all invaders</button>
            <button type="button" className={btn} onClick={() => devBridge.kirov?.launch()}>Send Kirov airship</button>
            <button type="button" className={btn} onClick={() => useGameStore.setState({ lairOpen: true })}>Open volcano cave</button>
            <button type="button" className={btn} onClick={() => jumpToWave(inv.waveNumber + 1)} disabled={inv.isActive}>Wave +1</button>
            <button type="button" className={btn} onClick={() => jumpToWave(inv.waveNumber + 5)} disabled={inv.isActive}>Wave +5</button>
          </div>
          <div className="mt-1 flex gap-1">
            <input
              value={waveInput}
              onChange={(e) => setWaveInput(e.target.value.replace(/\D/g, ''))}
              placeholder="1-100"
              className="w-16 rounded-md bg-slate-900 border border-slate-700 px-1 text-[10px]"
            />
            <button type="button" className={btn} disabled={inv.isActive || !waveInput} onClick={() => jumpToWave(Number(waveInput))}>Go to wave</button>
          </div>

          <div className={section}>Realm</div>
          <div className="flex flex-wrap gap-1">
            <button type="button" className={`${btn} ${on(game.realmChoice == null)}`} onClick={() => game.setRealmChoice(null)}>Follow</button>
            {([1, 2, 3, 4] as PlatformPhase[]).map((p) => (
              <button type="button" key={p} className={`${btn} ${on(game.realmChoice === p)}`} onClick={() => game.setRealmChoice(p)}>P{p}</button>
            ))}
          </div>

          <div className={section}>Time & weather</div>
          <div className="flex flex-wrap gap-1">
            <button type="button" className={btn} onClick={() => setDay(game.day + 1)}>Day +1</button>
            <button type="button" className={btn} onClick={() => setDay(game.day + 30)}>Day +30</button>
            <button type="button" className={btn} onClick={() => setDay(365)}>Day 365</button>
            {(['CLEAR', 'RAIN', 'SNOW', 'HEATWAVE'] as WeatherType[]).map((w) => (
              <button type="button" key={w} className={`${btn} ${on(game.weather === w)}`} onClick={() => game.setWeather(w)}>{w}</button>
            ))}
            <button type="button" className={`${btn} ${on(game.gameSpeed === 3)}`} onClick={() => game.setGameSpeed(3)}>Speed 3×</button>
          </div>

          <div className={section}>Unlock</div>
          <div className="flex flex-wrap gap-1">
            <button type="button" className={btn} onClick={unlockBestiary}>Whole bestiary</button>
            <button type="button" className={btn} onClick={() => set((s) => ({ invasion: { ...s.invasion, invasionsRepelled: Math.max(100, s.invasion.invasionsRepelled) } }))}>All skill points</button>
            <button type="button" className={btn} onClick={summonAllGenerals}>All Generals</button>
            <button type="button" className={btn} onClick={maxEstablishments}>Max establishments</button>
            <button type="button" className={btn} onClick={() => game.resolveCastleBreach()}>Game over now</button>
          </div>
        </>
      )}
    </div>
  );
};
