import { create } from 'zustand';
import PRESETS from '../data/graphicsPresets.json';
import { recommendedFps, type FpsPreset } from './deviceProfile';

export { recommendedFps, type FpsPreset };

/**
 * Device-local graphics options (shadows, glow, brightness). Kept in localStorage like the
 * target FPS, not in the save file, because they describe this device rather than the realm.
 */

export interface GraphicsSettings {
  shadows: boolean;
  glow: boolean;
  brightness: number;
}

interface GraphicsStore extends GraphicsSettings {
  set: (patch: Partial<GraphicsSettings>) => void;
  applyPreset: (fps: FpsPreset) => void;
}

const STORAGE_KEY = 'isochronicle_graphics';
export const GRAPHICS_PRESETS = PRESETS.presets as Record<
  `${FpsPreset}`,
  { label: { en: string; tl: string }; hint: { en: string; tl: string }; shadows: boolean; glow: boolean }
>;
export const BRIGHTNESS_RANGE = PRESETS.brightness;

const clampBrightness = (v: number) => Math.min(BRIGHTNESS_RANGE.max, Math.max(BRIGHTNESS_RANGE.min, v));

const load = (): GraphicsSettings => {
  const fallback: GraphicsSettings = { ...presetValues(recommendedFps()), brightness: BRIGHTNESS_RANGE.default };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<GraphicsSettings>;
    return {
      shadows: typeof parsed.shadows === 'boolean' ? parsed.shadows : fallback.shadows,
      glow: typeof parsed.glow === 'boolean' ? parsed.glow : fallback.glow,
      brightness: typeof parsed.brightness === 'number' ? clampBrightness(parsed.brightness) : fallback.brightness,
    };
  } catch {
    return fallback;
  }
};

const save = (s: GraphicsSettings) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ shadows: s.shadows, glow: s.glow, brightness: s.brightness }));
  } catch {
    /* storage unavailable: settings last for this session only */
  }
};

function presetValues(fps: FpsPreset): Pick<GraphicsSettings, 'shadows' | 'glow'> {
  const p = GRAPHICS_PRESETS[`${fps}`];
  return { shadows: p.shadows, glow: p.glow };
}

export const useGraphicsSettings = create<GraphicsStore>((set, get) => ({
  ...load(),
  set: (patch) => {
    const next = { ...get(), ...patch };
    if (patch.brightness !== undefined) next.brightness = clampBrightness(patch.brightness);
    set(next);
    save(next);
  },
  applyPreset: (fps) => get().set(presetValues(fps)),
}));
