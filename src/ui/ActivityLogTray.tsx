import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ScrollText, Trash2 } from 'lucide-react';
import { useGameStore } from '../state/useGameStore';
import { ActivityCategory, ActivityTone, activityUi, useActivityLog } from '../state/activityLog';
import { soundFx } from '../game/audio/soundFx';

type Filter = 'all' | ActivityCategory;
const FILTERS: Filter[] = ['all', 'combat', 'economy', 'minions', 'world'];
const OPEN_KEY = 'isochronicle.activityTrayOpen';

const TONE_STYLES: Record<ActivityTone, { border: string; text: string }> = {
  good: { border: 'border-l-emerald-400', text: 'text-emerald-100' },
  bad: { border: 'border-l-rose-500', text: 'text-rose-100' },
  epic: { border: 'border-l-amber-400', text: 'text-amber-100' },
  neutral: { border: 'border-l-slate-500', text: 'text-slate-200' },
};

const readOpen = (): boolean => {
  try {
    return localStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * Collapsible activity log in the bottom-left corner of the game canvas.
 * Everything that used to float as text over units and buildings is narrated
 * here instead. Collapsed, it shows the latest event as a one-line ticker.
 */
export const ActivityLogTray: React.FC = () => {
  const entries = useActivityLog((s) => s.entries);
  const unread = useActivityLog((s) => s.unread);
  const markRead = useActivityLog((s) => s.markRead);
  const clear = useActivityLog((s) => s.clear);
  const language = useGameStore((s) => s.language);
  const [open, setOpen] = useState(readOpen);
  const [filter, setFilter] = useState<Filter>('all');

  const t = (text: { en: string; tl: string }) => (language === 'TL' ? text.tl : text.en);

  useEffect(() => {
    if (open && unread > 0) markRead();
  }, [open, unread, markRead]);

  const toggle = () => {
    soundFx.playClick();
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, next ? '1' : '0');
    } catch {
      // Preference is a convenience only
    }
  };

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: entries.length, combat: 0, economy: 0, minions: 0, world: 0 };
    for (const e of entries) c[e.category]++;
    return c;
  }, [entries]);

  const visible = filter === 'all' ? entries : entries.filter((e) => e.category === filter);
  const latest = entries[0];

  if (!open) {
    return (
      <div className="pointer-events-none absolute bottom-3 left-3 z-20 max-w-[min(360px,calc(100%-1.5rem))]">
        <button
          type="button"
          onClick={toggle}
          className="pixel-frame pointer-events-auto flex w-full items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-950/85 px-3 py-2 text-left shadow-lg shadow-black/40 backdrop-blur-md transition hover:border-violet-500/60"
          title={t(activityUi.title)}
        >
          <span className="relative shrink-0 text-violet-300">
            <ScrollText className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute -right-2 -top-2 min-w-[16px] rounded-full bg-rose-500 px-1 text-center text-[9px] font-bold leading-4 text-white">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </span>
          {latest ? (
            <span key={latest.id + ':' + latest.count} className="animate-tray-in flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-slate-200">
              <span className="shrink-0">{latest.icon}</span>
              <span className="truncate">{latest.text}</span>
              {latest.count > 1 && <span className="shrink-0 font-mono text-[10px] text-slate-400">×{latest.count}</span>}
            </span>
          ) : (
            <span className="text-[11px] text-slate-400">{t(activityUi.title)}</span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-20 w-[min(360px,calc(100%-1.5rem))]">
      <section className="pixel-frame pointer-events-auto flex max-h-[min(340px,60vh)] flex-col overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950/90 shadow-2xl shadow-black/50 backdrop-blur-md">
        <header className="flex items-center gap-2 border-b border-slate-800 px-3 py-2">
          <ScrollText className="h-4 w-4 text-violet-300" />
          <h2 className="font-fantasy text-xs font-bold tracking-wider text-violet-100">{t(activityUi.title)}</h2>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => { soundFx.playClick(); clear(); }}
              className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-800 hover:text-rose-300"
              title={t(activityUi.clear)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={toggle}
              className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
              aria-label={t(activityUi.collapse)}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-slate-800/80 px-2 py-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-bold transition ${
                filter === f ? 'bg-violet-500/25 text-violet-200 ring-1 ring-violet-500/50' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {t(activityUi.filters[f])}
              <span className="ml-1 font-mono text-[9px] opacity-70">{counts[f]}</span>
            </button>
          ))}
        </nav>

        <ol className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1.5">
          {visible.length === 0 && <li className="py-6 text-center text-[11px] text-slate-500">{t(activityUi.empty)}</li>}
          {visible.map((e) => {
            const tone = TONE_STYLES[e.tone];
            return (
              <li key={e.id} className={`mb-1 flex items-start gap-2 rounded-lg border-l-2 bg-slate-900/60 px-2 py-1.5 ${tone.border}`}>
                <span className="mt-px shrink-0 text-sm leading-4">{e.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className={`break-words text-[11px] font-medium leading-4 ${tone.text}`}>
                    {e.text}
                    {e.count > 1 && <span className="ml-1 font-mono text-[10px] text-slate-400">×{e.count}</span>}
                  </p>
                  <p className="mt-0.5 font-mono text-[9px] text-slate-500">
                    {t(activityUi.day)} {e.day} · {e.clock}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
};
