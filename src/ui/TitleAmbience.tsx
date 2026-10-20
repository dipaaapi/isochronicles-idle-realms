import React, { useMemo } from 'react';

const EMBER_COUNT = 36;

/** Levitating obsidian shards: left/top in %, size in px, bob period and phase. */
const CRYSTALS = [
  { left: 3, top: 16, size: 54, dur: 6.5, delay: 0, tilt: -8 },
  { left: 12, top: 58, size: 34, dur: 5.2, delay: -2, tilt: 10 },
  { left: 16, top: 6, size: 26, dur: 7.4, delay: -4, tilt: -14 },
  { left: 82, top: 6, size: 28, dur: 6.1, delay: -1.5, tilt: 12 },
  { left: 84, top: 56, size: 40, dur: 5.8, delay: -3.2, tilt: -6 },
  { left: 91, top: 24, size: 52, dur: 7.0, delay: -5, tilt: 6 },
];

/** Blood falls: x in %, how far down it pours (% of screen), loop length, phase, thickness. */
const BLOOD_FALLS = [
  { left: 7, reach: 62, dur: 7, delay: 0, width: 4 },
  { left: 14, reach: 48, dur: 9, delay: -3, width: 3 },
  { left: 19, reach: 70, dur: 8, delay: -6, width: 5 },
  { left: 81, reach: 66, dur: 10, delay: -1.5, width: 3 },
  { left: 87, reach: 50, dur: 7.5, delay: -4.5, width: 4 },
  { left: 95, reach: 72, dur: 8.5, delay: -2.2, width: 5 },
];

const Crystal: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size * 2.2} viewBox="0 0 20 44" shapeRendering="crispEdges" aria-hidden>
    <polygon points="10,0 18,12 16,34 10,44 4,34 2,12" fill="#0b0712" stroke="#7e22ce" strokeWidth="0.8" />
    <polygon points="10,0 18,12 16,34 10,44" fill="#1a1027" />
    <polygon points="10,0 6,12 7,30 10,44 4,34 2,12" fill="#06030a" />
    <path className="title-crystal-vein" d="M10 6 L8 15 L11 22 L9 31 L10 38" stroke="#ef4444" strokeWidth="0.9" fill="none" />
    <path d="M14 10 L15 20" stroke="#c084fc" strokeWidth="0.6" opacity="0.8" />
  </svg>
);

/** Animated layers over the title art: obsidian crystals, pouring blood, rising embers, mist and a hellfire glow. */
export const TitleAmbience: React.FC = () => {
  const embers = useMemo(
    () =>
      Array.from({ length: EMBER_COUNT }, (_, i) => {
        const size = 2 + Math.random() * 5;
        return {
          key: i,
          style: {
            left: `${Math.random() * 100}%`,
            width: size,
            height: size,
            animationDuration: `${7 + Math.random() * 9}s`,
            animationDelay: `${-Math.random() * 16}s`,
            '--ember-dx': `${(Math.random() - 0.5) * 160}px`,
          } as React.CSSProperties,
        };
      }),
    []
  );

  return (
    <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
      <div className="title-glow absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-red-700/40 via-orange-600/10 to-transparent" />
      <div className="title-mist bottom-[8%] h-40 bg-purple-400/15" style={{ animationDuration: '26s' }} />
      <div className="title-mist bottom-[22%] h-28 bg-slate-200/10" style={{ animationDuration: '34s', animationDelay: '-12s' }} />

      {/* Blood and crystals stay in the side bands so they never cover the title banner in the art */}
      <div className="title-side-mask absolute inset-0">
      {BLOOD_FALLS.map((b, i) => (
        <div
          key={`blood-${i}`}
          className="title-blood"
          style={{ left: `${b.left}%`, width: b.width, '--blood-reach': `${b.reach}vh`, animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s` } as React.CSSProperties}
        >
          <span className="title-blood-drop" style={{ animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s` }} />
        </div>
      ))}

      {CRYSTALS.map((c, i) => (
        <div
          key={`crystal-${i}`}
          className="title-crystal"
          style={{ left: `${c.left}%`, top: `${c.top}%`, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s`, '--crystal-tilt': `${c.tilt}deg` } as React.CSSProperties}
        >
          <Crystal size={c.size} />
          <span className="title-crystal-drip" style={{ animationDelay: `${c.delay * 0.7}s` }} />
          <span className="title-crystal-shadow" style={{ width: c.size * 1.2, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }} />
        </div>
      ))}
      </div>

      {embers.map((e) => (
        <span key={e.key} className="title-ember" style={e.style} />
      ))}
    </div>
  );
};
