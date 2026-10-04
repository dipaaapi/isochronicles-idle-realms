import frameColors from '../data/difficultyFrame.json';
import { DIFFICULTIES, type Difficulty } from '../state/difficulty';
import { useTranslation } from '../i18n/translations';

type FrameColor = { main: string; light: string; dark: string };
const COLORS = frameColors as unknown as Record<Difficulty, FrameColor>;

/** One rune-cut corner ornament, mirrored into each corner. */
function Corner({ c, className }: { c: FrameColor; className: string }) {
  return (
    <svg className={`absolute w-10 h-10 sm:w-14 sm:h-14 ${className}`} viewBox="0 0 56 56" aria-hidden="true">
      <path d="M2 2 H40 L34 8 H8 V34 L2 40 Z" fill={c.main} stroke={c.dark} strokeWidth="1.5" />
      <path d="M8 8 H24 L20 12 H12 V20 L8 24 Z" fill={c.light} opacity="0.85" />
      <rect x="15" y="15" width="7" height="7" transform="rotate(45 18.5 18.5)" fill={c.light} stroke={c.dark} strokeWidth="1" />
    </svg>
  );
}

/**
 * Glowing frame on the very edge of the screen in the realm's difficulty
 * colour (Easy green, Normal yellow, Hard red), with corner runes. The
 * difficulty name shows only while the pointer hovers the gem on the bottom edge.
 */
export function DifficultyFrame({ difficulty }: { difficulty: Difficulty }) {
  const { isTL } = useTranslation();
  const c = COLORS[difficulty] ?? COLORS.NORMAL;
  const d = DIFFICULTIES[difficulty];
  const edge = `linear-gradient(90deg, ${c.dark}, ${c.main} 20%, ${c.light} 50%, ${c.main} 80%, ${c.dark})`;
  const edgeV = `linear-gradient(180deg, ${c.dark}, ${c.main} 20%, ${c.light} 50%, ${c.main} 80%, ${c.dark})`;

  return (
    <div className="pointer-events-none fixed inset-0 z-[250]" aria-hidden="true">
      {/* Inner glow */}
      <div className="absolute inset-0" style={{ boxShadow: `inset 0 0 18px 2px ${c.main}66, inset 0 0 0 1px ${c.dark}` }} />
      {/* Edge bars */}
      <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: edge }} />
      <div className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ background: edge }} />
      <div className="absolute top-0 bottom-0 left-0 w-[3px]" style={{ background: edgeV }} />
      <div className="absolute top-0 bottom-0 right-0 w-[3px]" style={{ background: edgeV }} />
      {/* Corner runes */}
      <Corner c={c} className="top-0 left-0" />
      <Corner c={c} className="top-0 right-0 -scale-x-100" />
      <Corner c={c} className="bottom-0 left-0 -scale-y-100" />
      <Corner c={c} className="bottom-0 right-0 -scale-x-100 -scale-y-100" />
      {/* Badge on the bottom edge */}
      {d && (
        // Hidden until the pointer comes near: a small gem marks the spot, hovering it reveals the label
        <div className="group pointer-events-auto absolute bottom-0 left-1/2 -translate-x-1/2 flex flex-col items-center px-10 pt-6">
          <div
            className="w-2.5 h-2.5 rotate-45 mb-1 transition-opacity duration-200 group-hover:opacity-0"
            style={{ background: c.main, boxShadow: `0 0 6px ${c.main}`, border: `1px solid ${c.light}` }}
          />
          <div
            className="absolute bottom-0 whitespace-nowrap px-3 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] border-x-2 border-t-2 rounded-t-md opacity-0 translate-y-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-y-0"
            style={{ background: `${c.dark}e6`, borderColor: c.main, color: c.light, textShadow: `0 0 6px ${c.main}` }}
          >
            {d.icon} {isTL ? d.labelTl : d.label}
          </div>
        </div>
      )}
    </div>
  );
}
