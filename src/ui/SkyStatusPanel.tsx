import React, { useEffect, useRef, useState } from 'react';
import { FastForward } from 'lucide-react';
import { useGameStore } from '../state/useGameStore';
import { useTranslation } from '../i18n/translations';
import { SEASON_CONFIGS } from '../types/game';
import type { TimeOfDayPhase, WeatherType } from '../types/state';

interface PhaseConfig { label: string; icon: React.ReactNode }
interface WeatherConfig { label: string; icon: React.ReactNode; border: string; bg: string; badge: string }

interface SkyStatusPanelProps {
  timeOfDayConfig: PhaseConfig;
  weatherConfig: WeatherConfig;
  onSkipDay: () => void;
  onOpenWeather: () => void;
}

// Phase spans of the day cycle (matches MainScene's DAY_CYCLE keyframe switch points)
const PHASE_SEGMENTS: Array<{ phase: TimeOfDayPhase; from: number; to: number; color: string }> = [
  { phase: 'NIGHT', from: 0, to: 0.09, color: '#312e81' },
  { phase: 'DAWN', from: 0.09, to: 0.34, color: '#f59e0b' },
  { phase: 'DAY', from: 0.34, to: 0.705, color: '#38bdf8' },
  { phase: 'DUSK', from: 0.705, to: 0.82, color: '#a855f7' },
  { phase: 'NIGHT', from: 0.82, to: 1, color: '#312e81' },
];

const SKY: Record<TimeOfDayPhase, { top: string; bottom: string; accent: string }> = {
  DAWN: { top: '#3b1d4a', bottom: '#b45309', accent: '#fcd34d' },
  DAY: { top: '#0c4a6e', bottom: '#0ea5e9', accent: '#fde047' },
  DUSK: { top: '#2e1065', bottom: '#be185d', accent: '#f0abfc' },
  NIGHT: { top: '#020617', bottom: '#1e1b4b', accent: '#67e8f9' },
};

const PHASE_KEY = { DAWN: 'skyDawn', DAY: 'skyDay', DUSK: 'skyDusk', NIGHT: 'skyNight' } as const;
const WEATHER_EMOJI: Record<WeatherType, string> = { CLEAR: '☀️', RAIN: '🌧️', SNOW: '❄️', HEATWAVE: '🔥' };
const WEATHER_KEY = { CLEAR: 'hudWeatherClear', RAIN: 'hudWeatherRain', SNOW: 'hudWeatherSnow', HEATWAVE: 'hudWeatherHeat' } as const;

const STARS = Array.from({ length: 9 }, (_, i) => ({ x: (i * 37) % 95 + 3, y: (i * 23) % 45 + 5, d: (i % 4) * 0.6 }));
const DROPS = Array.from({ length: 14 }, (_, i) => ({ x: (i * 41) % 100, d: (i * 0.13) % 0.9 }));

/** Bumps a counter whenever `value` changes, so a keyed element replays its CSS animation. */
const useChangePulse = (value: unknown) => {
  const [pulse, setPulse] = useState(0);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      setPulse((p) => p + 1);
    }
  }, [value]);
  return pulse;
};

/** Round sun with rays (SVG, so the pixel UI's square-corner rule can't flatten it). */
const SunGlyph: React.FC<{ size: number; spin?: boolean }> = ({ size, spin }) => (
  <svg width={size} height={size} viewBox="-12 -12 24 24" shapeRendering="geometricPrecision" style={{ overflow: 'visible', filter: 'drop-shadow(0 0 4px #fbbf24)' }}>
    <g className={spin ? 'wx-rays' : 'wx-rays-slow'} style={{ transformOrigin: 'center' }}>
      {Array.from({ length: 8 }, (_, i) => (
        <path key={i} d="M0 -11.5 L1.6 -8 L-1.6 -8 Z" fill="#fcd34d" transform={`rotate(${i * 45})`} />
      ))}
    </g>
    <circle r="6.5" fill="url(#sunCore)" />
    <defs>
      <radialGradient id="sunCore">
        <stop offset="0%" stopColor="#fef9c3" />
        <stop offset="70%" stopColor="#fbbf24" />
        <stop offset="100%" stopColor="#f59e0b" />
      </radialGradient>
    </defs>
  </svg>
);

