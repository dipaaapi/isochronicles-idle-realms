import React, { useEffect } from 'react';
import { Crosshair } from 'lucide-react';
import { useFocusGeneral, type GeneralSkillSlot } from '../state/focusGeneral';
import { useTranslation } from '../i18n/translations';
import { UNIT_CLASSES, type UnitClass } from '../types/game';
import { soundFx } from '../game/audio/soundFx';

/** Keyboard shortcut per skill slot while the camera follows a General. */
const SLOT_KEYS: Array<{ slot: GeneralSkillSlot; key: string; code: string }> = [
  { slot: 'skill1', key: 'F', code: 'KeyF' },
  { slot: 'skill2', key: 'G', code: 'KeyG' },
  { slot: 'ultimate', key: 'H', code: 'KeyH' },
];

/**
 * The followed General's three skills (← / → focus): click or press F / G / H
 * to cast one when it is ready; a bar shows each cooldown.
 */
export const GeneralSkillPanel: React.FC<{ isTL: boolean }> = ({ isTL }) => {
  const { t: tr } = useTranslation();
  const unitClass = useFocusGeneral((s) => s.unitClass);
  const cooldowns = useFocusGeneral((s) => s.cooldowns);
  const requestCast = useFocusGeneral((s) => s.requestCast);
  const cfg = unitClass ? UNIT_CLASSES[unitClass as UnitClass] : undefined;

  useEffect(() => {
    if (!cfg?.skills) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      const hit = SLOT_KEYS.find((k) => k.code === e.code);
      if (!hit) return;
      e.preventDefault();
      requestCast(hit.slot);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cfg, requestCast]);

  if (!cfg?.skills) return null;
  const skills = cfg.skills;

  return (
    <div className="w-full rounded-2xl border border-amber-500/50 bg-slate-950/70 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-1 text-[10px] uppercase text-amber-300"><Crosshair className="w-3 h-3" /> {tr('focusSkills')}</span>
        <span className="text-[11px] font-bold text-slate-200 truncate">{cfg.iconEmoji} {isTL ? cfg.name : cfg.nameEn}</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {SLOT_KEYS.map(({ slot, key }) => {
          const sk = skills[slot];
          const cd = cooldowns?.[slot];
          const ready = !cd || cd.left <= 0;
          const pct = cd && cd.total > 0 ? Math.max(0, Math.min(1, cd.left / cd.total)) : 0;
          return (
            <button
              type="button"
              key={slot}
              title={isTL ? sk.descTl : sk.desc}
              onClick={() => { soundFx.playClick(); requestCast(slot); }}
              className={`relative overflow-hidden rounded-xl border p-1.5 text-center transition ${
                ready ? 'border-amber-400/70 bg-red-950/60 hover:border-amber-200 cursor-pointer' : 'border-slate-700 bg-slate-900/70 cursor-not-allowed'
              }`}
            >
              {/* Cooldown sweeps down as the skill recharges */}
              {!ready && <div className="absolute inset-x-0 bottom-0 bg-slate-950/70" style={{ height: `${pct * 100}%` }} />}
              <div className="relative text-lg leading-none">{sk.icon}</div>
              <div className={`relative mt-0.5 text-[9px] font-bold leading-tight ${ready ? 'text-amber-100' : 'text-slate-500'}`}>{isTL ? sk.nameTl : sk.name}</div>
              <div className="relative mt-0.5 text-[9px] font-mono text-slate-400">{ready ? `[${key}]` : `${Math.ceil(cd!.left)}s`}</div>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[9px] text-slate-500">{tr('focusSkillsHint')}</p>
    </div>
  );
};
