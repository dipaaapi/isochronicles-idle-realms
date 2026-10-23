import { useEffect, useState } from 'react';
import { PLATFORM_CONFIGS } from '../data/platforms';
import { DIFFICULTIES } from '../state/difficulty';
import { formatPlayTime, loadLegacy, rankLegacy, type LegacyEntry } from '../state/legacy';
import { useTranslation } from '../i18n/translations';
import { ProfileAvatar } from './ProfileAvatar';

/**
 * Hall of Legacy: the leaderboard of fallen runs on this device (Atlas tab and
 * the Game Over screen). `highlight` marks the run that just ended.
 */
export function HallOfLegacy({ highlight, limit = 50 }: { highlight?: string; limit?: number }) {
  const { t, language } = useTranslation();
  const isTL = language === 'TL';
  const [list, setList] = useState<LegacyEntry[] | null>(null);

  useEffect(() => {
    let alive = true;
    // The fallen run is written a moment after the castle falls: read again shortly after
    const read = () => loadLegacy().then((l) => { if (alive) setList(rankLegacy(l)); });
    void read();
    const id = window.setTimeout(read, 800);
    return () => { alive = false; window.clearTimeout(id); };
  }, [highlight]);

  if (!list) return <div className="text-xs text-slate-500">…</div>;
  if (!list.length) return <div className="pixel-frame bg-slate-900 p-4 text-center text-xs text-slate-400">🕯️ {t('legacyEmpty')}</div>;

  return (
    <div className="pixel-frame bg-slate-950 overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-left text-slate-400 bg-slate-900">
            <th className="px-2 py-1.5">#</th>
            <th className="px-2 py-1.5">{t('legacyLord')}</th>
            <th className="px-2 py-1.5 text-right">{t('legacyWaves')}</th>
            <th className="px-2 py-1.5 text-right">{t('legacyDays')}</th>
            <th className="px-2 py-1.5 text-right" title={t('legacyDragonsTitle')}>🐉</th>
            <th className="px-2 py-1.5 text-right">{t('legacyTime')}</th>
            <th className="px-2 py-1.5">{t('legacyMode')}</th>
            <th className="px-2 py-1.5">{t('legacyDate')}</th>
          </tr>
        </thead>
        <tbody>
          {list.slice(0, limit).map((e, i) => {
            const me = e.runId === highlight;
            const biome = PLATFORM_CONFIGS[e.biome] ?? PLATFORM_CONFIGS[1];
            const diff = DIFFICULTIES[e.difficulty] ?? DIFFICULTIES.NORMAL;
            return (
              <tr key={e.id} className={me ? 'bg-amber-500/20 text-amber-100' : i % 2 ? 'bg-slate-900/50' : ''}>
                <td className="px-2 py-1 font-mono">{i === 0 ? '👑' : i + 1}</td>
                <td className="px-2 py-1" title={e.realmName}>
                  <div className="flex items-center gap-1.5">
                    <ProfileAvatar avatar={e.avatar} size={22} />
                    <span className="font-bold truncate max-w-[9rem]">{e.lord}</span>
                  </div>
                </td>
                <td className="px-2 py-1 text-right font-mono">{e.wavesCleared}</td>
                <td className="px-2 py-1 text-right font-mono">{e.days}</td>
                <td className="px-2 py-1 text-right font-mono">{e.dragonsSlain ?? 0}</td>
                <td className="px-2 py-1 text-right font-mono">{formatPlayTime(e.playSeconds)}</td>
                <td className="px-2 py-1 whitespace-nowrap">
                  {diff.icon} <span style={{ color: biome.accentColor }}>{isTL ? biome.name : biome.nameEn}</span>
                </td>
                <td className="px-2 py-1 text-slate-400 whitespace-nowrap">{new Date(e.endedAt).toLocaleDateString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
