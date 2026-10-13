import React, { useMemo } from 'react';

const EMBER_COUNT = 36;

/** Animated layers over the title art: rising embers, drifting mist and a pulsing hellfire glow. */
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
      {embers.map((e) => (
        <span key={e.key} className="title-ember" style={e.style} />
      ))}
    </div>
  );
};
