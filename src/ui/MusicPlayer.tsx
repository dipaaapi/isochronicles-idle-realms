import React, { useEffect, useState } from 'react';
import { Music2, WifiOff, X } from 'lucide-react';
import { soundFx } from '../game/audio/soundFx';
import { useTranslation } from '../i18n/translations';
import type { TranslationKey } from '../i18n/translations';
import { musicEmbedUrl, musicLink, parseMusicLink, useExternalMusic } from '../state/externalMusic';

const useOnline = (): boolean => {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
};

/**
 * Small floating player (top-left of the canvas) for the YouTube / Spotify
 * link set in Settings. Closing it unloads the embed, which stops playback;
 * while it is open the procedural BGM is silenced.
 */
export const MusicPlayer: React.FC = () => {
  const { t } = useTranslation();
  const source = useExternalMusic((s) => s.source);
  const isOpen = useExternalMusic((s) => s.isPlayerOpen);
  const setPlayerOpen = useExternalMusic((s) => s.setPlayerOpen);
  const online = useOnline();
  const playing = isOpen && !!source && online;

  useEffect(() => {
    soundFx.setExternalMusicActive(playing);
    return () => soundFx.setExternalMusicActive(false);
  }, [playing]);

  if (!isOpen || !source) return null;

  const isYouTube = source.provider === 'YOUTUBE';
  const kindLabel = t(`musicKind_${source.kind}` as TranslationKey);

  return (
    <div className="pointer-events-auto absolute left-3 top-3 z-30 w-[min(320px,calc(100%-1.5rem))] overflow-hidden rounded-xl border border-indigo-500/40 bg-slate-950/95 shadow-2xl">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <Music2 className={`h-3.5 w-3.5 shrink-0 ${isYouTube ? 'text-rose-400' : 'text-emerald-400'}`} />
          <span className="truncate text-[11px] font-bold text-slate-100">{t('musicPlayerTitle')}</span>
          <span className="shrink-0 text-[10px] text-slate-500">
            {isYouTube ? 'YouTube' : 'Spotify'} · {kindLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            soundFx.playClick();
            setPlayerOpen(false);
          }}
          className="cursor-pointer rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          title={t('musicPlayerClose')}
          aria-label={t('musicPlayerClose')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {online ? (
        <iframe
          key={`${source.provider}-${source.kind}-${source.id}`}
          src={musicEmbedUrl(source)}
          title={`${isYouTube ? 'YouTube' : 'Spotify'} ${kindLabel}`}
          // YouTube needs at least a 200×200 visible player; Spotify's compact embed is 152px tall
          className={`block w-full border-0 ${isYouTube ? 'h-[200px]' : 'h-[152px]'}`}
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          loading="lazy"
        />
      ) : (
        <div className="flex items-center gap-2 px-3 py-4 text-[11px] text-slate-400">
          <WifiOff className="h-4 w-4 shrink-0 text-amber-400" />
          <span>{t('musicPlayerOffline')}</span>
        </div>
      )}
    </div>
  );
};

/** Settings block: paste / replace / remove the music link and open the player. */
export const MusicLinkSettings: React.FC = () => {
  const { t } = useTranslation();
  const source = useExternalMusic((s) => s.source);
  const isOpen = useExternalMusic((s) => s.isPlayerOpen);
  const setSource = useExternalMusic((s) => s.setSource);
  const setPlayerOpen = useExternalMusic((s) => s.setPlayerOpen);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(false);

  const save = () => {
    const parsed = parseMusicLink(draft);
    if (!parsed) {
      setError(true);
      return;
    }
    soundFx.playClick();
    setError(false);
    setDraft('');
    setSource(parsed);
  };

  const button = 'cursor-pointer rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition-all';

  return (
    <div className="space-y-2.5 rounded-xl border border-slate-800 bg-slate-900/70 p-3.5">
      <p className="text-[10px] leading-relaxed text-slate-400">{t('musicPlayerDesc')}</p>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={draft}
          maxLength={2000}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(false);
          }}
          placeholder={t('musicPlayerPlaceholder')}
          aria-label={t('musicPlayerPlaceholder')}
          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-[11px] text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className={`${button} border-indigo-500/50 bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-40`}
        >
          {t('musicPlayerSave')}
        </button>
      </form>
      {error && <p className="text-[10px] text-rose-400">{t('musicPlayerInvalid')}</p>}

      {source && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-2.5 py-2">
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-wider text-slate-500">
              {t('musicPlayerCurrent')} · {source.provider === 'YOUTUBE' ? 'YouTube' : 'Spotify'} · {t(`musicKind_${source.kind}` as TranslationKey)}
            </div>
            <div className="truncate font-mono text-[10px] text-slate-300">{musicLink(source)}</div>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              onClick={() => {
                soundFx.playClick();
                setPlayerOpen(!isOpen);
              }}
              className={`${button} border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25`}
            >
              {isOpen ? t('musicPlayerClose') : t('musicPlayerOpen')}
            </button>
            <button
              type="button"
              onClick={() => {
                soundFx.playClick();
                setSource(null);
              }}
              className={`${button} border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20`}
            >
              {t('musicPlayerRemove')}
            </button>
          </div>
        </div>
      )}

      <p className="text-[9px] leading-relaxed text-slate-500">{t('musicPlayerNote')}</p>
    </div>
  );
};
