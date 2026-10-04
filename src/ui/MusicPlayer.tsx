import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Download, ExternalLink, FileSpreadsheet, FileText, ListEnd, ListMusic, ListPlus, Minus, Music2, PanelRight, Pause, Play, Repeat, SkipBack, SkipForward, Trash2, Upload, WifiOff, X } from 'lucide-react';
import { soundFx } from '../game/audio/soundFx';
import { useTranslation } from '../i18n/translations';
import type { TranslationKey } from '../i18n/translations';
import {
  MAX_MUSIC_ENTRIES,
  MAX_MUSIC_NAME,
  musicEmbedUrl,
  musicLibraryToCsv,
  musicLibraryToText,
  parseMusicLibraryFile,
  parseMusicLink,
  useExternalMusic,
} from '../state/externalMusic';
import type { MusicDock, MusicEntry, MusicSource } from '../state/externalMusic';
import { useGameStore } from '../state/useGameStore';
import { useEmbedControl } from './musicEmbedControl';
import { create } from 'zustand';

/**
 * Where the player may sit: each dock renders a `MusicPlayer` slot (an empty
 * placeholder) and registers it here. The real player is ONE element
 * (`MusicPlayerHost`) that never unmounts while the game runs; it is laid
 * over whichever slot matches the dock, so moving between the game screen and
 * the side menu never reloads the embed or stops the song.
 */
const useMusicSlots = create<{
  slots: Partial<Record<MusicDock, HTMLElement>>;
  height: number;
  setSlot: (dock: MusicDock, el: HTMLElement | null) => void;
  setHeight: (h: number) => void;
}>((set) => ({
  slots: {},
  height: 0,
  setSlot: (dock, el) => set((s) => {
    if ((s.slots[dock] ?? null) === el) return s;
    const slots = { ...s.slots };
    if (el) slots[dock] = el; else delete slots[dock];
    return { slots };
  }),
  setHeight: (height) => set((s) => (s.height === height ? s : { height })),
}));

/** Placeholder for the player in one dock; reserves the player's height while it sits here. */
export const MusicPlayer: React.FC<{ placement: MusicDock; hidden?: boolean }> = ({ placement, hidden = false }) => {
  const setSlot = useMusicSlots((s) => s.setSlot);
  const height = useMusicSlots((s) => s.height);
  const dock = useExternalMusic((s) => s.dock);
  const isOpen = useExternalMusic((s) => s.isPlayerOpen);
  const ref = useRef<HTMLDivElement>(null);
  const here = dock === placement && isOpen && !hidden;
  useEffect(() => {
    setSlot(placement, hidden ? null : ref.current);
    return () => setSlot(placement, null);
  }, [placement, hidden, setSlot]);
  const box = placement === 'FLOAT'
    ? 'pointer-events-none absolute left-3 top-3 w-[min(320px,calc(100%-1.5rem))]'
    : 'w-full';
  return <div ref={ref} className={box} style={{ height: here ? height : 0 }} aria-hidden />;
};

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

type Translate = ReturnType<typeof useTranslation>['t'];

const providerName = (src: MusicSource) => (src.provider === 'YOUTUBE' ? 'YouTube' : 'Spotify');

/** The entry's own name, else "YouTube · Playlist"-style. */
const entryLabel = (entry: MusicEntry, src: MusicSource | null, t: Translate) =>
  entry.name || (src ? `${providerName(src)} · ${t(`musicKind_${src.kind}` as TranslationKey)}` : entry.link);

/** The saved library with each link parsed, plus the entry the player is on. */
const useMusicLibrary = () => {
  const library = useGameStore((s) => s.musicLibrary);
  const index = useGameStore((s) => s.musicIndex);
  const items = useMemo(() => library.map((entry) => ({ entry, src: parseMusicLink(entry.link) })), [library]);
  const current = items[index] ?? items[0] ?? null;
  return { items, index: current ? items.indexOf(current) : -1, current };
};

