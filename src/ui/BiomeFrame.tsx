import FRAMES from '../data/biomeFrame.json';
import { useGameStore } from '../state/useGameStore';

type Frame = { corner: 'horn' | 'flame' | 'crystal' | 'star'; main: string; light: string; dark: string; glow: string };

/** Corner ornament per biome, drawn for the top-left corner and mirrored. */
function Corner({ f, className }: { f: Frame; className: string }) {
  const base = <path d="M2 2 H34 L28 8 H8 V28 L2 34 Z" fill={f.main} stroke={f.dark} strokeWidth="1.5" />;
  const art = {
    // Demon Citadel: a curled horn
    horn: <path d="M8 8 C20 6 26 14 22 22 C20 16 15 13 8 14 Z" fill={f.light} stroke={f.dark} strokeWidth="1" />,
    // Magma Caldera: a tongue of fire
    flame: <path d="M8 22 C8 14 13 12 12 6 C17 10 20 14 18 20 C16 17 14 18 14 22 Z" fill={f.light} stroke={f.dark} strokeWidth="1" />,
    // Frost Spire: ice shards
    crystal: <g fill={f.light} stroke={f.dark} strokeWidth="1"><path d="M9 9 L16 6 L13 13 Z" /><path d="M9 9 L6 16 L13 13 Z" /><path d="M13 13 L22 20 L16 16 Z" /></g>,
    // Astral Sanctum: a four-point star
    star: <path d="M15 5 L17 13 L25 15 L17 17 L15 25 L13 17 L5 15 L13 13 Z" fill={f.light} stroke={f.dark} strokeWidth="1" />,
  }[f.corner];
  return (
    <svg className={`absolute w-10 h-10 sm:w-12 sm:h-12 ${className}`} viewBox="0 0 40 40" aria-hidden="true">
      {base}
      {art}
    </svg>
  );
}

/**
 * Frame around the game map in the chosen biome's style (colours and corner
 * ornaments from src/data/biomeFrame.json). It covers only the map area.
 */
export function BiomeFrame() {
  const biome = useGameStore((s) => s.platformPhase);
  const f = ((FRAMES as unknown as Record<string, Frame>)[String(biome)] ?? (FRAMES as unknown as Record<string, Frame>)['1']);
  const edge = `linear-gradient(90deg, ${f.dark}, ${f.main} 20%, ${f.light} 50%, ${f.main} 80%, ${f.dark})`;
  const edgeV = `linear-gradient(180deg, ${f.dark}, ${f.main} 20%, ${f.light} 50%, ${f.main} 80%, ${f.dark})`;
  return (
    <div className="pointer-events-none absolute inset-0 z-[40]" aria-hidden="true">
      <div className="absolute inset-0" style={{ boxShadow: `inset 0 0 22px 3px ${f.glow}88, inset 0 0 0 1px ${f.dark}` }} />
      <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: edge }} />
      <div className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ background: edge }} />
      <div className="absolute top-0 bottom-0 left-0 w-[3px]" style={{ background: edgeV }} />
      <div className="absolute top-0 bottom-0 right-0 w-[3px]" style={{ background: edgeV }} />
      <Corner f={f} className="top-0 left-0" />
      <Corner f={f} className="top-0 right-0 -scale-x-100" />
      <Corner f={f} className="bottom-0 left-0 -scale-y-100" />
      <Corner f={f} className="bottom-0 right-0 -scale-x-100 -scale-y-100" />
    </div>
  );
}
