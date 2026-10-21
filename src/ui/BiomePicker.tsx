import { PLATFORM_CONFIGS } from '../data/platforms';
import { soundFx } from '../game/audio/soundFx';
import type { PlatformPhase } from '../types/state';

/**
 * Biome (realm) picker: used at New Game and in Settings. The biome is a
 * setting now (waves no longer move the realm); it changes the island's look,
 * water life and music, not the waves' strength.
 */
export function BiomePicker({ value, onChange, isTL, compact = false }: {
  value: PlatformPhase;
  onChange: (phase: PlatformPhase) => void;
  isTL: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`grid gap-2 ${compact ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4'}`}>
      {([1, 2, 3, 4] as const).map((p) => {
        const cfg = PLATFORM_CONFIGS[p];
        const on = value === p;
        return (
          <button
            type="button"
            key={p}
            onClick={() => { soundFx.playClick(); onChange(p); }}
            className="pixel-btn text-left p-2 cursor-pointer"
            style={{ background: on ? `${cfg.accentColor}33` : '#0f172a', outline: on ? `2px solid ${cfg.accentColor}` : undefined, outlineOffset: -2 }}
          >
            <div className="text-xs font-bold" style={{ color: cfg.accentColor }}>
              {on ? '✔ ' : ''}{isTL ? cfg.name : cfg.nameEn}
            </div>
            {!compact && (
              <p className="mt-1 text-[10px] leading-snug text-slate-400 line-clamp-2">{isTL ? cfg.tagline : cfg.taglineEn}</p>
            )}
          </button>
        );
      })}
    </div>
  );
}
