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

const KIND_ICON: Record<string, string> = { BAT: '🦇', KIN: '🐲', GOLEM: '🪨', HUMAN: '🛡️' };

/** "+40 Coins · +2 Arcane Essence" in the player's language. */
const lootText = (loot: Record<string, number>, isTL: boolean) =>
  Object.entries(loot).map(([k, n]) => `+${n.toLocaleString()} ${isTL ? resourceName(k).tl : resourceName(k).en}`).join(' · ');

function Stars({ n }: { n: number }) {
  return (
    <div className="flex justify-center gap-1 text-2xl leading-none">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= n ? 'text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.7)]' : 'text-stone-700'}>★</span>
      ))}
    </div>
  );
}

/**
 * Dragon's Lair right sidebar (stands in for GameHUD while in the lair): route
 * progress, party status, Ignara's HP and phase, the kill loot log, the hoard
 * and star rating when she falls, Hold / Advance and the way home.
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
  const totalHits = hud.demonDamage + hud.humanDamage;
  const demonShare = totalHits > 0 ? hud.demonDamage / totalHits : 0;

  return (
    <aside className="relative z-[60] flex h-full w-[320px] shrink-0 flex-col gap-2 overflow-y-auto border-l border-orange-900/70 bg-stone-950 px-3 py-3 text-stone-200">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-black uppercase tracking-widest text-orange-300">{t('lairHudTitle')}</h2>
        <span className="text-[11px] text-stone-400">{isTL ? region.name.tl : region.name.en}</span>
      </div>

      {hud.victory ? (
        /* She fell: the rating, the damage behind it and the hoard */
        <section className="rounded-lg border border-amber-500/70 bg-amber-950/20 px-3 py-2 text-center">
          <h3 className="text-sm font-black uppercase tracking-widest text-amber-300">🏆 {t('lairHudVictory')}</h3>
          <div className="mt-2"><Stars n={hud.stars} /></div>
          <p className="mt-1 text-[10px] text-amber-200/80">{t('lairStarsNote')}</p>
          <div className="mt-2 space-y-0.5 text-left text-[11px]">
            <div className="flex justify-between">
              <span className="text-purple-300">{t('lairSideDemon')}</span>
              <span className="font-mono">{Math.round(hud.demonDamage).toLocaleString()} ({Math.round(demonShare * 100)}%)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sky-300">{t('lairSideHuman')}</span>
              <span className="font-mono">{Math.round(hud.humanDamage).toLocaleString()} ({totalHits > 0 ? 100 - Math.round(demonShare * 100) : 0}%)</span>
            </div>
          </div>
          <h4 className="mt-2 text-left text-[11px] font-bold uppercase text-amber-200">💰 {t('lairHoard')}</h4>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-left text-xs text-amber-100">
            {Object.entries(hud.victory).map(([key, n]) => (
              <span key={key}>+{n.toLocaleString()} {isTL ? resourceName(key).tl : resourceName(key).en}</span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-stone-400">{t('lairHudVictoryNote')}</p>
        </section>
      ) : hud.battle ? (
        /* Ignara's HP never rises: what the party takes off stays off */
        <section>
          <div className="flex justify-between gap-2 text-[11px]">
            <span className="font-bold text-red-300">🐉 {name}</span>
            <span className="text-right text-orange-200">{t('lairHudPhase')} {hud.dragonPhase + 1}: {isTL ? phase.tl : phase.en}</span>
          </div>
          <div className="mt-1 h-3 overflow-hidden rounded-full border border-red-900 bg-stone-800">
            <div className="h-full bg-gradient-to-r from-red-700 via-orange-500 to-amber-400 transition-[width] duration-200" style={{ width: `${hpPct}%` }} />
          </div>
          <div className="mt-0.5 text-right font-mono text-[10px] text-stone-400">
            {Math.ceil(hud.dragonHp).toLocaleString()} / {hud.dragonMaxHp.toLocaleString()}
          </div>
          {/* Three sides, no allies: who is left, who Ignara hunts, who is being ganged up on */}
          <div className="mt-1.5 space-y-1.5 text-[10px]">
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
          <p className="mt-1.5 text-[10px] text-amber-200/80">⭐ {t('lairStarsHint')}</p>
        </section>
      ) : (
        <section>
          <p className="text-[11px] text-stone-400">{t('lairHudTest')}</p>
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
        </section>
      )}

      {!hud.victory && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-stone-300">
          <span>{t('lairHudParty')}: <b className="text-emerald-300">{hud.alive}</b>/{hud.total}</span>
          {hud.foes > 0 && <span className="text-orange-300">{t('lairHudFoes')}: {hud.foes}</span>}
          {hud.humans > 0 && <span className="text-sky-300">{t('lairHudHumans')}: {hud.humans}</span>}
          {hud.respawning > 0 && (
            <span className="text-rose-300">
              {t('lairHudRespawn').replace('{n}', String(hud.respawning)).replace('{s}', String(Math.ceil(hud.nextRespawn)))}
            </span>
          )}
          <span className="col-span-2 text-amber-200">{status}</span>
        </div>
      )}

      {/* Every demon kill's drop, newest first, with the running total */}
      <section className="flex min-h-[8rem] flex-1 flex-col rounded border border-stone-700 bg-stone-900/60">
        <h3 className="border-b border-stone-700 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-200">🎒 {t('lairLootLog')}</h3>
        {Object.keys(hud.lootTotals).length > 0 && (
          <p className="border-b border-stone-800 px-2 py-1 text-[10px] text-amber-100">Σ {lootText(hud.lootTotals, isTL)}</p>
        )}
        <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 py-1 text-[10px]">
          {hud.lootLog.length === 0 && <li className="text-stone-500">{t('lairLootEmpty')}</li>}
          {hud.lootLog.map((e) => (
            <li key={e.id} className="leading-snug">
              <span className="text-stone-300">{KIND_ICON[e.kind] ?? '💀'} {isTL ? e.name.tl : e.name.en}</span>
              <span className="text-emerald-300"> {lootText(e.loot, isTL)}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="rounded border border-rose-900/60 bg-rose-950/40 px-2 py-1 text-[10px] text-rose-200">{t('lairHudRules')}</p>
      <p className="text-[10px] text-stone-500">{t('lairHudHint')}</p>

      {!hud.victory && (
        <div className="flex justify-center gap-2">
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
      )}
    </aside>
  );
}
