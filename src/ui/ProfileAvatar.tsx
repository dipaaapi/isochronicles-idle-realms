import { BEAST_PORTRAITS } from '../game/bestiaryPortraits';
import type { Avatar } from '../state/playerProfile';

/**
 * A player's avatar: uploaded picture, icon or General portrait. With none set
 * it is the blank head-and-shoulders silhouette (like a social profile with no photo).
 */
export function ProfileAvatar({ avatar, size = 32, className = '' }: { avatar?: Avatar; size?: number; className?: string }) {
  const box = { width: size, height: size };
  const frame = `shrink-0 overflow-hidden bg-slate-700 border-2 border-slate-950 ${className}`;
  if (avatar?.kind === 'image') return <img src={avatar.src} alt="" style={box} className={`${frame} object-cover`} draggable={false} />;
  if (avatar?.kind === 'general' && BEAST_PORTRAITS[avatar.unitClass]) {
    return <img src={BEAST_PORTRAITS[avatar.unitClass]} alt="" style={box} className={`${frame} object-cover`} draggable={false} />;
  }
  if (avatar?.kind === 'icon') {
    return (
      <span style={{ ...box, fontSize: size * 0.6 }} className={`${frame} flex items-center justify-center bg-gradient-to-b from-red-950 to-slate-900 leading-none`}>
        {avatar.icon}
      </span>
    );
  }
  return (
    <svg viewBox="0 0 32 32" style={box} className={frame} aria-hidden>
      <rect width="32" height="32" fill="#cbd5e1" />
      <circle cx="16" cy="12.5" r="6" fill="#f8fafc" />
      <path d="M4 32c0-7.2 5.4-11.5 12-11.5S28 24.8 28 32z" fill="#f8fafc" />
    </svg>
  );
}
