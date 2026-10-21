import { useEffect, useState } from 'react';
import STATUS from '../data/battleStatus.json';
import { battleTargets } from '../game/battleTargets';
import { useGameStore } from '../state/useGameStore';
import { DIFFICULTIES, normalizeDifficulty } from '../state/difficulty';
import { useTranslation } from '../i18n/translations';

type Kind = keyof typeof STATUS.kinds;

/** Which battles are on right now (several may overlap). */
function currentBattles(): Kind[] {
  const s = useGameStore.getState();
  const on: Kind[] = [];
  if (s.invasion.isActive) on.push('WAVE');
  if (battleTargets.kirovInvasion?.()) on.push('KIROV');
  if ((battleTargets.wild.BROOD?.() ?? []).length) on.push('SAND_GOD');
  if ((battleTargets.wild.SEA?.() ?? []).length) on.push('OCEAN_GOD');
  if (battleTargets.brawl?.()) on.push('BRAWL');
  return on.length ? on : ['CALM'];
}

/**
 * Lower right of the game map: what activity is on (Wave Battle, Kirov Invasion
 * Battle, Sand God Battle, Ocean God Battle, Brawl Battle) and the difficulty.
 * The difficulty can be changed in Settings for a price.
 */
export function BattleStatusHud({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { language } = useTranslation();
  const difficulty = normalizeDifficulty(useGameStore((s) => s.difficulty));
  const [kinds, setKinds] = useState<Kind[]>(['CALM']);

  useEffect(() => {
    const read = () => setKinds((prev) => {
      const next = currentBattles();
      return prev.join() === next.join() ? prev : next;
    });
    read();
    const id = window.setInterval(read, 500);
    return () => window.clearInterval(id);
  }, []);

  const d = DIFFICULTIES[difficulty];
  const L = (k: { en: string; tl: string }) => (language === 'TL' ? k.tl : k.en);

  return (
    <div className="pointer-events-none absolute bottom-24 right-3 z-[45] flex flex-col items-end gap-1 select-none">
      {kinds.map((k) => {
        const info = STATUS.kinds[k];
        const live = k !== 'CALM';
        return (
          <div key={k} className={`pixel-frame flex items-center gap-1.5 px-2 py-1 text-[11px] font-bold ${live ? 'animate-pulse' : ''}`}
            style={{ background: `${info.color}26`, color: info.color, borderColor: info.color }}>
            <span>{info.icon}</span>
            <span className="text-slate-100">{L(info)}</span>
          </div>
        );
      })}
      <button
        type="button"
        onClick={onOpenSettings}
        title={language === 'TL' ? 'Palitan sa Settings (may bayad)' : 'Change in Settings (costs resources)'}
        className="pointer-events-auto pixel-btn bg-slate-900/90 px-2 py-1 text-[11px] font-bold text-slate-200 cursor-pointer"
      >
        {d.icon} {language === 'TL' ? d.labelTl : d.label}
      </button>
    </div>
  );
}