const ProviderDot: React.FC<{ src: MusicSource | null }> = ({ src }) => (
  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${src?.provider === 'SPOTIFY' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
);

/**
 * Player for the music library saved in Settings. It lives in one of two
 * places (`dock`): floating top-left over the canvas, or docked in the side
 * menu; each mounts a `MusicPlayer` with its placement and only the matching
 * one renders. Previous / next and the list switch between saved links.
 * Minimizing keeps the embed loaded (moved off-screen) so playback continues;
 * closing unloads it, which stops playback. While it is open the procedural
 * BGM is silenced.
 */
export const MusicPlayerHost: React.FC = () => {
  const { t } = useTranslation();
  const { items, index, current } = useMusicLibrary();
  const selectMusic = useGameStore((s) => s.selectMusic);
  const isOpen = useExternalMusic((s) => s.isPlayerOpen);
  const setPlayerOpen = useExternalMusic((s) => s.setPlayerOpen);
  const dock = useExternalMusic((s) => s.dock);
  const setDock = useExternalMusic((s) => s.setDock);
  const isMinimized = useExternalMusic((s) => s.isMinimized);
  const setMinimized = useExternalMusic((s) => s.setMinimized);
  const setManagerOpen = useExternalMusic((s) => s.setManagerOpen);
  const [showList, setShowList] = useState(false);
  const autoPlay = useGameStore((s) => s.musicAutoPlay);
  const loop = useGameStore((s) => s.musicLoop);
  const setAutoPlay = useGameStore((s) => s.setMusicAutoPlay);
  const setLoop = useGameStore((s) => s.setMusicLoop);
  const playRequest = useExternalMusic((s) => s.playRequest);
  const requestPlay = useExternalMusic((s) => s.requestPlay);
  const online = useOnline();
  const source = current?.src ?? null;
  const placement = dock;
  const slot = useMusicSlots((s) => s.slots[dock]);
  const setHeight = useMusicSlots((s) => s.setHeight);
  // No visible slot (side menu collapsed): play on from off-screen
  const hidden = !slot;
  const active = true;
  const panelRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);

  // Follow the slot (it moves with layout, scrolling and resizes) and report the panel's height back to it
  useEffect(() => {
    if (!slot) return;
    let raf = 0;
    const follow = () => {
      const r = slot.getBoundingClientRect();
      setRect((old) => (old && old.left === r.left && old.top === r.top && old.width === r.width ? old : { left: r.left, top: r.top, width: r.width }));
      if (panelRef.current) setHeight(panelRef.current.offsetHeight);
      raf = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(raf);
  }, [slot, setHeight]);
  const playing = active && isOpen && !!source && online;
  const sourceKey = source ? `${source.provider}-${source.kind}-${source.id}` : '';

  // Auto-play moves on to the next saved entry (wrapping when looping); without it, loop replays this one
  const handleEnded = () => {
    const count = items.length;
    if (autoPlay && count > 1 && (index < count - 1 || loop)) {
      selectMusic(index + 1);
      requestPlay();
    } else if (loop) {
      control.restart();
    }
  };
  const control = useEmbedControl(playing ? source : null, handleEnded);

  useEffect(() => {
    if (!active) return;
    soundFx.setExternalMusicActive(playing);
    return () => soundFx.setExternalMusicActive(false);
  }, [active, playing]);

  // Auto-play whenever an entry loads (player opened, entry switched)
  useEffect(() => {
    if (playing && autoPlay) control.play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, sourceKey]);

  // Explicit "play this" from the list, prev / next or the music manager
  const seenRequest = useRef(playRequest);
  useEffect(() => {
    if (playRequest === seenRequest.current) return;
    seenRequest.current = playRequest;
    if (active) control.play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playRequest]);

  if (!active || !isOpen || !current || !source) return null;

  const isYouTube = source.provider === 'YOUTUBE';
  const kindLabel = t(`musicKind_${source.kind}` as TranslationKey);
  const isFloat = placement === 'FLOAT';
  const hasMany = items.length > 1;
  // Off-screen instead of unmounted: the embed keeps its full size and keeps playing
  const embedOffscreen = isMinimized || hidden;
  const iconButton = 'cursor-pointer rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30';

  const frame = hidden || !rect
    ? 'pointer-events-none fixed -left-[10000px] top-0 w-[320px]'
    : `pointer-events-auto fixed z-30 ${isFloat ? 'shadow-2xl' : ''}`;
  const frameStyle = hidden || !rect ? undefined : { left: rect.left, top: rect.top, width: rect.width };

  const pick = (i: number) => {
    soundFx.playClick();
    selectMusic(i);
    requestPlay();
  };

  const toggleButton = (on: boolean) =>
    `cursor-pointer rounded-md p-1 ${on ? 'bg-indigo-500/25 text-indigo-200' : 'text-slate-500 hover:bg-slate-800 hover:text-white'}`;

  return (
    <div ref={panelRef} style={frameStyle} className={`${frame} overflow-hidden rounded-xl border border-indigo-500/40 bg-slate-950/95`} aria-hidden={hidden || undefined}>
      <div className={`flex items-center justify-between gap-2 px-3 py-1.5 ${isMinimized ? '' : 'border-b border-slate-800'}`}>
        <button
          type="button"
          onClick={() => {
            soundFx.playClick();
            setMinimized(!isMinimized);
          }}
          className="flex min-w-0 cursor-pointer items-center gap-2 text-left"
          title={isMinimized ? t('musicPlayerExpand') : t('musicPlayerMinimize')}
        >
          <Music2 className={`h-3.5 w-3.5 shrink-0 ${isYouTube ? 'text-rose-400' : 'text-emerald-400'} ${isMinimized && online ? 'animate-pulse' : ''}`} />
          <span className="min-w-0">
            <span className="block truncate text-[11px] font-bold text-slate-100">{entryLabel(current.entry, source, t)}</span>
            <span className="block truncate text-[9px] text-slate-500">
              {providerName(source)} · {kindLabel}{hasMany ? ` · ${index + 1}/${items.length}` : ''}
            </span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          {online && (
            <button
              type="button"
              onClick={() => {
                soundFx.playClick();
                control.toggle();
              }}
              className={`${iconButton} ${control.isPlaying ? 'text-emerald-300' : 'text-slate-200'}`}
              title={control.isPlaying ? t('musicPlayerPause') : t('musicPlayerPlay')}
              aria-label={control.isPlaying ? t('musicPlayerPause') : t('musicPlayerPlay')}
            >
              {control.isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </button>
          )}
          {isMinimized && hasMany && (
            <button type="button" onClick={() => pick(index + 1)} className={iconButton} title={t('musicPlayerNext')} aria-label={t('musicPlayerNext')}>
              <SkipForward className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              soundFx.playClick();
              setMinimized(!isMinimized);
            }}
            className={iconButton}
            title={isMinimized ? t('musicPlayerExpand') : t('musicPlayerMinimize')}
            aria-label={isMinimized ? t('musicPlayerExpand') : t('musicPlayerMinimize')}
          >
            {isMinimized ? <ChevronDown className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => {
              soundFx.playClick();
              setDock(isFloat ? 'SIDEBAR' : 'FLOAT');
            }}
            className={iconButton}
            title={isFloat ? t('musicPlayerDockSidebar') : t('musicPlayerDetach')}
            aria-label={isFloat ? t('musicPlayerDockSidebar') : t('musicPlayerDetach')}
          >
            {isFloat ? <PanelRight className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => {
              soundFx.playClick();
              setPlayerOpen(false);
            }}
            className={iconButton}
            title={t('musicPlayerClose')}
            aria-label={t('musicPlayerClose')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {online ? (
        <iframe
          ref={control.ref}
          onLoad={control.onLoad}
          key={sourceKey}
          src={musicEmbedUrl(source)}
          title={`${providerName(source)} ${kindLabel}`}
          // YouTube needs at least a 200×200 visible player; Spotify's compact embed is 152px tall
          className={`block border-0 ${isYouTube ? 'h-[200px]' : 'h-[152px]'} ${
            embedOffscreen ? 'pointer-events-none fixed -left-[10000px] top-0 w-[320px]' : 'w-full'
          }`}
          aria-hidden={embedOffscreen || undefined}
          tabIndex={embedOffscreen ? -1 : undefined}
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        !isMinimized && (
          <div className="flex items-center gap-2 px-3 py-4 text-[11px] text-slate-400">
            <WifiOff className="h-4 w-4 shrink-0 text-amber-400" />
            <span>{t('musicPlayerOffline')}</span>
          </div>
        )
      )}

      {!isMinimized && (
        <>
          <div className="flex items-center justify-between gap-1 border-t border-slate-800 px-2 py-1">
            <button type="button" disabled={!hasMany} onClick={() => pick(index - 1)} className={iconButton} title={t('musicPlayerPrev')} aria-label={t('musicPlayerPrev')}>
              <SkipBack className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                soundFx.playClick();
                setAutoPlay(!autoPlay);
              }}
              className={toggleButton(autoPlay)}
              title={t('musicPlayerAutoPlay')}
              aria-label={t('musicPlayerAutoPlay')}
              aria-pressed={autoPlay}
            >
              <ListEnd className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                soundFx.playClick();
                setShowList(!showList);
              }}
              className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                showList ? 'bg-indigo-500/20 text-indigo-200' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
              aria-expanded={showList}
            >
              <ListMusic className="h-3.5 w-3.5" />
              {t('musicPlayerShowList')} ({items.length})
            </button>
            <button
              type="button"
              onClick={() => {
                soundFx.playClick();
                setManagerOpen(true);
              }}
              className={iconButton}
              title={t('musicManagerTitle')}
              aria-label={t('musicManagerTitle')}
            >
              <ListPlus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                soundFx.playClick();
                setLoop(!loop);
              }}
              className={toggleButton(loop)}
              title={t('musicPlayerLoop')}
              aria-label={t('musicPlayerLoop')}
              aria-pressed={loop}
            >
              <Repeat className="h-3.5 w-3.5" />
            </button>
            <button type="button" disabled={!hasMany} onClick={() => pick(index + 1)} className={iconButton} title={t('musicPlayerNext')} aria-label={t('musicPlayerNext')}>
              <SkipForward className="h-3.5 w-3.5" />
            </button>
          </div>
          {showList && (
            <ul className="custom-scrollbar max-h-40 overflow-y-auto border-t border-slate-800 py-1">
              {items.map(({ entry, src }, i) => (
                <li key={entry.link}>
                  <button
                    type="button"
                    onClick={() => pick(i)}
                    className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1 text-left text-[10px] ${
                      i === index ? 'bg-indigo-500/15 text-indigo-100' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                    aria-current={i === index || undefined}
                  >
                    <ProviderDot src={src} />
                    <span className="min-w-0 flex-1 truncate">{entryLabel(entry, src, t)}</span>
                    {i === index && <Play className="h-3 w-3 shrink-0 text-indigo-300" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
};

/** Music manager modal: add / play / remove saved YouTube / Spotify links and open the player. */
export const MusicManagerModal: React.FC = () => {
  const { t } = useTranslation();
  const { items, index } = useMusicLibrary();
  const addMusicLink = useGameStore((s) => s.addMusicLink);
  const removeMusicLink = useGameStore((s) => s.removeMusicLink);
  const selectMusic = useGameStore((s) => s.selectMusic);
  const isOpen = useExternalMusic((s) => s.isPlayerOpen);
  const setPlayerOpen = useExternalMusic((s) => s.setPlayerOpen);
  const [draft, setDraft] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<'invalid' | 'full' | null>(null);
  const importMusicLibrary = useGameStore((s) => s.importMusicLibrary);
  const requestPlay = useExternalMusic((s) => s.requestPlay);
  const fileInput = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const isManagerOpen = useExternalMusic((s) => s.isManagerOpen);
  const setManagerOpen = useExternalMusic((s) => s.setManagerOpen);
  const isFull = items.length >= MAX_MUSIC_ENTRIES;

  const save = () => {
    if (!parseMusicLink(draft)) {
      setError('invalid');
      return;
    }
    if (!addMusicLink(draft, name)) {
      setError('full');
      return;
    }
    soundFx.playClick();
    setError(null);
    setNotice(null);
    setDraft('');
    setName('');
    // The first link opens the player; later ones are only added, so what plays keeps playing
    if (!items.length) setPlayerOpen(true);
  };

  const download = (kind: 'csv' | 'txt') => {
    soundFx.playClick();
    const library = items.map((item) => item.entry);
    const blob = new Blob([kind === 'csv' ? musicLibraryToCsv(library) : musicLibraryToText(library)], {
      type: kind === 'csv' ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `isochronicle-music.${kind}`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > 512 * 1024) {
      setNotice(t('musicPlayerImportNone'));
      return;
    }
    const entries = parseMusicLibraryFile(await file.text());
    const wasEmpty = !items.length;
    const added = importMusicLibrary(entries);
    setNotice(added > 0 ? t('musicPlayerImported').replace('{n}', String(added)) : t('musicPlayerImportNone'));
    if (added > 0 && wasEmpty) setPlayerOpen(true);
  };

  const button = 'cursor-pointer rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition-all';
  const input =
    'min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-[11px] text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none';

  if (!isManagerOpen) return null;

  const close = () => {
    soundFx.playClick();
    setManagerOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="music-manager-title"
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-indigo-500/30 bg-slate-950/95 shadow-2xl shadow-indigo-950/50"
      >
        <div className="flex items-center justify-between border-b border-slate-800 bg-gradient-to-r from-slate-900 via-indigo-950/50 to-slate-900 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-indigo-500/40 bg-indigo-900/40 p-2 text-indigo-300">
              <ListMusic className="h-5 w-5" />
            </div>
            <h2 id="music-manager-title" className="text-sm font-bold text-slate-100">{t('musicManagerTitle')}</h2>
          </div>
          <button type="button" onClick={close} className="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label={t('musicPlayerClose')}>
            <X className="h-5 w-5" />
          </button>
        </div>
    <div className="custom-scrollbar space-y-2.5 overflow-y-auto p-5">
      <p className="text-[10px] leading-relaxed text-slate-400">{t('musicPlayerDesc')}</p>

      <form
        className="space-y-2"
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
            setError(null);
          }}
          placeholder={t('musicPlayerPlaceholder')}
          aria-label={t('musicPlayerPlaceholder')}
          className={`${input} w-full`}
        />
        <div className="flex gap-2">
          <input
            type="text"
            autoComplete="off"
            value={name}
            maxLength={MAX_MUSIC_NAME}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('musicPlayerNamePlaceholder')}
            aria-label={t('musicPlayerNamePlaceholder')}
            className={`${input} flex-1`}
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className={`${button} border-indigo-500/50 bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {t('musicPlayerSave')}
          </button>
        </div>
      </form>
      {error && <p className="text-[10px] text-rose-400">{error === 'full' ? t('musicPlayerFull') : t('musicPlayerInvalid')}</p>}
      {isFull && !error && <p className="text-[10px] text-amber-400">{t('musicPlayerFull')}</p>}

      <div className="space-y-1.5 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <div className="text-[9px] uppercase tracking-wider text-slate-500">{t('musicPlayerFileTitle')}</div>
        <p className="text-[10px] leading-relaxed text-slate-400">{t('musicPlayerFileDesc')}</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={!items.length}
            onClick={() => download('csv')}
            className={`${button} flex items-center gap-1.5 border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40`}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <Download className="h-3 w-3" /> Excel (.csv)
          </button>
          <button
            type="button"
            disabled={!items.length}
            onClick={() => download('txt')}
            className={`${button} flex items-center gap-1.5 border-sky-500/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40`}
          >
            <FileText className="h-3.5 w-3.5" />
            <Download className="h-3 w-3" /> Docs (.txt)
          </button>
          <button
            type="button"
            onClick={() => {
              soundFx.playClick();
              fileInput.current?.click();
            }}
            className={`${button} flex items-center gap-1.5 border-indigo-500/50 bg-indigo-500/15 text-indigo-200 hover:bg-indigo-500/25`}
          >
            <Upload className="h-3.5 w-3.5" /> {t('musicPlayerUpload')}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values"
            className="hidden"
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
        {notice && <p className="text-[10px] text-emerald-300">{notice}</p>}
      </div>

      {items.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-wider text-slate-500">
              {t('musicPlayerLibrary')} · {items.length}/{MAX_MUSIC_ENTRIES}
            </span>
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
          </div>
          <ul className="custom-scrollbar max-h-48 space-y-1 overflow-y-auto">
            {items.map(({ entry, src }, i) => (
              <li
                key={entry.link}
                className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${
                  i === index ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-slate-800 bg-slate-950/70'
                }`}
              >
                <ProviderDot src={src} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[10px] font-bold text-slate-200">
                    {entryLabel(entry, src, t)}
                    {i === index && <span className="ml-1.5 font-normal text-indigo-300">· {t('musicPlayerNowPlaying')}</span>}
                  </div>
                  <div className="truncate font-mono text-[9px] text-slate-500">{entry.link}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    soundFx.playClick();
                    selectMusic(i);
                    setPlayerOpen(true);
                    requestPlay();
                  }}
                  className="cursor-pointer rounded-md p-1 text-emerald-300 hover:bg-emerald-500/15"
                  title={t('musicPlayerPlay')}
                  aria-label={t('musicPlayerPlay')}
                >
                  <Play className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundFx.playClick();
                    removeMusicLink(i);
                    if (items.length === 1) setPlayerOpen(false);
                  }}
                  className="cursor-pointer rounded-md p-1 text-rose-300 hover:bg-rose-500/15"
                  title={t('musicPlayerRemove')}
                  aria-label={t('musicPlayerRemove')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[9px] leading-relaxed text-slate-500">{t('musicPlayerNote')}</p>
    </div>
      </div>
    </div>
  );
};
