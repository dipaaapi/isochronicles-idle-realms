import { useGameStore } from '../state/useGameStore';
import { useTranslation } from '../i18n/translations';
import { gameConfirm } from './GameDialog';
import { useLairHud } from '../game/lair/lairHud';
import { CHECKPOINTS, LAIR_CONFIG, LAIR_OBSTACLES, regionIndexAt } from '../state/lairExpedition';

/** Dragon's Lair overlay: route progress, party status, the rules inside, Hold / Advance and the way home. */
export function LairHud() {
  const { t, isTL } = useTranslation();
  const leaveLair = useGameStore((s) => s.leaveLair);
  const checkpoint = useGameStore((s) => s.lairProgress.checkpoint);
  const hud = useLairHud();
  const stopY = LAIR_CONFIG.route.stopY;
  const pct = Math.round(Math.min(1, hud.frontY / stopY) * 100);
  const region = LAIR_CONFIG.regions[regionIndexAt(Math.floor(hud.frontY))];
  const holding = LAIR_OBSTACLES.find((o) => o.id === hud.holdingAt);
  const status = hud.holdingAt === 'END' ? t('lairHudEnd')
    : holding ? `${isTL ? holding.name.tl : holding.name.en} — ${Math.round(hud.holdProgress * 100)}%`
    : hud.hold ? t('lairHudHolding') : t('lairHudAdvancing');

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[60] w-[min(94%,30rem)] rounded-lg border border-orange-900/70 bg-stone-950/85 px-4 py-3 shadow-lg">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-black uppercase tracking-widest text-orange-300">{t('lairHudTitle')}</h2>
        <span className="text-[11px] text-stone-400">{isTL ? region.name.tl : region.name.en}</span>
      </div>
      <p className="mt-1 text-[11px] text-stone-400">{t('lairHudTest')}</p>

      {/* Route: the front's progress toward the chamber, checkpoint ticks along it */}
      <div className="mt-2 flex items-center gap-2 text-[11px] text-stone-300">
        <span className="w-12 shrink-0">{t('lairHudRoute')}</span>
        <div className="relative h-2.5 flex-1 overflow-hidden rounded-full border border-stone-700 bg-stone-800">
          <div className="h-full bg-gradient-to-r from-purple-600 to-orange-500" style={{ width: `${pct}%` }} />
          {CHECKPOINTS.slice(1).filter((y) => y < stopY).map((y, i) => (
            <span
              key={y}
              className={`absolute top-0 h-full w-0.5 ${i + 1 <= checkpoint ? 'bg-amber-300' : 'bg-stone-500'}`}
              style={{ left: `${(y / stopY) * 100}%` }}
            />
          ))}
        </div>
        <span className="w-9 text-right font-mono">{pct}%</span>
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-stone-300">
        <span>{t('lairHudParty')}: <b className="text-emerald-300">{hud.alive}</b>/{hud.total}</span>
        {hud.respawning > 0 && (
          <span className="text-rose-300">
            {t('lairHudRespawn').replace('{n}', String(hud.respawning)).replace('{s}', String(Math.ceil(hud.nextRespawn)))}
          </span>
        )}
        <span className="text-amber-200">{status}</span>
      </div>

      <p className="mt-2 rounded border border-rose-900/60 bg-rose-950/40 px-2 py-1 text-[10px] text-rose-200">{t('lairHudRules')}</p>
      <p className="mt-1 text-[10px] text-stone-500">{t('lairHudHint')}</p>

      <div className="mt-2 flex justify-center gap-2">
        <button
          type="button"
          onClick={() => hud.setHold(!hud.hold)}
          className="rounded bg-stone-700 px-3 py-1 text-xs font-bold text-white hover:bg-stone-600"
        >
          {hud.hold ? t('lairHudAdvance') : t('lairHudHold')}
        </button>
        <button
          type="button"
          onClick={async () => { if (await gameConfirm(t('lairLeaveConfirm'))) leaveLair(); }}
          className="rounded bg-purple-700 px-3 py-1 text-xs font-bold text-white hover:bg-purple-600"
        >
          {t('lairReturn')}
        </button>
      </div>
    </div>
  );
}
