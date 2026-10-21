import { useGameStore } from '../state/useGameStore';
import { useTranslation } from '../i18n/translations';
import { formatPlayTime } from '../state/legacy';
import { soundFx } from '../game/audio/soundFx';
import { HallOfLegacy } from './HallOfLegacy';

/**
 * Game Over: the castle fell. Permadeath, so the run is already in the Hall of
 * Legacy and its save is gone; the player can only start a new realm.
 */
export function GameOverScreen({ onNewRealm }: { onNewRealm: () => void }) {
  const run = useGameStore((s) => s.gameOverRun);
  const dismiss = useGameStore((s) => s.dismissGameOver);
  const { t } = useTranslation();
  if (!run) return null;

  const stats: Array<[string, string]> = [
    [t('legacyWaves'), String(run.wavesCleared)],
    [t('gameOverFellOn'), String(run.waveReached)],
    [t('legacyDays'), String(run.days)],
    [t('legacyTime'), formatPlayTime(run.playSeconds)],
  ];

  return (
    <div className="game-backdrop fixed inset-0 z-[300] flex items-center justify-center bg-black/85 p-4">
      <div className="game-modal pixel-frame relative w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-stone-950 p-5 space-y-4">
        <div className="text-center">
          <div className="text-4xl">💀🏰</div>
          <h1 className="mt-2 text-2xl font-black text-rose-400">{t('gameOverTitle')}</h1>
          <p className="mt-1 text-xs text-stone-300">{t('gameOverBody').replace('{lord}', run.lord)}</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {stats.map(([label, value]) => (
            <div key={label} className="pixel-frame bg-slate-900 p-2 text-center">
              <div className="text-[10px] text-slate-400">{label}</div>
              <div className="text-lg font-black text-amber-300 font-mono">{value}</div>
            </div>
          ))}
        </div>
        <div>
          <h2 className="mb-2 text-sm font-bold text-amber-200">🏛️ {t('legacyTitle')}</h2>
          <HallOfLegacy highlight={run.runId} limit={10} />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => { soundFx.playClick(); dismiss(); }}
            className="pixel-btn bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200 cursor-pointer"
          >
            {t('gameOverTitleScreen')}
          </button>
          <button
            type="button"
            onClick={() => { soundFx.playFanfare(); dismiss(); onNewRealm(); }}
            className="pixel-btn bg-rose-700 px-4 py-2 text-xs font-bold text-white cursor-pointer"
          >
            {t('gameOverNewRealm')}
          </button>
        </div>
      </div>
    </div>
  );
}
