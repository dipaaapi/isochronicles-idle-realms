import React, { useEffect, useRef, useState } from 'react';
import { Dices } from 'lucide-react';
import { soundFx } from '../game/audio/soundFx';
import { useGameStore } from '../state/useGameStore';
import { useTranslation } from '../i18n/translations';
import SETUP from '../data/realmSetup.json';
import {
  BUILDING_IDS, BUILDING_SITES, CASTLE_FOOTPRINT, GRID_SIZE, SPIRE_FOOTPRINT,
  coastForSeed, isPortalTile, isWaterTile, newLayoutSeed, rectContainsTile,
} from '../state/buildingLayout';

const CELL = 6;

/**
 * New-realm setup under the difficulty: game mode and map size cards, with a
 * mini-map of the island this realm rolled (its own random curved coastline).
 * Modes / sizes marked unavailable in realmSetup.json show as coming soon.
 */
export const RealmMapPicker: React.FC<{ isTL: boolean }> = ({ isTL }) => {
  const { t: tr } = useTranslation();
  const seed = useGameStore((s) => s.layoutSeed);
  const coast = useGameStore((s) => s.coastStyle);
  const [mode, setMode] = useState('CLASSIC');
  const [size, setSize] = useState('MEDIUM');
  const canvas = useRef<HTMLCanvasElement>(null);
  const locked = useGameStore((s) => s.castleBuilt);
  const choose = useGameStore((s) => s.chooseRealmMap);
  const [seedText, setSeedText] = useState(String(seed));
  useEffect(() => setSeedText(String(seed)), [seed]);
  /** A typed seed always gives the same island: its coastline style comes from the seed too. */
  const applySeed = () => {
    const n = Math.min(0x7fffffff, Number(seedText));
    if (locked || !(n > 0) || n === seed) return;
    soundFx.playClick();
    choose(n, coastForSeed(n));
  };
  const L = (v: { en: string; tl: string }) => (isTL ? v.tl : v.en);

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!canvas.current || !ctx) return;
    canvas.current.width = GRID_SIZE * CELL;
    canvas.current.height = GRID_SIZE * CELL;
    const sites = BUILDING_IDS.map((id) => BUILDING_SITES[id].footprint);
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        let color = (x + y) % 2 ? '#3f7d33' : '#468a39';
        if (isPortalTile(x, y)) color = '#a21caf';
        else if (isWaterTile(x, y)) color = (x + y) % 2 ? '#1d5f8f' : '#1f6aa0';
        else if (rectContainsTile(CASTLE_FOOTPRINT, x, y)) color = '#dc2626';
        else if (rectContainsTile(SPIRE_FOOTPRINT, x, y)) color = '#8b5cf6';
        else if (sites.some((r) => rectContainsTile(r, x, y))) color = '#f59e0b';
        ctx.fillStyle = color;
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }
  }, [seed, coast]);

  const card = (selected: boolean, available: boolean) =>
    `relative text-left p-2.5 border-2 transition-all ${available ? 'cursor-pointer' : 'opacity-55 cursor-not-allowed'} ${
      selected ? 'border-amber-400 bg-red-950/80' : 'border-red-950 bg-stone-950/80' + (available ? ' hover:border-red-800' : '')
    }`;
  const soon = <span className="absolute top-1 right-1 px-1.5 py-0.5 text-[8px] font-bold uppercase bg-stone-800 text-amber-300/80">{tr('introSoon')}</span>;

  return (
    <div className="mb-5 animate-fade-in space-y-4">
      <fieldset>
        <legend className="mb-2 text-xs font-bold text-amber-200/90 uppercase tracking-wider">{tr('introMode')}</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SETUP.modes.map((m) => (
            <button
              type="button"
              key={m.id}
              disabled={!m.available}
              onClick={() => { soundFx.playClick(); setMode(m.id); }}
              className={card(mode === m.id, m.available)}
            >
              {!m.available && soon}
              <div className={`text-sm font-bold ${mode === m.id ? 'text-amber-200' : 'text-stone-300'}`}>{m.icon} {L(m.name)}</div>
              <p className="mt-1 text-[10px] leading-snug text-stone-400">{L(m.desc)}</p>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-xs font-bold text-amber-200/90 uppercase tracking-wider">{tr('introSize')}</legend>
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <div className="grid grid-cols-3 gap-2 flex-1 w-full">
            {SETUP.sizes.map((s) => (
              <button
                type="button"
                key={s.id}
                disabled={!s.available}
                onClick={() => { soundFx.playClick(); setSize(s.id); }}
                className={card(size === s.id, s.available)}
              >
                {!s.available && soon}
                <div className={`text-xs font-bold ${size === s.id ? 'text-amber-200' : 'text-stone-300'}`}>{L(s.name)}</div>
                <p className="mt-0.5 text-[10px] font-mono text-stone-400">{tr('introTiles').split('{n}').join(String(s.tiles))}</p>
              </button>
            ))}
          </div>
          {/* The island this realm rolled, tilted like the isometric view */}
          <div className="shrink-0 w-[120px] h-[90px] flex items-center justify-center overflow-hidden border-2 border-red-950 bg-stone-950/80" title={tr('introMapPreview')}>
            <canvas
              ref={canvas}
              className="[image-rendering:pixelated]"
              style={{ width: 84, height: 84, transform: 'scaleY(0.58) rotate(45deg)' }}
            />
          </div>
        </div>
        <p className="mt-1.5 text-[10px] text-stone-400">{locked ? tr('introMapLocked') : tr('introMapPreview')}</p>
        {/* Seed: roll a random island, or type one in to replay a map you liked */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={locked}
            onClick={() => { soundFx.playClick(); const n = newLayoutSeed(); choose(n, coastForSeed(n)); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase border border-amber-600/60 bg-red-950/70 text-amber-200 ${
              locked ? 'opacity-50 cursor-not-allowed' : 'hover:text-white hover:border-amber-400 cursor-pointer'
            }`}
          >
            <Dices className="w-4 h-4" /> {tr('introMapReroll')}
          </button>
          <label className="flex items-center gap-1.5 text-[10px] text-stone-400">
            {tr('introMapSeed')}
            <input
              type="text"
              inputMode="numeric"
              value={seedText}
              disabled={locked}
              onChange={(e) => setSeedText(e.target.value.replace(/\D/g, '').slice(0, 10))}
              onKeyDown={(e) => e.key === 'Enter' && applySeed()}
              className="w-28 px-2 py-1 font-mono text-xs bg-stone-950 border border-red-900/70 text-amber-100 focus:border-amber-500 outline-none"
            />
          </label>
          <button
            type="button"
            disabled={locked || !seedText || Number(seedText) === seed}
            onClick={applySeed}
            className="px-2.5 py-1 text-[10px] font-bold uppercase border border-red-900/70 bg-stone-950 text-amber-200/80 hover:text-amber-100 hover:border-amber-500/60 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {tr('introMapApply')}
          </button>
        </div>
      </fieldset>
    </div>
  );
};
