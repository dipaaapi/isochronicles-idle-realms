import React, { useState } from 'react';
import { useGameStore } from '../state/useGameStore';
import { soundFx } from '../game/audio/soundFx';
import { useTranslation } from '../i18n/translations';
import {
  BRIGHTNESS_RANGE,
  GRAPHICS_PRESETS,
  recommendedFps,
  useGraphicsSettings,
  type FpsPreset,
} from '../state/graphicsSettings';

const FPS_OPTIONS: FpsPreset[] = [30, 60, 90];

/** FPS preset picker (each preset also sets shadows/glow) plus the individual graphics options. */
export const GraphicsSettingsBlock: React.FC = () => {
  const { t: tr, isTL } = useTranslation();
  const targetFps = useGameStore((s) => s.targetFps);
  const measuredFps = useGameStore((s) => s.measuredFps);
  const gfx = useGraphicsSettings();
  const recommended = recommendedFps();

  const pickPreset = (fps: FpsPreset) => {
    soundFx.playTab();
    useGameStore.getState().setTargetFps(fps);
    gfx.applyPreset(fps);
  };

  // A preset the device can't hold: measured well under target
  const struggling = measuredFps > 0 && measuredFps < targetFps * 0.75;
  const custom = (() => {
    const p = GRAPHICS_PRESETS[`${targetFps}`];
    return p && (p.shadows !== gfx.shadows || p.glow !== gfx.glow);
  })();

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {FPS_OPTIONS.map((fps) => {
          const p = GRAPHICS_PRESETS[`${fps}`];
          const active = targetFps === fps;
          return (
            <button
              key={fps}
              type="button"
              onClick={() => pickPreset(fps)}
              title={isTL ? p.hint.tl : p.hint.en}
              className={`relative py-2 px-1 text-center border-2 transition-all cursor-pointer ${
                active ? 'border-purple-400 bg-purple-600/30 text-white' : 'border-slate-800 bg-slate-800/70 text-slate-400 hover:border-slate-600'
              }`}
            >
              <div className="text-xs font-mono font-bold">{fps} FPS</div>
              <div className="text-[9px]">{isTL ? p.label.tl : p.label.en}</div>
              {fps === recommended && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-1 text-[8px] font-bold uppercase bg-emerald-500 text-slate-950 whitespace-nowrap">
                  {tr('gfxRecommended')}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-[10px] leading-snug text-slate-500">
        {isTL ? GRAPHICS_PRESETS[`${targetFps}`].hint.tl : GRAPHICS_PRESETS[`${targetFps}`].hint.en}
        {custom && <span className="text-amber-300"> · {tr('gfxCustom')}</span>}
      </p>
      {struggling && targetFps > 30 && (
        <p className="text-[10px] text-amber-300">
          {tr('gfxStruggling').replace('{fps}', String(measuredFps))}
        </p>
      )}

      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <span>
          <span className="block text-xs text-slate-200">{tr('gfxShadows')}</span>
          <span className="block text-[10px] text-slate-500">{tr('gfxShadowsHint')}</span>
        </span>
        <input
          type="checkbox"
          className="checkbox checkbox-sm checkbox-primary"
          checked={gfx.shadows}
          onChange={(e) => { soundFx.playToggle(e.target.checked); gfx.set({ shadows: e.target.checked }); }}
        />
      </label>

      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <span>
          <span className="block text-xs text-slate-200">{tr('gfxGlow')}</span>
          <span className="block text-[10px] text-slate-500">{tr('gfxGlowHint')}</span>
        </span>
        <input
          type="checkbox"
          className="checkbox checkbox-sm checkbox-primary"
          checked={gfx.glow}
          onChange={(e) => { soundFx.playToggle(e.target.checked); gfx.set({ glow: e.target.checked }); }}
        />
      </label>

      <div>
        <div className="flex items-center justify-between text-xs text-slate-200">
          <span>{tr('gfxBrightness')}</span>
          <span className="font-mono text-slate-400">{Math.round(gfx.brightness * 100)}%</span>
        </div>
        <input
          type="range"
          className="range range-xs range-primary mt-1"
          min={BRIGHTNESS_RANGE.min}
          max={BRIGHTNESS_RANGE.max}
          step={BRIGHTNESS_RANGE.step}
          value={gfx.brightness}
          onChange={(e) => gfx.set({ brightness: Number(e.target.value) })}
          onDoubleClick={() => gfx.set({ brightness: BRIGHTNESS_RANGE.default })}
          aria-label={tr('gfxBrightness')}
        />
      </div>
    </div>
  );
};

/** Music and SFX volume sliders (separate buses in soundFx). */
export const AudioVolumeBlock: React.FC = () => {
  const { t: tr } = useTranslation();
  const [music, setMusic] = useState(() => soundFx.getMusicVolume());
  const [sfx, setSfx] = useState(() => soundFx.getSfxVolume());

  const row = (label: string, value: number, onChange: (v: number) => void, onRelease?: () => void) => (
    <div>
      <div className="flex items-center justify-between text-xs text-slate-200">
        <span>{label}</span>
        <span className="font-mono text-slate-400">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        className="range range-xs range-info mt-1"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onRelease}
        aria-label={label}
      />
    </div>
  );

  return (
    <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3.5">
      {row(tr('audioMusicVolume'), music, (v) => { setMusic(v); soundFx.setMusicVolume(v); })}
      {row(tr('audioSfxVolume'), sfx, (v) => { setSfx(v); soundFx.setSfxVolume(v); }, () => soundFx.playUpgrade())}
    </div>
  );
};
