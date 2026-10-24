import React, { useEffect, useRef, useState } from 'react';
import { CloudSun, FastForward } from 'lucide-react';
import { useGameStore } from '../state/useGameStore';
import { useTranslation } from '../i18n/translations';
import { SEASON_CONFIGS } from '../types/game';
import type { TimeOfDayPhase, WeatherType } from '../types/state';
import { isConstructionReady } from '../state/constructionProgress';
import { isWorldHeld, useWorldHold } from '../state/worldHold';
import { battleTargets } from '../game/battleTargets';
import TIMELINE from '../data/timelineHud.json';
import LAIR from '../data/dragonsLair.json';

interface PhaseConfig { label: string; icon: React.ReactNode }
interface WeatherConfig { label: string; icon: React.ReactNode; border: string; bg: string; badge: string }

interface SkyStatusPanelProps {
  timeOfDayConfig: PhaseConfig;
  weatherConfig: WeatherConfig;
  onSkipDay: () => void;
  onOpenWeather: () => void;
}

/** Game seconds in one day (MainScene's DAY_NIGHT_CYCLE_DURATION_MS). */
const DAY_SECONDS = 240;
const WINDOW = TIMELINE.windowSeconds;
/** Where the NOW line sits on each lane (percent from the left). */
const NOW_X = 9;
const BOSS_EVERY = 5;

// Phase spans of the day cycle (matches MainScene's DAY_CYCLE keyframe switch points)
const PHASE_SEGMENTS: Array<{ phase: TimeOfDayPhase; from: number; to: number; color: string }> = [
  { phase: 'NIGHT', from: 0, to: 0.09, color: '#312e81' },
  { phase: 'DAWN', from: 0.09, to: 0.34, color: '#f59e0b' },
  { phase: 'DAY', from: 0.34, to: 0.705, color: '#38bdf8' },
  { phase: 'DUSK', from: 0.705, to: 0.82, color: '#a855f7' },
  { phase: 'NIGHT', from: 0.82, to: 1, color: '#312e81' },
];

const SKY: Record<TimeOfDayPhase, { top: string; bottom: string }> = {
  DAWN: { top: '#3b1d4a', bottom: '#b45309' },
  DAY: { top: '#0c4a6e', bottom: '#0ea5e9' },
  DUSK: { top: '#2e1065', bottom: '#be185d' },
  NIGHT: { top: '#020617', bottom: '#1e1b4b' },
};

const WEATHER_STYLE: Record<WeatherType, { emoji: string; from: string; to: string; edge: string }> = {
  CLEAR: { emoji: '☀️', from: '#78350f', to: '#b45309', edge: '#fcd34d' },
  RAIN: { emoji: '🌧️', from: '#0c4a6e', to: '#1e3a8a', edge: '#7dd3fc' },
  SNOW: { emoji: '❄️', from: '#334155', to: '#64748b', edge: '#e2e8f0' },
  HEATWAVE: { emoji: '🔥', from: '#7f1d1d', to: '#c2410c', edge: '#fb7185' },
};

const PHASE_KEY = { DAWN: 'skyDawn', DAY: 'skyDay', DUSK: 'skyDusk', NIGHT: 'skyNight' } as const;
const WEATHER_KEY = { CLEAR: 'hudWeatherClear', RAIN: 'hudWeatherRain', SNOW: 'hudWeatherSnow', HEATWAVE: 'hudWeatherHeat' } as const;
const PARTICLES = Array.from({ length: 10 }, (_, i) => ({ x: (i * 37) % 100, d: ((i * 0.29) % 1) }));

type TextKey = keyof typeof TIMELINE.text;

/** Re-renders every animation frame while mounted (markers glide at the display's refresh rate). */
const useAnimationFrame = () => {
  const [, setFrame] = useState(0);
  useEffect(() => {
    let raf = 0;
    const loop = () => { setFrame((f) => (f + 1) % 1_000_000); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
};

/** Bumps a counter whenever `value` changes, so a keyed element replays its CSS animation. */
const useChangePulse = (value: unknown) => {
  const [pulse, setPulse] = useState(0);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value) { prev.current = value; setPulse((p) => p + 1); }
  }, [value]);
  return pulse;
};

