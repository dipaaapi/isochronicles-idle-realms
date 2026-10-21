import { create } from 'zustand';

/**
 * Player profile for the Hall of Legacy: a name and an optional avatar (an
 * uploaded picture, an icon, or a General's portrait; none = the blank
 * silhouette). Kept on this device apart from the realm save, so it survives
 * game overs and new realms.
 */

export type Avatar =
  | { kind: 'none' }
  | { kind: 'image'; src: string }
  | { kind: 'icon'; icon: string }
  | { kind: 'general'; unitClass: string };

export interface PlayerProfile { name: string; avatar: Avatar }

const KEY = 'isochronicle_player_profile';
const MAX_IMAGE_CHARS = 200_000;
export const AVATAR_PX = 128;

/** Only well-formed avatars: image data URLs of a sane size, short icons, class ids. */
export function sanitizeAvatar(raw: unknown): Avatar {
  const a = raw as Partial<Record<string, unknown>> | null;
  if (!a || typeof a !== 'object') return { kind: 'none' };
  if (a.kind === 'image' && typeof a.src === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(a.src) && a.src.length <= MAX_IMAGE_CHARS) return { kind: 'image', src: a.src };
  if (a.kind === 'icon' && typeof a.icon === 'string' && a.icon.length > 0 && a.icon.length <= 8) return { kind: 'icon', icon: a.icon };
  if (a.kind === 'general' && typeof a.unitClass === 'string' && /^[A-Z_]{2,32}$/.test(a.unitClass)) return { kind: 'general', unitClass: a.unitClass };
  return { kind: 'none' };
}

const cleanName = (n: unknown) => (typeof n === 'string' ? n.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 32) : '');

function load(): PlayerProfile {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return { name: cleanName(raw?.name), avatar: sanitizeAvatar(raw?.avatar) };
  } catch {
    return { name: '', avatar: { kind: 'none' } };
  }
}

export const useProfile = create<PlayerProfile & { save: (p: Partial<PlayerProfile>) => void }>((set, get) => ({
  ...load(),
  save: (p) => {
    const next = { name: p.name !== undefined ? cleanName(p.name) : get().name, avatar: p.avatar ? sanitizeAvatar(p.avatar) : get().avatar };
    set(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage full or blocked */ }
  },
}));

export const getProfile = (): PlayerProfile => {
  const { name, avatar } = useProfile.getState();
  return { name, avatar };
};

/** Reads a picked image file into a small square avatar (centre crop, WebP/JPEG). */
export async function imageFileToAvatar(file: File): Promise<Avatar> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('type');
  if (file.size > 8 * 1024 * 1024) throw new Error('size');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode'));
      el.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_PX;
    canvas.height = AVATAR_PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
    let src = canvas.toDataURL('image/webp', 0.85);
    if (!src.startsWith('data:image/webp')) src = canvas.toDataURL('image/jpeg', 0.85);
    return sanitizeAvatar({ kind: 'image', src });
  } finally {
    URL.revokeObjectURL(url);
  }
}
