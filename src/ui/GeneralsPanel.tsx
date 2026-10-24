import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../state/useGameStore';
import { useTranslation, unitName } from '../i18n/translations';
import { BEAST_PORTRAITS } from '../game/bestiaryPortraits';
import { UNIT_CLASSES } from '../types/game';
import { GENERAL_ORDERS, MAX_ORDERS, RAGE, minionOrdersOf, orderInfo, ordersOf, sturdyFromBonus, type GeneralOrder, type OrderScope } from '../state/generalOrders';
import { liveOrderOf } from '../game/workers/generalOrders';
import { logMessage } from '../state/activityLog';
import { soundFx } from '../game/audio/soundFx';
import KIROV from '../data/kirov.json';
import LOCOMOTION from '../data/locomotion.json';
import { battleTargets, hasNonBrawlBattle } from '../game/battleTargets';
import { BRAWL_CONFIG } from '../state/brawl';

interface Gauge { id: string; hp: number; maxHp: number; rage: number; brawling: boolean }
type Priority = (typeof GENERAL_ORDERS.priorities)[number];

const FLYERS = new Set<string>(LOCOMOTION.fly);
/** Generals that can hurt the Kirov (same rule as KirovAirship anti-air). */
const canHitAir = (cls: string) => FLYERS.has(cls) || (UNIT_CLASSES[cls as keyof typeof UNIT_CLASSES]?.attackRange ?? 0) >= KIROV.antiAir.longRange;

/** Asks the Phaser scene (WorkerManager) for something; undefined when the scene isn't up. */
function askScene<T>(command: string, extra: Record<string, unknown> = {}): T | undefined {
  let out: T | undefined;
  window.dispatchEvent(new CustomEvent('isochronicle:activity-command', { detail: { command, ...extra, respond: (r: T) => { out = r; } } }));
  return out;
}

/** A segmented pixel gauge (10 cells). */
function PixelBar({ value, color, glow }: { value: number; color: string; glow?: boolean }) {
  const filled = Math.round(Math.max(0, Math.min(1, value)) * 10);
  return (
    <div className={`flex gap-px bg-slate-950 p-px ${glow ? 'animate-pulse' : ''}`}>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className="h-[3px] flex-1" style={{ background: i < filled ? color : '#1e293b' }} />
      ))}
    </div>
  );
}

/**
 * Sidebar Generals command panel: pick Generals (tap, or quick picks: all, full
 * rage, anti-air, + power), give them a battle priority, order a brawl between
 * an automatic brawl between two living Generals, or spend + power on their establishments (Fortify).
 * Rules in src/data/generalOrders.json.
 */