/**
 * The store writes the day progress twice a second; between writes it is carried
 * forward at the game speed so the lanes glide instead of stepping.
 */
const useSmoothDayProgress = (stored: number, rate: number) => {
  const sample = useRef({ value: stored, at: performance.now() });
  if (sample.current.value !== stored) sample.current = { value: stored, at: performance.now() };
  const ahead = ((performance.now() - sample.current.at) / 1000) * rate / DAY_SECONDS;
  return Math.min(0.9999, sample.current.value + Math.min(ahead, 0.6 / DAY_SECONDS * Math.max(1, rate)));
};

/** Real time left, as 1h 02m 03s / 4m 05s / 12s. */
const formatLeft = (seconds: number) => {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${s}s`;
};

/** Lane position (percent) of a moment `t` game seconds ahead; past the window it pins to the edge. */
const laneX = (t: number) => NOW_X + Math.min(1, Math.max(0, t / WINDOW)) * (100 - NOW_X);

/** Round sun with rays (SVG, so the pixel UI's square-corner rule can't flatten it). */
const SunGlyph: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="-12 -12 24 24" shapeRendering="geometricPrecision" style={{ overflow: 'visible', filter: 'drop-shadow(0 0 4px #fbbf24)' }}>
    <g className="wx-rays" style={{ transformOrigin: 'center' }}>
      {Array.from({ length: 8 }, (_, i) => <path key={i} d="M0 -11.5 L1.6 -8 L-1.6 -8 Z" fill="#fcd34d" transform={`rotate(${i * 45})`} />)}
    </g>
    <circle r="6.5" fill="#fbbf24" />
    <circle r="4" fill="#fef9c3" />
  </svg>
);

const MoonGlyph: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="-12 -12 24 24" shapeRendering="geometricPrecision" style={{ overflow: 'visible', filter: 'drop-shadow(0 0 4px #a5f3fc)' }}>
    <circle r="8" fill="#f1f5f9" />
    <circle cx="4.5" cy="-3" r="6.5" fill="#0f172a" />
  </svg>
);

/** Falling / drifting particles for one weather span. */
const WeatherParticles: React.FC<{ weather: WeatherType }> = ({ weather }) => {
  if (weather === 'RAIN') return <>{PARTICLES.map((p, i) => (
    <span key={i} className="absolute top-0 w-px h-2 bg-sky-300/80 wx-rain" style={{ left: `${p.x}%`, animationDelay: `${p.d}s` }} />
  ))}<span className="absolute inset-0 bg-sky-100/30 wx-lightning" /></>;
  if (weather === 'SNOW') return <>{PARTICLES.map((p, i) => (
    <span key={i} className="absolute top-0 w-1 h-1 rounded-full bg-white/90 wx-snow" style={{ left: `${p.x}%`, animationDelay: `${p.d * 3.6}s` }} />
  ))}</>;
  if (weather === 'HEATWAVE') return <>{[0, 1].map((i) => (
    <svg key={i} viewBox="0 0 100 10" preserveAspectRatio="none" className="absolute inset-x-0 h-2 w-full wx-heat" style={{ bottom: `${15 + i * 40}%`, animationDelay: `${i * 0.6}s` }}>
      <path d="M0 5 Q 12.5 0 25 5 T 50 5 T 75 5 T 100 5" fill="none" stroke="#fda4af" strokeWidth="1.5" />
    </svg>
  ))}</>;
  return <>{PARTICLES.slice(0, 6).map((p, i) => (
    <span key={i} className="absolute w-[3px] h-[3px] rounded-full bg-amber-100 sky-twinkle" style={{ left: `${p.x}%`, top: `${20 + (i * 23) % 60}%`, animationDelay: `${p.d * 2.4}s` }} />
  ))}</>;
};

/** A moving tick ruler (one tick per in-game minute of the lane), so time visibly flows toward NOW. */
const Ruler: React.FC<{ clock: number }> = ({ clock }) => {
  const step = 30;
  const first = step - (clock % step);
  const ticks: number[] = [];
  for (let t = first; t <= WINDOW; t += step) ticks.push(t);
  return <>{ticks.map((t) => (
    <span key={Math.round(clock + t)} className="absolute bottom-0 w-px h-1.5 bg-white/20" style={{ left: `${laneX(t)}%` }} />
  ))}</>;
};

interface Marker { key: string; t: number; icon: string; label: string; tone: 'wave' | 'boss' | 'kirov'; row: 0 | 1 }

export const SkyStatusPanel: React.FC<SkyStatusPanelProps> = ({ timeOfDayConfig, weatherConfig, onSkipDay, onOpenWeather }) => {
  useAnimationFrame();
  const { t: tr } = useTranslation();
  const {
    timeOfDay, dayProgress, day, year, weather, weatherForecast, season, randomWeatherEnabled, language,
    gameSpeed, invasion, castleBuilt, resourceBuildings, lairOpen,
  } = useGameStore();
  const loading = useWorldHold((s) => s.loading);
  const isTL = language === 'TL';
  const tx = (k: TextKey, vars: Record<string, string | number> = {}) =>
    Object.entries(vars).reduce((s, [v, val]) => s.split(`{${v}}`).join(String(val)), isTL ? TIMELINE.text[k].tl : TIMELINE.text[k].en);

  const held = isWorldHeld();
  const speed = gameSpeed ?? 1;
  const running = speed > 0 && !held;
  const toReal = (gameSeconds: number) => gameSeconds / Math.max(1, speed);

  const progress = useSmoothDayProgress(Math.min(1, Math.max(0, dayProgress || 0)), running ? speed : 0);
  const clock = ((day || 1) + progress) * DAY_SECONDS;
  const sky = SKY[timeOfDay];
  const wx: WeatherType = weather || 'CLEAR';
  const daysSurvived = ((year || 1) - 1) * 365 + (day || 1) - 1;
  const currentSeason = SEASON_CONFIGS[season || 'SPRING'];
  const phasePulse = useChangePulse(timeOfDay);
  const weatherPulse = useChangePulse(wx);
  const wavePulse = useChangePulse(invasion.isActive);

  // ── Battle lane ────────────────────────────────────────────────
  const ready = isConstructionReady({ castleBuilt, resourceBuildings });
  const waveLive = invasion.isActive;
  const kirovLive = !!battleTargets.kirovInvasion?.();
  const brawlLive = !!battleTargets.brawl?.();
  const wildLive = Object.values(battleTargets.wild).some((targets) => targets().length > 0);
  const isBoss = invasion.waveNumber % BOSS_EVERY === 0;
  const markers: Marker[] = [];
  if (ready && !waveLive) {
    markers.push({
      key: 'wave', t: invasion.countdown, icon: isBoss ? '👑' : '⚔️', row: 0,
      label: tx(isBoss ? 'bossWave' : 'wave', { n: invasion.waveNumber }), tone: isBoss ? 'boss' : 'wave',
    });
  }
  const kirovIn = battleTargets.nextKirovIn?.();
  if (!waveLive && !kirovLive && kirovIn !== undefined) {
    markers.push({ key: 'kirov', t: kirovIn, icon: '🛩️', label: tx('kirov'), tone: 'kirov', row: 1 });
  }
  const nextWave = markers.find((m) => m.key === 'wave');
  const imminent = !!nextWave && nextWave.t <= TIMELINE.imminentSeconds;
  const critical = !!nextWave && nextWave.t <= TIMELINE.criticalSeconds;
  const lairWave = Math.ceil(Math.max(1, invasion.invasionsRepelled + 1) / LAIR.cave.everyWaves) * LAIR.cave.everyWaves;
  const killed = Math.max(0, invasion.totalEnemiesInWave - invasion.enemiesRemaining);
  const waveDone = invasion.totalEnemiesInWave > 0 ? killed / invasion.totalEnemiesInWave : 0;

  // ── Weather lane ───────────────────────────────────────────────
  const randomOn = randomWeatherEnabled !== false;
  const dayLeft = (1 - progress) * DAY_SECONDS;
  const spans: Array<{ key: string; from: number; to: number; weather: WeatherType | null }> = [
    { key: `d${day}`, from: 0, to: dayLeft, weather: wx },
    { key: `d${(day || 1) + 1}`, from: dayLeft, to: dayLeft + DAY_SECONDS, weather: randomOn ? weatherForecast ?? null : wx },
    { key: `d${(day || 1) + 2}`, from: dayLeft + DAY_SECONDS, to: WINDOW + DAY_SECONDS, weather: randomOn ? null : wx },
  ].filter((s) => s.from < WINDOW);
  const phases: Array<{ key: string; from: number; to: number; color: string; phase: TimeOfDayPhase }> = [];
  for (let d = 0; d < 3; d++) {
    for (const seg of PHASE_SEGMENTS) {
      const from = (d + seg.from - progress) * DAY_SECONDS;
      const to = (d + seg.to - progress) * DAY_SECONDS;
      if (to > 0 && from < WINDOW) phases.push({ key: `${d}-${seg.from}`, from: Math.max(0, from), to, color: seg.color, phase: seg.phase });
    }
  }
  const currentSeg = PHASE_SEGMENTS.find((s) => progress >= s.from && progress < s.to) ?? PHASE_SEGMENTS[0];
  const nextSeg = PHASE_SEGMENTS[(PHASE_SEGMENTS.indexOf(currentSeg) + 1) % PHASE_SEGMENTS.length];
  const nextPhaseIn = (currentSeg.to - progress) * DAY_SECONDS;
  const sunUp = progress >= 0.15 && progress < 0.85;
  const arcT = sunUp ? (progress - 0.15) / 0.7 : ((progress + 0.15) % 1) / 0.3;

  const stateBadge = loading || held ? { text: tx('frozen'), cls: 'bg-sky-500/20 border-sky-400/50 text-sky-200', icon: '❄' }
    : speed === 0 ? { text: tx('paused'), cls: 'bg-amber-500/20 border-amber-400/50 text-amber-200', icon: '⏸' }
    : speed > 1 ? { text: `${speed}×`, cls: 'bg-purple-500/20 border-purple-400/50 text-purple-200', icon: '⏩' }
    : null;

  return (
    <div className={`relative rounded-2xl border border-white/10 overflow-hidden shadow-inner ${running ? '' : 'tl-frozen'}`}
      style={{ background: `linear-gradient(160deg, ${sky.top}, ${sky.bottom})`, transition: 'background 1.5s ease' }}>
      {/* Header: sky dial, phase, date, controls */}
      <div className="relative z-10 flex items-center gap-2 p-2 pb-1.5">
        <div className="relative w-9 h-9 shrink-0 rounded-lg bg-black/35 border border-white/10 overflow-hidden">
          <span className="absolute inset-x-1 bottom-1 h-px bg-white/25" />
          <div className="absolute w-4 h-4 -ml-2 -mt-2" style={{ left: `${10 + arcT * 80}%`, top: `${78 - Math.sin(arcT * Math.PI) * 52}%` }}>
            {sunUp ? <SunGlyph size={16} /> : <MoonGlyph size={14} />}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span key={`p-${phasePulse}`} className="text-[10px] font-extrabold uppercase tracking-wide text-white drop-shadow sky-pop">{timeOfDayConfig.label}</span>
            {stateBadge && (
              <span className={`rounded border px-1 text-[8px] font-black uppercase leading-tight ${stateBadge.cls}`}>{stateBadge.icon} {stateBadge.text}</span>
            )}
          </div>
          <div className="text-[9px] font-mono text-white/75 truncate">
            Y{year || 1}·D{day || 1} · {currentSeason.icon} {isTL ? currentSeason.name : currentSeason.nameEn} · {tx('daysSurvived', { n: daysSurvived })}
          </div>
        </div>
        <button type="button" onClick={onOpenWeather} title={`${weatherConfig.label} [P]`}
          className="relative p-1 rounded-lg bg-black/40 hover:bg-black/60 text-slate-200 hover:text-white border border-white/15 transition cursor-pointer">
          <CloudSun className="w-3.5 h-3.5" />
          <span className="pointer-events-none absolute -top-1.5 -right-1.5 rounded border border-slate-700 bg-slate-950 px-0.5 text-[8px] font-mono font-black leading-none text-amber-300">P</span>
        </button>
        <button type="button" onClick={onSkipDay} title={`${tr('skyNewDay').replace('{n}', String(daysSurvived + 2))} [O]`}
          className="relative p-1 rounded-lg bg-black/40 hover:bg-black/60 text-slate-200 hover:text-white border border-white/15 transition cursor-pointer">
          <FastForward className="w-3.5 h-3.5" />
          <span className="pointer-events-none absolute -top-1.5 -right-1.5 rounded border border-slate-700 bg-slate-950 px-0.5 text-[8px] font-mono font-black leading-none text-amber-300">O</span>
        </button>
      </div>

      {/* Battle lane */}
      <div className="relative z-10 px-2">
        <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-wider mb-0.5">
          <span className={waveLive ? 'text-rose-300' : 'text-white/70'}>⚔ {tx('battle')}</span>
          <span className="flex gap-1">
            {kirovLive && <span className="rounded bg-fuchsia-600/40 border border-fuchsia-400/60 px-1 text-fuchsia-100 tl-pulse">🛩️ {tx('kirovLive')}</span>}
            {brawlLive && <span className="rounded bg-orange-600/40 border border-orange-400/60 px-1 text-orange-100 tl-pulse">💥 {tx('brawlLive')}</span>}
            {wildLive && <span className="rounded bg-teal-600/40 border border-teal-400/60 px-1 text-teal-100 tl-pulse">🐉 {tx('wildLive')}</span>}
            <span className={`rounded border px-1 ${lairOpen ? 'bg-orange-500/30 border-orange-400/60 text-orange-100 tl-pulse' : 'bg-black/30 border-white/10 text-white/60'}`}
              title={lairOpen ? tx('lairOpen') : tx('lairAt', { n: lairWave })}>
              🌋 {lairOpen ? tx('lairOpen') : `W${lairWave}`}
            </span>
          </span>
        </div>
        <div key={`lane-${wavePulse}`} className={`relative h-10 rounded-lg border overflow-hidden ${
          waveLive ? `border-rose-400/70 tl-war ${wavePulse ? 'sky-pop' : ''}` : !ready ? 'border-white/10 bg-black/40 tl-sealed' : critical ? 'border-rose-400/80 bg-black/45 tl-shake' : imminent ? 'border-rose-400/60 bg-black/45 tl-alarm' : 'border-white/10 bg-black/40 tl-flow'
        }`}>
          {waveLive ? (
            <div className="absolute inset-0 flex flex-col justify-center px-2">
              <div className="flex items-center justify-between text-[10px] font-black text-white drop-shadow">
                <span>{isBoss ? '👑' : '⚔️'} {tx('waveLive', { n: invasion.waveNumber })}</span>
                <span className="font-mono text-rose-100">{tx('remaining', { a: invasion.enemiesRemaining, b: invasion.totalEnemiesInWave })}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-black/50 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-rose-500 to-amber-300 transition-[width] duration-300" style={{ width: `${waveDone * 100}%` }} />
              </div>
            </div>
          ) : !ready ? (
            <div className="absolute inset-0 flex items-center justify-center px-2 text-center text-[9px] font-bold text-white/60">🌳 {tx('sealed')}</div>
          ) : (
            <>
              <Ruler clock={clock} />
              {markers.map((m) => {
                const x = laneX(m.t);
                const color = m.tone === 'boss' ? 'border-amber-300 bg-amber-500/30 text-amber-100' : m.tone === 'wave' ? 'border-rose-400 bg-rose-600/30 text-rose-100' : 'border-fuchsia-400 bg-fuchsia-600/30 text-fuchsia-100';
                return (
                  <div key={m.key} className="absolute -translate-x-1/2 flex items-center gap-0.5 whitespace-nowrap" style={{ left: `${Math.min(x, 86)}%`, top: m.row === 0 ? 3 : 21 }}>
                    <span className={`rounded-md border px-1 text-[9px] leading-[14px] font-black ${color} ${m.key === 'wave' && imminent ? 'tl-pulse' : m.tone === 'kirov' ? 'tl-bob' : ''}`}>
                      {m.icon} <span className="font-mono">{formatLeft(toReal(m.t))}</span>
                    </span>
                  </div>
                );
              })}
            </>
          )}
          {!waveLive && ready && <span className="absolute inset-y-0 w-0.5 bg-white tl-now" style={{ left: `${NOW_X}%` }} />}
        </div>
        <div className="mt-0.5 h-3 text-[9px] font-semibold text-white/80 truncate">
          {waveLive ? (kirovLive ? tx('kirovLive') : '')
            : nextWave ? <span className={imminent ? 'text-rose-200 font-black' : ''}>{imminent && `${tx('imminent')} `}{tx('nextWaveIn', { what: nextWave.label, t: formatLeft(toReal(nextWave.t)) })}</span>
            : null}
        </div>
      </div>

      {/* Weather lane */}
      <div role="button" tabIndex={0} onClick={onOpenWeather} onKeyDown={(e) => { if (e.key === 'Enter') onOpenWeather(); }} className="relative z-10 px-2 pb-2 cursor-pointer group">
        <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-wider mb-0.5 text-white/70">
          <span>☁ {tx('weather')}</span>
          <span className="normal-case font-semibold">{WEATHER_STYLE[wx].emoji} {weatherConfig.badge}</span>
        </div>
        <div key={`wl-${weatherPulse}`} className={`relative h-7 rounded-lg border border-white/10 bg-black/40 overflow-hidden group-hover:border-sky-400/50 transition ${weatherPulse ? 'sky-pop' : ''}`}>
          {spans.map((s) => {
            const left = laneX(s.from);
            const right = laneX(Math.min(WINDOW, s.to));
            const style = s.weather ? WEATHER_STYLE[s.weather] : null;
            return (
              <div key={s.key} className={`absolute inset-y-0 overflow-hidden border-l ${style ? '' : 'tl-shimmer'}`}
                style={{
                  left: `${left}%`, width: `${Math.max(0, right - left)}%`,
                  borderColor: style?.edge ?? 'rgba(255,255,255,0.2)',
                  background: style ? `linear-gradient(to bottom, ${style.from}, ${style.to})` : undefined,
                }}>
                {s.weather && <WeatherParticles weather={s.weather} />}
                <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[11px] drop-shadow">{style?.emoji ?? '❔'}</span>
              </div>
            );
          })}
          <span className="absolute inset-y-0 bg-black/45" style={{ left: 0, width: `${NOW_X}%` }} />
          <span className="absolute inset-y-0 w-0.5 bg-white tl-now" style={{ left: `${NOW_X}%` }} />
        </div>
        {/* Day phases under the weather */}
        <div className="relative mt-1 h-1.5 rounded-full overflow-hidden bg-black/40 border border-white/10">
          {phases.map((p) => {
            const left = laneX(p.from);
            const right = laneX(Math.min(WINDOW, p.to));
            return <span key={p.key} className="absolute inset-y-0" style={{ left: `${left}%`, width: `${Math.max(0, right - left)}%`, background: p.color, opacity: p.from <= 0 ? 1 : 0.55 }} />;
          })}
          <span className="absolute inset-y-0 bg-black/50" style={{ left: 0, width: `${NOW_X}%` }} />
        </div>
        <div className="mt-0.5 flex justify-between gap-2 text-[9px] font-semibold text-white/80">
          <span className="truncate">
            {!randomOn ? tx('weatherStays')
              : weatherForecast ? tx('weatherTurns', { w: tr(WEATHER_KEY[weatherForecast]), t: formatLeft(toReal(dayLeft)) })
              : tx('weatherShift', { t: formatLeft(toReal(dayLeft)) })}
          </span>
          <span className="shrink-0 font-mono">{tx('phaseIn', { p: tr(PHASE_KEY[nextSeg.phase]), t: formatLeft(toReal(nextPhaseIn)) })}</span>
        </div>
      </div>
    </div>
  );
};
