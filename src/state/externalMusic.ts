import { create } from 'zustand';

/**
 * External music: a YouTube or Spotify link the player pastes in Settings,
 * played through the provider's official embed in a small in-game player.
 *
 * Only the provider + id parsed from the link is kept; the embed URL is always
 * rebuilt here, so nothing the player types ever reaches the page as markup.
 * The library of saved links lives in the game store (`musicLibrary`) but is
 * saved on its own (localStorage, `MUSIC_STORAGE_KEY`), apart from the realm
 * progress: game saves, exports, imports and resets never touch it. The
 * player's open / dock / minimized UI state lives here.
 */

export type MusicProvider = 'YOUTUBE' | 'SPOTIFY';
export type YouTubeKind = 'playlist' | 'video';
export type SpotifyKind = 'playlist' | 'album' | 'track' | 'artist' | 'show' | 'episode';

export type MusicSource =
  | { provider: 'YOUTUBE'; kind: YouTubeKind; id: string }
  | { provider: 'SPOTIFY'; kind: SpotifyKind; id: string };

const YT_HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com',
  'youtu.be', 'youtube-nocookie.com', 'www.youtube-nocookie.com',
]);
const YT_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YT_LIST_ID = /^[A-Za-z0-9_-]{2,64}$/;
const SPOTIFY_KINDS: readonly SpotifyKind[] = ['playlist', 'album', 'track', 'artist', 'show', 'episode'];
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const MAX_LINK_LENGTH = 500;
const MAX_EMBED_LENGTH = 2000;

const isSpotifyKind = (k: string): k is SpotifyKind => (SPOTIFY_KINDS as readonly string[]).includes(k);

/**
 * Reads a YouTube / Spotify link, a `spotify:kind:id` URI, or a pasted embed
 * snippet (only its iframe `src` is looked at). Anything else returns null.
 */
export function parseMusicLink(input: string): MusicSource | null {
  let raw = input.trim();
  if (raw.length > MAX_EMBED_LENGTH) return null;
  // "Copy embed code" snippets: take the src and parse it like a link
  if (/^<iframe\b/i.test(raw)) {
    const src = raw.match(/\bsrc\s*=\s*["']([^"'<>\s]+)["']/i);
    if (!src) return null;
    raw = src[1].replace(/&amp;/g, '&');
  }
  if (!raw || raw.length > MAX_LINK_LENGTH) return null;

  const uri = raw.match(/^spotify:([a-z]+):([A-Za-z0-9]+)$/);
  if (uri) return isSpotifyKind(uri[1]) && SPOTIFY_ID.test(uri[2]) ? { provider: 'SPOTIFY', kind: uri[1], id: uri[2] } : null;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean);

  if (YT_HOSTS.has(host)) {
    let video: string | null = null;
    if (host === 'youtu.be') video = segments[0] ?? null;
    else if (segments[0] === 'watch') video = url.searchParams.get('v');
    else if (['embed', 'shorts', 'live', 'v'].includes(segments[0] ?? '')) video = segments[1] ?? null;
    const hasVideo = !!video && YT_VIDEO_ID.test(video);
    // A playlist wins over the video it was opened on (watch?v=…&list=…),
    // except auto-generated Mixes (RD…): YouTube refuses to embed those.
    const list = url.searchParams.get('list');
    if (list && YT_LIST_ID.test(list) && !(hasVideo && list.startsWith('RD'))) {
      return { provider: 'YOUTUBE', kind: 'playlist', id: list };
    }
    return hasVideo ? { provider: 'YOUTUBE', kind: 'video', id: video! } : null;
  }

  if (host === 'open.spotify.com' || host === 'play.spotify.com') {
    // Skip a locale prefix (/intl-fr/…) and an /embed/ prefix
    const parts = segments.filter((s) => !/^intl-[a-z-]+$/i.test(s) && s !== 'embed');
    const [kind, id] = parts;
    return kind && id && isSpotifyKind(kind) && SPOTIFY_ID.test(id) ? { provider: 'SPOTIFY', kind, id } : null;
  }

  return null;
}

/**
 * Official embed URL for a parsed source (privacy-enhanced domain for YouTube).
 * YouTube gets `enablejsapi` so the player can be driven by postMessage
 * (play / pause / loop); looping and auto-play are handled there, not in the
 * URL, so toggling them never reloads the embed.
 */
