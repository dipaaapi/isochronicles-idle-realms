import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../state/useGameStore';
import { useTranslation, unitName } from '../i18n/translations';
import { BEAST_PORTRAITS } from '../game/bestiaryPortraits';
import { UNIT_CLASSES } from '../types/game';
import { GENERAL_ORDERS, RAGE, orderInfo, sturdyFromBonus, type GeneralOrder } from '../state/generalOrders';
import { logMessage } from '../state/activityLog';
import { soundFx } from '../game/audio/soundFx';
import KIROV from '../data/kirov.json';
import LOCOMOTION from '../data/locomotion.json';

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
 * two at full rage, or spend + power on their establishments (Fortify).
 * Rules in src/data/generalOrders.json.
 */
export function GeneralsPanel() {
  const { t, language: lang } = useTranslation();
  const roster = useGameStore((s) => s.roster);
  const setGeneralOrder = useGameStore((s) => s.setGeneralOrder);
  const investBrawlPower = useGameStore((s) => s.investBrawlPower);
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

  // Shared order of the selection (null = mixed)
  const selOrders = new Set(sel.map((u) => u.order ?? 'AUTO'));
  const sharedOrder = selOrders.size === 1 ? [...selOrders][0] : null;
  const fortifyHp = sel.reduce((n, u) => n + sturdyFromBonus(u.brawlAttack ?? 0, u.brawlHp ?? 0), 0);
  const readyCount = sel.filter((u) => (gauges[u.id]?.rage ?? 0) >= RAGE.brawlCost).length;
  const canBrawl = sel.length === 2 && readyCount === 2;

  const pick = (ids: string[]) => { soundFx.playClick(); setPicked(ids); };
  const toggle = (id: string) => pick(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);

  const order = (o: GeneralOrder) => {
    if (!sel.length) return setNote({ text: t('genPickFirst') });
    soundFx.playClick();
    setGeneralOrder(sel.map((u) => u.id), o);
    const info = orderInfo(o);
    logMessage('generalOrder', { count: sel.length, order: `${info.icon} ${L(info)}` });
    setNote({ text: `${info.icon} ${L(info)} → ${sel.length}`, good: true });
  };

  const brawl = () => {
    if (sel.length !== 2) return setNote({ text: t('genBrawlPickTwo') });
    const result = askScene<string>('orderedBrawl', { a: sel[0].id, b: sel[1].id });
    const reasons: Record<string, string> = { busy: t('genBrawlBusy'), wave: t('genBrawlWave'), missing: t('genBrawlMissing'), rage: t('genBrawlRage') };
    if (result === 'ok') { setPicked([]); setNote(null); } else setNote({ text: reasons[result ?? 'missing'] ?? t('genBrawlMissing') });
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
          const info = orderInfo(u.order ?? 'AUTO');
          const plus = u.brawlLevel ?? 0;
          const full = g.rage >= RAGE.brawlCost;
          return (
            <button key={u.id} onClick={() => toggle(u.id)}
              title={`${nameOf(u)}${plus ? ` +${plus}` : ''}\n❤️ ${g.hp}/${g.maxHp}  💢 ${g.rage}%\n${info.icon} ${L(info)}`}
              className="relative flex flex-col cursor-pointer bg-slate-950 p-px"
              style={{ outline: on ? '2px solid #fbbf24' : '2px solid #0b0f1a', outlineOffset: -2, boxShadow: on ? '0 0 0 2px #78350f' : undefined }}>
              <div className="relative aspect-square overflow-hidden" style={{ background: `${info.color}22` }}>
                <img src={BEAST_PORTRAITS[u.unitClass] ?? ''} alt="" draggable={false}
                  className={`w-full h-full object-cover ${g.hp <= 0 ? 'grayscale opacity-50' : ''} ${on ? '' : 'opacity-85'}`} />
                <span className="absolute top-0 left-0 px-px text-[9px] leading-none" style={{ background: info.color }}>{info.icon}</span>
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

      {/* Battle priority */}
      <div>
        <div className="mb-1 text-[9px] uppercase tracking-wider text-slate-500">{t('genOrdersTitle')}</div>
        <div className="grid grid-cols-6 gap-1">
          {GENERAL_ORDERS.priorities.map((p) => {
            const active = sharedOrder === p.id;
            const count = generals.filter((u) => (u.order ?? 'AUTO') === p.id).length;
            return (
              <button key={p.id} onClick={() => order(p.id as GeneralOrder)}
                onMouseEnter={() => setHoverOrder(p)} onMouseLeave={() => setHoverOrder(null)}
                title={lang === 'TL' ? p.descTl : p.descEn}
                className="pixel-btn relative flex flex-col items-center py-1 cursor-pointer"
                style={{ background: active ? p.color : '#1e293b', color: active ? '#0b0f1a' : '#e2e8f0' }}>
                <span className="text-sm leading-none">{p.icon}</span>
                <span className="mt-0.5 text-[8px] leading-none font-bold">{lang === 'TL' ? p.shortTl : p.shortEn}</span>
                {count > 0 && <span className="absolute -top-1 -right-1 px-0.5 text-[8px] leading-none font-bold bg-slate-950 text-slate-300 border border-slate-700">{count}</span>}
              </button>
            );
          })}
        </div>
        <div className="mt-1 text-[10px] leading-tight text-slate-400 min-h-[2.2em]">
          {shownOrder ? <><span style={{ color: shownOrder.color }}>{shownOrder.icon} {L(shownOrder)}:</span> {lang === 'TL' ? shownOrder.descTl : shownOrder.descEn}</> : null}
        </div>
      </div>

      {/* Commands */}
      <div className="grid grid-cols-2 gap-1">
        <button onClick={brawl} title={t('genBrawlHint')}
          className={`pixel-btn px-1 py-1.5 text-[10px] font-bold cursor-pointer ${canBrawl ? 'bg-rose-600 text-white animate-pulse' : 'bg-rose-950 text-rose-300/70'}`}>
          🥊 {t('genBrawl')} <span className="font-mono">{readyCount}/2💢</span>
        </button>
        <button onClick={fortify} title={t('genFortifyHint')}
          className={`pixel-btn px-1 py-1.5 text-[10px] font-bold cursor-pointer ${fortifyHp > 0 ? 'bg-amber-500 text-slate-950' : 'bg-amber-950 text-amber-300/70'}`}>
          🏰 {t('genFortify')}{fortifyHp > 0 ? ` +${fortifyHp.toLocaleString()}` : ''}
        </button>
      </div>
      {note && <div className={`text-[10px] ${note.good ? 'text-emerald-300' : 'text-amber-300'}`}>{note.text}</div>}
    </div>
  );
}
