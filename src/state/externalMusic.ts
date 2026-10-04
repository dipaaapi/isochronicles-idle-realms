import { create } from 'zustand';

/**
 * External music: a YouTube or Spotify link the player pastes in Settings,
 * played through the provider's official embed in a small in-game player.
 *
 * Only the provider + id parsed from the link is kept; the embed URL is always
 * rebuilt here, so nothing the player types ever reaches the page as markup.
 * Stored per device in localStorage (like the volume sliders), not in the save.
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
    // A playlist wins over the video it was opened on (watch?v=…&list=…)
    const list = url.searchParams.get('list');
    if (list && YT_LIST_ID.test(list)) return { provider: 'YOUTUBE', kind: 'playlist', id: list };
    let video: string | null = null;
    if (host === 'youtu.be') video = segments[0] ?? null;
    else if (segments[0] === 'watch') video = url.searchParams.get('v');
    else if (['embed', 'shorts', 'live', 'v'].includes(segments[0] ?? '')) video = segments[1] ?? null;
    return video && YT_VIDEO_ID.test(video) ? { provider: 'YOUTUBE', kind: 'video', id: video } : null;
  }

  if (host === 'open.spotify.com' || host === 'play.spotify.com') {
    // Skip a locale prefix (/intl-fr/…) and an /embed/ prefix
    const parts = segments.filter((s) => !/^intl-[a-z-]+$/i.test(s) && s !== 'embed');
    const [kind, id] = parts;
    return kind && id && isSpotifyKind(kind) && SPOTIFY_ID.test(id) ? { provider: 'SPOTIFY', kind, id } : null;
  }

  return null;
}

/** Official embed URL for a parsed source (privacy-enhanced domain for YouTube). */
export function musicEmbedUrl(src: MusicSource): string {
  if (src.provider === 'YOUTUBE') {
    return src.kind === 'playlist'
      ? `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(src.id)}&rel=0`
      : `https://www.youtube-nocookie.com/embed/${encodeURIComponent(src.id)}?rel=0&loop=1&playlist=${encodeURIComponent(src.id)}`;
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

const STORAGE_KEY = 'isochronicle_external_music';

const loadSource = (): MusicSource | null => {
  try {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    // Re-parse instead of trusting the stored value
    return saved ? parseMusicLink(saved) : null;
  } catch {
    return null;
  }
};

const saveSource = (src: MusicSource | null) => {
  try {
    if (src) localStorage.setItem(STORAGE_KEY, musicLink(src));
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* storage off */ }
};

interface ExternalMusicState {
  source: MusicSource | null;
  /** Whether the in-game player is shown (and so playing / loaded). Not persisted. */
  isPlayerOpen: boolean;
  setSource: (src: MusicSource | null) => void;
  setPlayerOpen: (open: boolean) => void;
}

export const useExternalMusic = create<ExternalMusicState>((set) => ({
  source: loadSource(),
  isPlayerOpen: false,
  setSource: (source) => {
    saveSource(source);
    set({ source, isPlayerOpen: source ? true : false });
  },
  setPlayerOpen: (isPlayerOpen) => set((s) => ({ isPlayerOpen: isPlayerOpen && !!s.source })),
}));