export function musicEmbedUrl(src: MusicSource): string {
  if (src.provider === 'YOUTUBE') {
    const origin = typeof window !== 'undefined' ? `&origin=${encodeURIComponent(window.location.origin)}` : '';
    return src.kind === 'playlist'
      ? `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(src.id)}&rel=0&enablejsapi=1${origin}`
      : `https://www.youtube-nocookie.com/embed/${encodeURIComponent(src.id)}?rel=0&enablejsapi=1${origin}`;
  }
  return `https://open.spotify.com/embed/${src.kind}/${encodeURIComponent(src.id)}?theme=0`;
}

/** Canonical link for a source, used for storage and shown back in Settings. */
export function musicLink(src: MusicSource): string {
  if (src.provider === 'YOUTUBE') {
    return src.kind === 'playlist'
      ? `https://www.youtube.com/playlist?list=${src.id}`
      : `https://www.youtube.com/watch?v=${src.id}`;
  }
  return `https://open.spotify.com/${src.kind}/${src.id}`;
}

/** One saved link in the library; `link` is always the canonical link rebuilt by `musicLink`. */
export interface MusicEntry {
  link: string;
  name: string;
}

export const MAX_MUSIC_ENTRIES = 100;
export const MAX_MUSIC_NAME = 40;

/**
 * Cleans a library read from a save or IndexedDB: every link is re-parsed
 * (never trusted), names trimmed, duplicates and junk dropped.
 */
export const normalizeMusicLibrary = (raw: unknown): MusicEntry[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: MusicEntry[] = [];
  for (const item of raw) {
    const rawLink = typeof item === 'string' ? item : (item as { link?: unknown })?.link;
    const src = typeof rawLink === 'string' ? parseMusicLink(rawLink) : null;
    if (!src) continue;
    const link = musicLink(src);
    if (seen.has(link)) continue;
    seen.add(link);
    const rawName = typeof item === 'object' && item ? (item as { name?: unknown }).name : '';
    out.push({ link, name: typeof rawName === 'string' ? rawName.trim().slice(0, MAX_MUSIC_NAME) : '' });
    if (out.length >= MAX_MUSIC_ENTRIES) break;
  }
  return out;
};

export const clampMusicIndex = (index: unknown, library: readonly MusicEntry[]): number => {
  const n = Math.floor(Number(index));
  return Number.isFinite(n) && n >= 0 && n < library.length ? n : 0;
};

/** Excel / Sheets: one row per entry under a header, with a UTF-8 BOM so Excel reads accents. */
export const musicLibraryToCsv = (library: readonly MusicEntry[]): string => {
  const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return '﻿name,link\r\n' + library.map((e) => `${cell(e.name)},${cell(e.link)}`).join('\r\n') + '\r\n';
};

/** Docs / Notepad: "name - link" per line (or just the link). */
export const musicLibraryToText = (library: readonly MusicEntry[]): string =>
  library.map((e) => (e.name ? `${e.name} - ${e.link}` : e.link)).join('\r\n') + '\r\n';

const LINK_IN_TEXT = /(https?:\/\/[^\s",;<>]+|spotify:[a-z]+:[A-Za-z0-9]+)/i;

/**
 * Reads a playlist file written by hand, by Excel / Sheets (CSV / TSV) or by a
 * docs app saved as text: every line holding a YouTube / Spotify link becomes
 * an entry, the rest of the line (minus separators and quotes) its name.
 * The result still goes through `normalizeMusicLibrary`.
 */
/** Splits one CSV / TSV row, honouring "quoted, cells" and "" escapes. */
const splitRow = (line: string, sep: string): string[] => {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && !cell.trim()) quoted = true;
    else if (ch === sep) {
      cells.push(cell);
      cell = '';
    } else cell += ch;
  }
  cells.push(cell);
  return cells.map((c) => c.trim());
};

/** "1. Chill - <link>" → "Chill": drops list markers and dash separators around the link. */
const cleanName = (text: string) =>
  text
    .split(/\s[-–]\s/)
    .map((part) => part.replace(/^\s*(?:[-–•*]|\d+[.)])?\s*|[\s\-–]+$/g, ''))
    .filter(Boolean)
    .join(' ');

/**
 * Reads a playlist file from Excel / Sheets (CSV / TSV) or a docs app saved
 * as text: every line holding a YouTube / Spotify link becomes an entry, the
 * other cells (or the rest of the line) its name. The result still goes
 * through `normalizeMusicLibrary`.
 */
