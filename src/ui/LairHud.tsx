import { useGameStore } from '../state/useGameStore';
import { useTranslation } from '../i18n/translations';
import { resourceName } from '../state/activityLog';
import { gameConfirm } from './GameDialog';
import { useLairHud } from '../game/lair/lairHud';
import { CHECKPOINTS, LAIR_CONFIG, LAIR_OBSTACLES, MATRIARCH, regionIndexAt } from '../state/lairExpedition';

const SIDES = [
  { id: 'DEMON', label: 'lairSideDemon', text: 'text-purple-300', bar: 'bg-purple-500' },
  { id: 'DRAGON', label: 'lairSideDragon', text: 'text-orange-300', bar: 'bg-orange-500' },
  { id: 'HUMAN', label: 'lairSideHuman', text: 'text-sky-300', bar: 'bg-sky-500' },
] as const;

/**
 * Dragon's Lair overlay: route progress, party status, the rules inside,
 * Ignara's HP and phase once her battle starts, the hoard when she falls,
 * Hold / Advance and the way home.
 */
export function LairHud() {
  const { t, isTL } = useTranslation();
  const leaveLair = useGameStore((s) => s.leaveLair);
  const checkpoint = useGameStore((s) => s.lairProgress.checkpoint);
  const hud = useLairHud();
  const stopY = LAIR_CONFIG.route.stopY;
  const pct = Math.round(Math.min(1, hud.frontY / stopY) * 100);
  const region = LAIR_CONFIG.regions[regionIndexAt(Math.floor(hud.frontY))];
  const holding = LAIR_OBSTACLES.find((o) => o.id === hud.holdingAt);
  const status = hud.battle ? t('lairHudBattle')
    : hud.holdingAt === 'END' ? t('lairHudEnd')
    : holding ? `${isTL ? holding.name.tl : holding.name.en} — ${Math.round(hud.holdProgress * 100)}%`
    : hud.hold ? t('lairHudHolding') : t('lairHudAdvancing');
  const name = isTL ? MATRIARCH.name.tl : MATRIARCH.name.en;
  const phase = MATRIARCH.phaseNames[hud.dragonPhase] ?? MATRIARCH.phaseNames[0];
  const hpPct = hud.dragonMaxHp > 0 ? Math.max(0, hud.dragonHp / hud.dragonMaxHp) * 100 : 100;

  if (hud.victory) {
    return (
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[60] w-[min(94%,30rem)] rounded-lg border border-amber-500/70 bg-stone-950/90 px-4 py-3 text-center shadow-lg">
        <h2 className="text-base font-black uppercase tracking-widest text-amber-300">🏆 {t('lairHudVictory')}</h2>
        <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-amber-100">
          {Object.entries(hud.victory).map(([key, n]) => (
            <span key={key}>+{n.toLocaleString()} {isTL ? resourceName(key).tl : resourceName(key).en}</span>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-stone-400">{t('lairHudVictoryNote')}</p>
      </div>
    );
  }

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[60] w-[min(94%,30rem)] rounded-lg border border-orange-900/70 bg-stone-950/85 px-4 py-3 shadow-lg">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-black uppercase tracking-widest text-orange-300">{t('lairHudTitle')}</h2>
        <span className="text-[11px] text-stone-400">{isTL ? region.name.tl : region.name.en}</span>
      </div>

      {hud.battle ? (
        /* Ignara's HP never rises: what the party takes off stays off */
        <div className="mt-2">
          <div className="flex justify-between text-[11px]">
            <span className="font-bold text-red-300">🐉 {name}</span>
            <span className="text-orange-200">{t('lairHudPhase')} {hud.dragonPhase + 1}: {isTL ? phase.tl : phase.en}</span>
          </div>
          <div className="mt-1 h-3 overflow-hidden rounded-full border border-red-900 bg-stone-800">
            <div className="h-full bg-gradient-to-r from-red-700 via-orange-500 to-amber-400 transition-[width] duration-200" style={{ width: `${hpPct}%` }} />
          </div>
          <div className="mt-0.5 text-right font-mono text-[10px] text-stone-400">
            {Math.ceil(hud.dragonHp).toLocaleString()} / {hud.dragonMaxHp.toLocaleString()}
          </div>
          {/* Three sides, no allies: who is left, who Ignara hunts, who is being ganged up on */}
          <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-[10px]">
            {SIDES.map((s) => {
              const share = Math.min(1, Math.max(0, hud.shares[s.id]));
              return (
                <div key={s.id} className={`rounded border px-1.5 py-1 ${hud.leader === s.id ? 'border-amber-400 bg-amber-950/40' : 'border-stone-700 bg-stone-900/60'}`}>
                  <div className={`flex justify-between font-bold ${s.text}`}>
                    <span>{t(s.label)}</span>
                    <span className="font-mono">{Math.round(share * 100)}%</span>
                  </div>
                  <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-stone-800">
                    <div className={`h-full ${s.bar}`} style={{ width: `${share * 100}%` }} />
                  </div>
                  {hud.dragonFocus === s.id && <div className="mt-0.5 text-red-300">🔥 {t('lairHunted')}</div>}
                  {hud.leader === s.id && <div className="mt-0.5 text-amber-300">⚔️ {t('lairGanged')}</div>}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          <p className="mt-1 text-[11px] text-stone-400">{t('lairHudTest')}</p>
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
        </>
      )}

      <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-[11px] text-stone-300">
        <span>{t('lairHudParty')}: <b className="text-emerald-300">{hud.alive}</b>/{hud.total}</span>
        {hud.foes > 0 && <span className="text-orange-300">{t('lairHudFoes')}: {hud.foes}</span>}
        {hud.humans > 0 && <span className="text-sky-300">{t('lairHudHumans')}: {hud.humans}</span>}
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
        {!hud.battle && (
          <button
            type="button"
            onClick={() => hud.setHold(!hud.hold)}
            className="rounded bg-stone-700 px-3 py-1 text-xs font-bold text-white hover:bg-stone-600"
          >
            {hud.hold ? t('lairHudAdvance') : t('lairHudHold')}
          </button>
        )}
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
