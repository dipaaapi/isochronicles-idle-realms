import { useGameStore } from '../state/useGameStore';
import { useTranslation, type TranslationKey } from '../i18n/translations';
import type { AutoSettings } from '../types/state';

/** A caretaker automation switch (Slime / Treant) with a one-line explanation beneath it. */
export function AutoToggle({ setting, icon, label, hint }: { setting: keyof AutoSettings; icon: string; label: TranslationKey; hint: TranslationKey }) {
  const { t } = useTranslation();
  const on = useGameStore((s) => !!s.autoSettings[setting]);
  const toggle = useGameStore((s) => s.toggleAutoSetting);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => toggle(setting)}
        aria-pressed={on}
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
          on ? 'border-emerald-500 bg-emerald-900/50 text-emerald-200 shadow-sm' : 'border-slate-700 bg-slate-800 text-slate-400'
        }`}
      >
        <span>{icon}</span>
        <span>{t(label)}</span>
        <span className={`h-2 w-2 rounded-full ${on ? 'animate-pulse bg-emerald-400' : 'bg-slate-600'}`} />
      </button>
      <span className="text-[10px] text-slate-500">{t(hint)}</span>
    </div>
  );
}
