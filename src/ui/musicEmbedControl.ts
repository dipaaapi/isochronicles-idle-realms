import { useCallback, useEffect, useRef, useState } from 'react';
import type { MusicSource } from '../state/externalMusic';

/**
 * Drives the YouTube / Spotify embed through each provider's postMessage
 * protocol (no extra scripts loaded): play / pause / restart, and reports
 * whether it is playing and when it has finished.
 *
 * - YouTube: the embed URL has `enablejsapi=1`; we send `{event:'listening'}`
 *   and it answers with `onReady` / `onStateChange` / `infoDelivery`.
 * - Spotify: the embed posts `{type:'ready'}` and `{type:'playback_update'}`
 *   and accepts `{command:'resume' | 'pause' | 'seek'}`.
 *
 * Only messages from the iframe's own window and the provider's origin are
 * read, and every field is type-checked before use.
 */

const YT_ORIGIN = 'https://www.youtube-nocookie.com';
const SPOTIFY_ORIGIN = 'https://open.spotify.com';
const YT_ENDED = 0;
const YT_PLAYING = 1;

export interface EmbedControl {
  /** Attach to the iframe's `ref`. */
  ref: (el: HTMLIFrameElement | null) => void;
  /** Attach to the iframe's `onLoad`. */
  onLoad: () => void;
  isPlaying: boolean;
  /** Plays now, or as soon as the embed is ready. */
  play: () => void;
  pause: () => void;
  toggle: () => void;
  /** Back to the start (first video of a YouTube playlist) and play. */
  restart: () => void;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

const keyOf = (src: MusicSource | null) => (src ? `${src.provider}-${src.kind}-${src.id}` : '');

export const useEmbedControl = (source: MusicSource | null, onEnded: () => void): EmbedControl => {
  const [isPlaying, setPlaying] = useState(false);
  const [iframe, setIframe] = useState<HTMLIFrameElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  /** Key of the entry whose embed has reported ready. */
  const readyFor = useRef('');
  const pendingPlay = useRef(false);
  const ended = useRef(false);
  const playlistPos = useRef<{ index: number; length: number } | null>(null);
  const sourceKey = keyOf(source);

  const post = useCallback((message: unknown) => {
    const target = iframeRef.current?.contentWindow;
    const src = sourceRef.current;
    if (!target || !src) return;
    if (src.provider === 'YOUTUBE') target.postMessage(JSON.stringify(message), YT_ORIGIN);
    else target.postMessage(message, SPOTIFY_ORIGIN);
  }, []);

  const isYouTube = () => sourceRef.current?.provider === 'YOUTUBE';
  const ytCommand = useCallback((func: string, args: unknown[] = []) => post({ event: 'command', func, args }), [post]);

  const sendPlay = useCallback(() => {
    ended.current = false;
    if (isYouTube()) ytCommand('playVideo');
    else post({ command: 'resume' });
  }, [post, ytCommand]);

  const markReady = useCallback(() => {
    const key = keyOf(sourceRef.current);
    if (readyFor.current === key) return;
    readyFor.current = key;
    if (pendingPlay.current) {
      pendingPlay.current = false;
      // Let the embed finish wiring up before the first command
      window.setTimeout(sendPlay, 150);
    }
  }, [sendPlay]);

  // New entry: forget the old player's state (a pending play request stays)
  useEffect(() => {
    setPlaying(false);
    ended.current = false;
    playlistPos.current = null;
  }, [sourceKey]);

  useEffect(() => {
    if (!iframe) return;
    const handle = (event: MessageEvent) => {
      const src = sourceRef.current;
      if (!src || event.source !== iframe.contentWindow) return;
      if (src.provider === 'YOUTUBE') {
        if (event.origin !== YT_ORIGIN || typeof event.data !== 'string') return;
        let data: unknown;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        if (!isRecord(data)) return;
        if (data.event === 'onReady' || data.event === 'initialDelivery') markReady();
        let state: number | null = null;
        if (data.event === 'onStateChange' && typeof data.info === 'number') state = data.info;
        if (data.event === 'infoDelivery' && isRecord(data.info)) {
          markReady();
          const info = data.info;
          if (typeof info.playerState === 'number') state = info.playerState;
          if (Array.isArray(info.playlist) && typeof info.playlistIndex === 'number') {
            playlistPos.current = { index: info.playlistIndex, length: info.playlist.length };
          }
        }
        if (state === null) return;
        setPlaying(state === YT_PLAYING);
        if (state === YT_ENDED && !ended.current) {
          // Inside a YouTube playlist only the last video ends the entry
          const pos = playlistPos.current;
          if (src.kind === 'playlist' && pos && pos.index < pos.length - 1) return;
          ended.current = true;
          onEndedRef.current();
        }
        return;
      }
      if (event.origin !== SPOTIFY_ORIGIN || !isRecord(event.data)) return;
      const { type, payload } = event.data;
      if (type === 'ready') markReady();
      if (type === 'playback_update' && isRecord(payload)) {
        markReady();
        const paused = payload.isPaused === true;
        setPlaying(!paused);
        const position = Number(payload.position);
        const duration = Number(payload.duration);
        const atEnd = duration > 0 && position > 0 && duration - position < 1000;
        if (paused && atEnd && !ended.current) {
          ended.current = true;
          onEndedRef.current();
        }
      }
    };
    window.addEventListener('message', handle);
    return () => window.removeEventListener('message', handle);
  }, [iframe, markReady]);

  const ref = useCallback((el: HTMLIFrameElement | null) => {
    // A new iframe (reopened / switched entry) has to report ready again
    if (el !== iframeRef.current) readyFor.current = '';
    iframeRef.current = el;
    setIframe(el);
  }, []);

  const onLoad = useCallback(() => {
    if (!isYouTube()) return;
    // Ask YouTube to start reporting; repeat a few times in case the player boots late
    let tries = 0;
    const ping = () => {
      post({ event: 'listening', id: 1, channel: 'widget' });
      if (++tries < 5) window.setTimeout(ping, 400);
    };
    ping();
  }, [post]);

  const play = useCallback(() => {
    if (readyFor.current === keyOf(sourceRef.current)) sendPlay();
    else pendingPlay.current = true;
  }, [sendPlay]);

  const pause = useCallback(() => {
    pendingPlay.current = false;
    if (isYouTube()) ytCommand('pauseVideo');
    else post({ command: 'pause' });
  }, [post, ytCommand]);

  const restart = useCallback(() => {
    ended.current = false;
    if (isYouTube()) {
      if (sourceRef.current?.kind === 'playlist') ytCommand('playVideoAt', [0]);
      else {
        ytCommand('seekTo', [0, true]);
        ytCommand('playVideo');
      }
    } else {
      post({ command: 'seek', timestamp: 0 });
      post({ command: 'resume' });
    }
  }, [post, ytCommand]);

  const toggle = useCallback(() => (isPlaying ? pause() : play()), [isPlaying, pause, play]);

  return { ref, onLoad, isPlaying, play, pause, toggle, restart };
};