export const parseMusicLibraryFile = (text: string): MusicEntry[] => {
  const entries: { link: string; name: string }[] = [];
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!LINK_IN_TEXT.test(line)) continue;
    const sep = line.includes('\t') ? '\t' : line.includes(',') ? ',' : null;
    const cells = sep ? splitRow(line, sep) : [line];
    const linkCell = cells.find((c) => LINK_IN_TEXT.test(c)) ?? '';
    const link = linkCell.match(LINK_IN_TEXT)?.[0] ?? '';
    const rest = [linkCell.replace(link, ' '), ...cells.filter((c) => c !== linkCell)].map(cleanName).filter(Boolean).join(' ');
    entries.push({ link, name: /^(name|link)$/i.test(rest) ? '' : rest });
  }
  return normalizeMusicLibrary(entries);
};

/** The music library, current entry and play options, saved apart from the game progress. */
export const MUSIC_STORAGE_KEY = 'isochronicle_music_library';

export interface MusicPrefs {
  musicLibrary: MusicEntry[];
  musicIndex: number;
  musicAutoPlay: boolean;
  musicLoop: boolean;
}

export const hasStoredMusicPrefs = (): boolean => {
  try {
    return typeof window !== 'undefined' && localStorage.getItem(MUSIC_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
};

export const loadMusicPrefs = (): MusicPrefs => {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(MUSIC_STORAGE_KEY) : null;
    if (raw) {
      const data = JSON.parse(raw) as Partial<MusicPrefs>;
      const musicLibrary = normalizeMusicLibrary(data.musicLibrary);
      return {
        musicLibrary,
        musicIndex: clampMusicIndex(data.musicIndex, musicLibrary),
        musicAutoPlay: typeof data.musicAutoPlay === 'boolean' ? data.musicAutoPlay : true,
        musicLoop: typeof data.musicLoop === 'boolean' ? data.musicLoop : false,
      };
    }
  } catch { /* corrupt or storage off: fall back below */ }
  return { musicLibrary: loadLegacyMusicLibrary(), musicIndex: 0, musicAutoPlay: true, musicLoop: false };
};

export const saveMusicPrefs = (prefs: MusicPrefs): void => {
  try {
    localStorage.setItem(MUSIC_STORAGE_KEY, JSON.stringify(prefs));
  } catch { /* storage off */ }
};

/** The single link older builds kept in localStorage, offered as the first library entry. */
const LEGACY_STORAGE_KEY = 'isochronicle_external_music';

export const loadLegacyMusicLibrary = (): MusicEntry[] => {
  try {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(LEGACY_STORAGE_KEY) : null;
    return saved ? normalizeMusicLibrary([saved]) : [];
  } catch {
    return [];
  }
};

/** Where the player sits: floating over the canvas, or docked in the side menu. */
export type MusicDock = 'FLOAT' | 'SIDEBAR';

const DOCK_KEY = 'isochronicle_external_music_dock';

const loadDock = (): MusicDock => {
  try {
    return typeof window !== 'undefined' && localStorage.getItem(DOCK_KEY) === 'SIDEBAR' ? 'SIDEBAR' : 'FLOAT';
  } catch {
    return 'FLOAT';
  }
};

interface ExternalMusicState {
  dock: MusicDock;
  /** Collapsed to its title bar; the embed stays loaded so playback continues. */
  isMinimized: boolean;
  setDock: (dock: MusicDock) => void;
  setMinimized: (minimized: boolean) => void;
  /** Whether the in-game player is shown (and so playing / loaded). Not persisted. */
  isPlayerOpen: boolean;
  setPlayerOpen: (open: boolean) => void;
  /** The music manager modal (add / play / remove saved links). */
  isManagerOpen: boolean;
  setManagerOpen: (open: boolean) => void;
  /** Bumped by an explicit "play this" (list / manager / play button) so the player starts the entry it loads. */
  playRequest: number;
  requestPlay: () => void;
}

export const useExternalMusic = create<ExternalMusicState>((set) => ({
  isPlayerOpen: false,
  dock: loadDock(),
  isMinimized: false,
  setDock: (dock) => {
    try { localStorage.setItem(DOCK_KEY, dock); } catch { /* storage off */ }
    set({ dock });
  },
  setMinimized: (isMinimized) => set({ isMinimized }),
  setPlayerOpen: (isPlayerOpen) => set({ isPlayerOpen }),
  isManagerOpen: false,
  setManagerOpen: (isManagerOpen) => set({ isManagerOpen }),
  playRequest: 0,
  requestPlay: () => set((s) => ({ playRequest: s.playRequest + 1 })),
}));