export function GeneralsPanel() {
  const { t, language: lang } = useTranslation();
  const roster = useGameStore((s) => s.roster);
  const setGeneralOrders = useGameStore((s) => s.setGeneralOrders);
  const [scope, setScope] = useState<OrderScope>('BOTH');
  const investBrawlPower = useGameStore((s) => s.investBrawlPower);
  const sellBrawlPlus = useGameStore((s) => s.sellBrawlPlus);
  const [gauges, setGauges] = useState<Record<string, Gauge>>({});
  const [picked, setPicked] = useState<string[]>([]);
  const [hoverOrder, setHoverOrder] = useState<Priority | null>(null);
  const [note, setNote] = useState<{ text: string; good?: boolean } | null>(null);

  useEffect(() => {
    const poll = () => {
      const list = askScene<Gauge[]>('generalGauges');
      if (list) setGauges(Object.fromEntries(list.map((g) => [g.id, g])));
    };
    poll();
    const id = window.setInterval(poll, 500);
    return () => window.clearInterval(id);
  }, []);

  // Notes fade after a few seconds
  useEffect(() => {
    if (!note) return;
    const id = window.setTimeout(() => setNote(null), 3500);
    return () => window.clearTimeout(id);
  }, [note]);

  const generals = useMemo(() => roster.filter((u) => gauges[u.id]), [roster, gauges]);
  const sel = generals.filter((u) => picked.includes(u.id));
  const L = (p: { en: string; tl: string }) => (lang === 'TL' ? p.tl : p.en);
  const nameOf = (u: (typeof roster)[number]) => unitName(u.name, u.unitClass, lang);

  // The priority list being edited: the selection's list for the chosen scope (null = the picks differ)
  const listOf = (u: (typeof roster)[number]) => (scope === 'MINIONS' ? minionOrdersOf(u) : ordersOf(u));
  const lists = sel.map((u) => listOf(u).join(','));
  const sharedList: GeneralOrder[] | null = sel.length && lists.every((l) => l === lists[0]) ? listOf(sel[0]) : null;
  const sharedOrder = sharedList ? (sharedList[0] ?? 'AUTO') : null;
  const anyAir = sel.some((u) => canHitAir(u.unitClass));
  const fortifyHp = sel.reduce((n, u) => n + sturdyFromBonus(u.brawlAttack ?? 0, u.brawlHp ?? 0), 0);
  const otherBattleActive = hasNonBrawlBattle(useGameStore.getState().invasion.isActive);
  const canBrawl = generals.filter((u) => (gauges[u.id]?.hp ?? 0) > 0 && (u.brawlLevel ?? 0) < BRAWL_CONFIG.maxLevel).length >= 2 && !otherBattleActive;
  const maxed = sel.filter((u) => (u.brawlLevel ?? 0) >= BRAWL_CONFIG.maxLevel);

  const pick = (ids: string[]) => { soundFx.playClick(); setPicked(ids); };
  const toggle = (id: string) => pick(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);

  /** Tap an order: AUTO clears the list; any other is added as the next priority (tap again to remove it). */
  const order = (o: GeneralOrder) => {
    if (!sel.length) return setNote({ text: t('genPickFirst') });
    soundFx.playClick();
    const base = sharedList ?? [];
    const next = o === 'AUTO' ? [] : base.includes(o) ? base.filter((x) => x !== o) : [...base, o].slice(0, MAX_ORDERS);
    setGeneralOrders(sel.map((u) => u.id), next, scope);
    const text = next.length ? next.map((x) => orderInfo(x).icon).join(' › ') : `${orderInfo('AUTO').icon} ${L(orderInfo('AUTO'))}`;
    logMessage('generalOrder', { count: sel.length, order: `${text} (${L(GENERAL_ORDERS.scopes[scope])})` });
    setNote({ text: `${L(GENERAL_ORDERS.scopes[scope])}: ${text} → ${sel.length}`, good: true });
  };
  const removeAt = (i: number) => {
    if (!sharedList) return;
    soundFx.playClick();
    setGeneralOrders(sel.map((u) => u.id), sharedList.filter((_, k) => k !== i), scope);
  };

  const brawl = () => {
    if (otherBattleActive) return setNote({ text: t('genBrawlWave') });
    const started = askScene<boolean>('brawl');
    if (started) { setPicked([]); setNote(null); }
    else setNote({ text: battleTargets.brawl?.() ? t('genBrawlBusy') : t('genBrawlMissing') });
  };

  const fortify = () => {
    if (!sel.length) return setNote({ text: t('genPickFirst') });
    let total = 0;
    for (const u of sel) {
      const added = investBrawlPower(u.id);
      if (added > 0) {
        total += added;
        logMessage('generalFortify', { name: nameOf(u), hp: added });
      }
    }
    if (total > 0) { soundFx.playFanfare(); setNote({ text: `🏰 +${total.toLocaleString()} HP`, good: true }); }
    else setNote({ text: t('genFortifyNone') });
  };

  const sellPlus = () => {
    if (!maxed.length) return setNote({ text: t('genSellPlusNone') });
    let count = 0;
    for (const u of maxed) count += sellBrawlPlus(u.id);
    if (count > 0) {
      logMessage('generalPlusSold', { count });
      setNote({ text: t('genSellPlusDone').replace('{count}', String(count)), good: true });
    }
  };

  if (!generals.length) {
    return <div className="pixel-frame bg-slate-900 p-3 text-[11px] text-slate-400">👑 {t('genNone')}</div>;
  }

  const quick: Array<{ key: string; label: string; title: string; ids: string[] }> = [
    { key: 'all', label: L(GENERAL_ORDERS.teams.all), title: L(GENERAL_ORDERS.teams.all), ids: generals.map((u) => u.id) },
    { key: 'ready', label: `💢 ${L(GENERAL_ORDERS.teams.ready)}`, title: t('genReadyHint'), ids: generals.filter((u) => (gauges[u.id]?.rage ?? 0) >= RAGE.brawlCost).map((u) => u.id) },
    { key: 'air', label: `🏹 ${L(GENERAL_ORDERS.teams.air)}`, title: t('genAirHint'), ids: generals.filter((u) => canHitAir(u.unitClass)).map((u) => u.id) },
    { key: 'plus', label: `✦ ${L(GENERAL_ORDERS.teams.plus)}`, title: t('genPlusHint'), ids: generals.filter((u) => (u.brawlLevel ?? 0) > 0).map((u) => u.id) },
  ];
  const shownOrder = hoverOrder ?? (sharedOrder ? orderInfo(sharedOrder) : null);

  return (
    <div className="pixel-frame bg-slate-900 p-2 flex flex-col gap-2 select-none">
      {/* Quick picks */}
      <div className="flex items-center gap-1">
        {quick.map((q) => (
          <button key={q.key} title={`${q.title} (${q.ids.length})`} disabled={!q.ids.length} onClick={() => pick(q.ids)}
            className="pixel-btn flex-1 bg-slate-800 px-1 py-0.5 text-[10px] text-slate-200 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed whitespace-nowrap">
            {q.label}
          </button>
        ))}
        <button title={L(GENERAL_ORDERS.teams.none)} disabled={!picked.length} onClick={() => pick([])}
          className="pixel-btn bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300 cursor-pointer disabled:opacity-35">✕</button>
      </div>

      {/* Portraits */}
      <div className="grid grid-cols-5 gap-1">
        {generals.map((u) => {
          const g = gauges[u.id];
          const on = picked.includes(u.id);
          const gList = ordersOf(u);
          const mList = minionOrdersOf(u);
          const info = orderInfo(gList[0] ?? 'AUTO');
          const plus = u.brawlLevel ?? 0;
          const full = g.rage >= RAGE.brawlCost;
          return (
            <button key={u.id} onClick={() => toggle(u.id)}
              title={`${nameOf(u)}${plus ? ` +${plus}` : ''}\n❤️ ${g.hp}/${g.maxHp}  💢 ${g.rage}%\n👑 ${gList.length ? gList.map((o) => L(orderInfo(o))).join(' › ') : L(info)}\n⚔️ ${mList.length ? mList.map((o) => L(orderInfo(o))).join(' › ') : L(orderInfo('AUTO'))}`}
              className="relative flex flex-col cursor-pointer bg-slate-950 p-px"
              style={{ outline: on ? '2px solid #fbbf24' : '2px solid #0b0f1a', outlineOffset: -2, boxShadow: on ? '0 0 0 2px #78350f' : undefined }}>
              <div className="relative aspect-square overflow-hidden" style={{ background: `${info.color}22` }}>
                <img src={BEAST_PORTRAITS[u.unitClass] ?? ''} alt="" draggable={false}
                  className={`w-full h-full object-cover ${g.hp <= 0 ? 'grayscale opacity-50' : ''} ${on ? '' : 'opacity-85'}`} />
                <span className="absolute top-0 left-0 px-px text-[9px] leading-none" style={{ background: info.color }} title={gList.map((o) => orderInfo(o).icon).join(' › ')}>
                  {gList.length ? gList.map((o) => orderInfo(o).icon).join('') : info.icon}
                </span>
                {mList.length > 0 && (
                  <span className="absolute bottom-0 left-0 px-px text-[8px] leading-none bg-slate-900/90 text-slate-200">⚔{orderInfo(mList[0]).icon}</span>
                )}
                {plus > 0 && <span className="absolute top-0 right-0 px-0.5 text-[9px] font-bold leading-none bg-amber-400 text-slate-950">+{plus}</span>}
                {g.brawling && <span className="absolute inset-0 flex items-center justify-center bg-rose-900/60 text-sm animate-pulse">🥊</span>}
                {on && <span className="absolute bottom-0 right-0 px-px text-[9px] font-bold leading-none bg-amber-400 text-slate-950">✓</span>}
              </div>
              <PixelBar value={g.maxHp ? g.hp / g.maxHp : 0} color="#34d399" />
              <PixelBar value={g.rage / RAGE.max} color={full ? '#f43f5e' : '#f97316'} glow={full} />
            </button>
          );
        })}
      </div>

      {/* Selection summary */}
      <div className="bg-slate-950 px-1.5 py-1 text-[10px] leading-tight min-h-[1.5rem] flex items-center" style={{ boxShadow: 'inset 2px 2px 0 rgba(0,0,0,.5)' }}>
        {sel.length === 0 ? (
          <span className="text-slate-500">👆 {t('genTapHint')}</span>
        ) : (
          <span className="text-amber-200 truncate">
            ✓ {sel.slice(0, 2).map(nameOf).join(', ')}{sel.length > 2 ? ` ${t('genMore').replace('{n}', String(sel.length - 2))}` : ''}
          </span>
        )}
      </div>

      {/* Battle priority: who gets it (General / minions / both), then an ordered list of up to MAX_ORDERS */}
      <div>
        <div className="mb-1 flex items-center justify-between gap-1">
          <span className="text-[9px] uppercase tracking-wider text-slate-500">{t('genOrdersTitle')}</span>
          <div className="flex gap-px bg-slate-950 p-px">
            {(['GENERAL', 'MINIONS', 'BOTH'] as OrderScope[]).map((s) => (
              <button key={s} onClick={() => { soundFx.playClick(); setScope(s); }} title={L(GENERAL_ORDERS.scopes[s])}
                className={`no-bevel px-1.5 py-0.5 text-[9px] font-bold cursor-pointer ${scope === s ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                {GENERAL_ORDERS.scopes[s].icon} {L(GENERAL_ORDERS.scopes[s])}
              </button>
            ))}
          </div>
        </div>

        {/* The list being set, in priority order */}
        <div className="mb-1 flex min-h-[1.6rem] flex-wrap items-center gap-1 bg-slate-950 px-1.5 py-1 text-[10px]" style={{ boxShadow: 'inset 2px 2px 0 rgba(0,0,0,.5)' }}>
          {!sel.length ? (
            <span className="text-slate-500">{t('genPickFirst')}</span>
          ) : !sharedList ? (
            <span className="text-amber-300">{t('genPriorityMixed')}</span>
          ) : sharedList.length === 0 ? (
            <span className="text-slate-300">{orderInfo('AUTO').icon} {t('genPriorityAuto')}</span>
          ) : (
            sharedList.map((o, i) => (
              <span key={o} className="flex items-center gap-1 px-1 py-px font-bold" style={{ background: `${orderInfo(o).color}33`, color: orderInfo(o).color }}>
                <span className="text-slate-400">{i + 1}.</span>{orderInfo(o).icon} {L(orderInfo(o))}
                <button onClick={() => removeAt(i)} className="no-bevel ml-0.5 cursor-pointer text-slate-400 hover:text-white" title={t('genPriorityRemove')}>✕</button>
              </span>
            ))
          )}
        </div>

        <div className="grid grid-cols-6 gap-1">
          {GENERAL_ORDERS.priorities.map((p) => {
            const id = p.id as GeneralOrder;
            const rank = id === 'AUTO' ? (sharedList && sharedList.length === 0 ? 0 : -1) : sharedList ? sharedList.indexOf(id) : -1;
            const active = rank >= 0;
            const blocked = id === 'KIROV' && sel.length > 0 && !anyAir && scope !== 'MINIONS';
            const count = generals.filter((u) => listOf(u).includes(id) || (id === 'AUTO' && listOf(u).length === 0)).length;
            return (
              <button key={p.id} onClick={() => order(id)}
                onMouseEnter={() => setHoverOrder(p)} onMouseLeave={() => setHoverOrder(null)}
                title={blocked ? t('genKirovMelee') : (lang === 'TL' ? p.descTl : p.descEn)}
                className={`pixel-btn relative flex flex-col items-center py-1 cursor-pointer ${blocked ? 'opacity-45' : ''}`}
                style={{ background: active ? p.color : '#1e293b', color: active ? '#0b0f1a' : '#e2e8f0' }}>
                <span className="text-sm leading-none">{p.icon}</span>
                <span className="mt-0.5 text-[8px] leading-none font-bold">{lang === 'TL' ? p.shortTl : p.shortEn}</span>
                {active && id !== 'AUTO' && <span className="absolute -top-1 -left-1 px-0.5 text-[8px] leading-none font-black bg-amber-400 text-slate-950">{rank + 1}</span>}
                {count > 0 && <span className="absolute -top-1 -right-1 px-0.5 text-[8px] leading-none font-bold bg-slate-950 text-slate-300 border border-slate-700">{count}</span>}
              </button>
            );
          })}
        </div>

        {/* What the selection is doing right now */}
        <div className="mt-1 text-[10px] leading-tight text-slate-400 min-h-[2.2em]">
          {hoverOrder ? (
            <><span style={{ color: hoverOrder.color }}>{hoverOrder.icon} {L(hoverOrder)}:</span> {lang === 'TL' ? hoverOrder.descTl : hoverOrder.descEn}</>
          ) : sel.length ? (
            <span>
              {sel.slice(0, 3).map((u) => {
                const now = liveOrderOf(scope === 'MINIONS' ? minionOrdersOf(u) : ordersOf(u), u.unitClass, 0, 0, true);
                return <span key={u.id} className="mr-2 whitespace-nowrap">{nameOf(u)}: <b style={{ color: orderInfo(now).color }}>{orderInfo(now).icon} {now === 'AUTO' ? t('genNowAuto') : L(orderInfo(now))}</b></span>;
              })}
              <span className="text-slate-500">{t('genPriorityHint')}</span>
            </span>
          ) : shownOrder ? (
            <><span style={{ color: shownOrder.color }}>{shownOrder.icon} {L(shownOrder)}:</span> {lang === 'TL' ? shownOrder.descTl : shownOrder.descEn}</>
          ) : null}
        </div>
      </div>

      {/* Commands */}
      <div className="grid grid-cols-2 gap-1">
        <button onClick={brawl} title={t('genBrawlHint')}
          className={`pixel-btn px-1 py-1.5 text-[10px] font-bold cursor-pointer ${canBrawl ? 'bg-rose-600 text-white animate-pulse' : 'bg-rose-950 text-rose-300/70'}`}>
          🥊 {t('genBrawl')}
        </button>
        <button onClick={maxed.length ? sellPlus : fortify} title={maxed.length ? t('genSellPlusHint') : t('genFortifyHint')}
          className={`pixel-btn px-1 py-1.5 text-[10px] font-bold cursor-pointer ${fortifyHp > 0 ? 'bg-amber-500 text-slate-950' : 'bg-amber-950 text-amber-300/70'}`}>
          {maxed.length ? `🔷 ${t('genSellPlus')}` : `🏰 ${t('genFortify')}${fortifyHp > 0 ? ` +${fortifyHp.toLocaleString()}` : ''}`}
        </button>
      </div>
      {note && <div className={`text-[10px] ${note.good ? 'text-emerald-300' : 'text-amber-300'}`}>{note.text}</div>}
    </div>
  );
}