/** Crescent moon. */
const MoonGlyph: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="-12 -12 24 24" shapeRendering="geometricPrecision" style={{ overflow: 'visible', filter: 'drop-shadow(0 0 4px #a5f3fc)' }}>
    <path d="M3 -9 A9 9 0 1 0 3 9 A7 7 0 1 1 3 -9 Z" fill="#f1f5f9" />
    <circle cx="-4" cy="2" r="1.1" fill="#cbd5e1" />
    <circle cx="-2" cy="-4" r="0.8" fill="#cbd5e1" />
  </svg>
);

/** Where the sun / moon sits on its arc, as percentages of the card. */
const celestialPosition = (progress: number) => {
  const isSun = progress >= 0.15 && progress < 0.85;
  const t = isSun ? (progress - 0.15) / 0.7 : ((progress + 0.15) % 1) / 0.3;
  return { isSun, x: 8 + t * 84, y: 72 - Math.sin(t * Math.PI) * 52 };
};

export const SkyStatusPanel: React.FC<SkyStatusPanelProps> = ({ timeOfDayConfig, weatherConfig, onSkipDay, onOpenWeather }) => {
  const { t: tr } = useTranslation();
  const { timeOfDay, dayProgress, day, year, weather, weatherForecast, season, randomWeatherEnabled, language } = useGameStore();

  const phasePulse = useChangePulse(timeOfDay);
  const dayPulse = useChangePulse(day);
  const weatherPulse = useChangePulse(weather);

  const progress = Math.min(1, Math.max(0, dayProgress || 0));
  const sky = SKY[timeOfDay];
  const body = celestialPosition(progress);
  const currentSeg = PHASE_SEGMENTS.find((s) => progress >= s.from && progress < s.to) ?? PHASE_SEGMENTS[0];
  const nextSeg = PHASE_SEGMENTS[(PHASE_SEGMENTS.indexOf(currentSeg) + 1) % PHASE_SEGMENTS.length];
  const nextIn = Math.max(1, Math.round((currentSeg.to - progress) * 100));
  const daysSurvived = ((year || 1) - 1) * 365 + (day || 1) - 1;
  const currentSeason = SEASON_CONFIGS[season || 'SPRING'];
  const wx = weather || 'CLEAR';

  return (
    <div className="grid grid-cols-2 gap-2">
      {/* Day cycle card: live sky, moving sun/moon, phase timeline */}
      <div
        className="relative rounded-2xl border border-white/10 overflow-hidden shadow-inner flex flex-col justify-between min-h-[104px]"
        style={{ background: `linear-gradient(to bottom, ${sky.top}, ${sky.bottom})`, transition: 'background 1.5s ease' }}
      >
        <div className="absolute inset-0 pointer-events-none">
          {STARS.map((s, i) => (
            <span
              key={i}
              className="absolute w-[2px] h-[2px] rounded-full bg-white sky-twinkle"
              style={{ left: `${s.x}%`, top: `${s.y}%`, animationDelay: `${s.d}s`, opacity: body.isSun ? 0 : undefined, transition: 'opacity 1.5s' }}
            />
          ))}
          <div
            className="absolute w-6 h-6 -ml-3 -mt-3"
            style={{ left: `${body.x}%`, top: `${body.y}%`, transition: 'left 1s linear, top 1s linear' }}
          >
            {body.isSun ? <SunGlyph size={24} /> : <MoonGlyph size={22} />}
          </div>
          <div key={`sweep-${phasePulse}`} className={`absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/25 to-transparent ${phasePulse ? 'sky-sweep' : 'opacity-0'}`} />
        </div>

        {dayPulse > 0 && (
          <div key={`day-${dayPulse}`} className="absolute top-0 inset-x-0 z-20 sky-banner pointer-events-none">
            <div className="mx-1 mt-1 rounded-lg bg-black/70 border border-amber-300/50 text-amber-200 text-[9px] font-black uppercase tracking-wider text-center py-0.5">
              {tr('skyNewDay').replace('{n}', String(daysSurvived + 1))}
            </div>
          </div>
        )}

        <div className="relative z-10 p-2.5 flex items-start justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <div key={`icon-${phasePulse}`} className="p-1 rounded-lg bg-black/40 border border-white/10 sky-pop">{timeOfDayConfig.icon}</div>
            <div className="min-w-0">
              <div key={`label-${phasePulse}`} className="text-[10px] font-extrabold uppercase tracking-wide text-white drop-shadow sky-pop truncate">
                {timeOfDayConfig.label}
              </div>
              <div className="text-[9px] font-mono text-white/80">Y{year || 1} • D{day || 1}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onSkipDay}
            title={tr('skyNewDay').replace('{n}', String(daysSurvived + 2))}
            className="p-1 rounded-lg bg-black/40 hover:bg-black/60 text-slate-200 hover:text-white border border-white/15 transition cursor-pointer"
          >
            <FastForward className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="relative z-10 px-2.5 pb-2">
          <div className="relative h-1.5 rounded-full overflow-hidden border border-white/15 flex bg-black/40">
            {PHASE_SEGMENTS.map((s, i) => (
              <div
                key={i}
                style={{ width: `${(s.to - s.from) * 100}%`, background: s.color, opacity: s === currentSeg ? 1 : 0.35, transition: 'opacity 0.8s' }}
              />
            ))}
            <span className="absolute top-1/2 w-2 h-2 -mt-1 -ml-1 rounded-full bg-white shadow-[0_0_6px_2px_rgba(255,255,255,0.8)]" style={{ left: `${progress * 100}%`, transition: 'left 1s linear' }} />
          </div>
          <div className="mt-1 flex justify-between text-[8px] font-semibold text-white/75">
            <span>{tr('skyNextIn').replace('{phase}', tr(PHASE_KEY[nextSeg.phase])).replace('{pct}', String(nextIn))}</span>
            <span className="font-mono">{tr('skyDaysPassed').replace('{n}', String(daysSurvived))}</span>
          </div>
        </div>
      </div>

      {/* Weather card: live particles, today → tomorrow forecast */}
      <button
        type="button"
        onClick={onOpenWeather}
        title={weatherConfig.label}
        className={`relative rounded-2xl border ${weatherConfig.border} ${weatherConfig.bg} hover:border-sky-400/60 hover:shadow-lg hover:shadow-sky-500/20 active:scale-[0.98] transition overflow-hidden shadow-inner text-left cursor-pointer group flex flex-col justify-between min-h-[104px]`}
      >
        <div className="absolute inset-0 pointer-events-none">
          {wx === 'RAIN' && (
            <>
              {DROPS.map((d, i) => (
                <svg key={i} viewBox="0 0 4 10" className="absolute top-0 w-1 h-2.5 wx-rain" style={{ left: `${d.x}%`, animationDelay: `${d.d}s` }} shapeRendering="geometricPrecision">
                  <path d="M2 0 C2.5 4 4 6 4 8 A2 2 0 0 1 0 8 C0 6 1.5 4 2 0 Z" fill="#7dd3fc" />
                </svg>
              ))}
              <div className="absolute inset-0 bg-sky-100/40 wx-lightning" />
              <svg viewBox="0 0 24 48" className="absolute right-[18%] top-0 w-5 h-10 wx-lightning" shapeRendering="geometricPrecision">
                <path d="M14 0 L4 26 L11 26 L7 48 L21 18 L13 18 L18 0 Z" fill="#fef9c3" stroke="#facc15" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            </>
          )}
          {wx === 'SNOW' &&
            DROPS.map((d, i) => (
              <svg key={i} viewBox="-6 -6 12 12" className="absolute top-0 w-2 h-2 wx-snow" style={{ left: `${d.x}%`, animationDelay: `${d.d * 4}s` }} shapeRendering="geometricPrecision">
                {[0, 60, 120].map((a) => (
                  <line key={a} x1="0" y1="-5" x2="0" y2="5" stroke="white" strokeWidth="1.4" strokeLinecap="round" transform={`rotate(${a})`} />
                ))}
              </svg>
            ))}
          {wx === 'HEATWAVE' &&
            [0, 1, 2].map((i) => (
              <svg key={i} viewBox="0 0 100 10" preserveAspectRatio="none" className="absolute inset-x-0 h-3 w-full wx-heat" style={{ bottom: `${10 + i * 22}%`, animationDelay: `${i * 0.5}s` }} shapeRendering="geometricPrecision">
                <path d="M0 5 Q 12.5 0 25 5 T 50 5 T 75 5 T 100 5" fill="none" stroke="#fb7185" strokeWidth="1.5" />
              </svg>
            ))}
          {wx === 'CLEAR' && (
            <div className="absolute -top-6 -right-6 w-20 h-20 opacity-60">
              <SunGlyph size={80} spin />
            </div>
          )}
          <div key={`wsweep-${weatherPulse}`} className={`absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/25 to-transparent ${weatherPulse ? 'sky-sweep' : 'opacity-0'}`} />
        </div>

        {weatherPulse > 0 && (
          <div key={`wb-${weatherPulse}`} className="absolute top-0 inset-x-0 z-20 sky-banner pointer-events-none">
            <div className="mx-1 mt-1 rounded-lg bg-black/70 border border-sky-300/50 text-sky-200 text-[9px] font-black uppercase tracking-wider text-center py-0.5">
              {tr('skyWeatherShift')}: {WEATHER_EMOJI[wx]} {weatherConfig.badge}
            </div>
          </div>
        )}

        <div className="relative z-10 p-2.5 flex items-center gap-1.5">
          <div key={`wicon-${weatherPulse}`} className="p-1 rounded-lg bg-black/40 border border-white/10 group-hover:border-sky-400/40 transition sky-pop">
            {weatherConfig.icon}
          </div>
          <div className="min-w-0">
            <div key={`wlabel-${weatherPulse}`} className="text-[10px] font-extrabold uppercase tracking-wide text-white truncate sky-pop">{weatherConfig.badge}</div>
            <div className="text-[9px] font-medium text-slate-200 flex items-center gap-1">
              <span>{currentSeason.icon}</span>
              <span>{language === 'TL' ? currentSeason.name : currentSeason.nameEn}</span>
            </div>
          </div>
        </div>

        <div className="relative z-10 px-2.5 pb-2">
          <div className="flex items-center justify-between rounded-lg bg-black/40 border border-white/10 px-1.5 py-1 text-[9px]">
            <span className="flex items-center gap-1 text-white font-bold">
              <span className="text-[8px] uppercase text-white/60">{tr('skyWeatherNow')}</span>
              {WEATHER_EMOJI[wx]}
            </span>
            <span className="text-white/40">→</span>
            <span className="flex items-center gap-1 text-white/90 font-bold">
              <span className="text-[8px] uppercase text-white/60">{tr('skyTomorrow')}</span>
              {randomWeatherEnabled === false
                ? <span className="text-[8px] text-amber-300">{tr('skyRandomOff')}</span>
                : weatherForecast ? WEATHER_EMOJI[weatherForecast] : '❔'}
            </span>
          </div>
          {weatherForecast && randomWeatherEnabled !== false && (
            <div className="mt-0.5 text-[8px] text-slate-300 truncate">
              {tr('skyTomorrow')}: {tr(WEATHER_KEY[weatherForecast])}
            </div>
          )}
        </div>
      </button>
    </div>
  );
};
