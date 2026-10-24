import Phaser from 'phaser';
import localforage from 'localforage';
import { STRUCTURE_MODELS, StructureKey } from './structureModels';
import { useLoadProgress } from '../loadProgress';
import type { BakedStrip } from './structureBake.worker';
import { DETAIL } from './structureStates';

/**
 * Phaser glue for baked building / portal strips. Baked once per page load in
 * a Web Worker (started before the character bakes, since structures are
 * on screen first) and cached here so a remounted game re-uses them.
 */

/** World units per strip pixel: strips are baked DETAIL× finer than the island tiles (2 units per art pixel). */
export const STRUCTURE_PIXEL = 2 / DETAIL;

const baked = new Map<StructureKey, BakedStrip>();
const listeners = new Set<(strip: BakedStrip) => void>();
let workers: Worker[] = [];

const textureKey = (key: StructureKey) => `struct-${key}`;

/** Top-left pixel of frame `c` inside a (grid-wrapped) strip. */
export function stripFrameOrigin(strip: BakedStrip, c: number): { x: number; y: number } {
  const perRow = strip.perRow || strip.layout.columns;
  return { x: (c % perRow) * strip.layout.frameWidth, y: Math.floor(c / perRow) * strip.layout.frameHeight };
}
export const structureAnimKey = (key: StructureKey, anim: string) => `struct-${key}-${anim}`;

function install(scene: Phaser.Scene, strip: BakedStrip): void {
  const key = textureKey(strip.key);
  if (!scene.textures.exists(key)) {
    const texture = scene.textures.createCanvas(key, strip.width, strip.height);
    if (!texture) return;
    texture.context.putImageData(new ImageData(new Uint8ClampedArray(strip.data), strip.width, strip.height), 0, 0);
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    for (let c = 0; c < strip.layout.columns; c++) {
      const { x, y } = stripFrameOrigin(strip, c);
      texture.add(`${c}`, 0, x, y, strip.layout.frameWidth, strip.layout.frameHeight);
    }
    texture.refresh();
  }
  for (const [anim, { start, count }] of Object.entries(strip.layout.animations)) {
    const k = structureAnimKey(strip.key, anim);
    if (scene.anims.exists(k)) continue;
    scene.anims.create({
      key: k,
      frames: Array.from({ length: count }, (_, i) => ({ key, frame: `${start + i}` })),
      frameRate: strip.rates[anim] ?? 4,
      repeat: strip.loops.includes(anim) ? -1 : 0,
    });
  }
}

/** Installs cached strips and starts the background bake (once per page). */
export function prepareStructureSprites(scene: Phaser.Scene, onReady?: (key: StructureKey) => void): void {
  for (const strip of baked.values()) install(scene, strip);
  const progress = useLoadProgress.getState();
  progress.setTotal('structures', Object.keys(STRUCTURE_MODELS).length);
  progress.setDone('structures', baked.size);

  const onStrip = (strip: BakedStrip) => {
    if (!(scene.sys.isActive() || scene.sys.isSleeping())) return;
    install(scene, strip);
    onReady?.(strip.key);
  };
  listeners.add(onStrip);
  scene.events.once(Phaser.Scenes.Events.DESTROY, () => listeners.delete(onStrip));
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => listeners.delete(onStrip));

  startStructureBake();
}

/**
 * Baked strips are cached in IndexedDB keyed by a fingerprint of the model (as
 * the character sheets are), so after a browser restart every structure, the
 * volcano's wave-stage looks included, shows at once instead of falling back
 * to its stand-in until a fresh bake lands. Bump CACHE_VERSION when the baker
 * or structureStates change without a model change; dev builds skip the cache.
 */
const stripCache = localforage.createInstance({ name: 'IsoChronicle_IdleRealms', storeName: 'structure_cache' });
const CACHE_VERSION = 1;
const useCache = !import.meta.env?.DEV;
/** Baked first: the citadel, rifts and spire are on screen at once, and the volcano shows the wave count. */
const BAKE_FIRST: StructureKey[] = ['castle', 'portal', 'spire', 'volcano'];

function fingerprint(key: StructureKey): string {
  const text = `${CACHE_VERSION}|${DETAIL}|${JSON.stringify(STRUCTURE_MODELS[key]())}`;
  let h = 0x811c9dc5; // FNV-1a
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

const publishStrip = (strip: BakedStrip) => {
  baked.set(strip.key, strip);
  useLoadProgress.getState().setDone('structures', baked.size);
  listeners.forEach((listener) => listener(strip));
};

/** Starts the background bake once per page (also used by the Atlas, which has no scene). */
function startStructureBake(): void {
  if (workers.length > 0 || bakeClaimed) return;
  bakeClaimed = true;
  void loadCachedThenBake();
}
let bakeClaimed = false;

async function loadCachedThenBake(): Promise<void> {
  const keys = Object.keys(STRUCTURE_MODELS) as StructureKey[];
  const prints = new Map<StructureKey, string>();
  if (useCache) {
    for (const key of keys) {
      if (baked.has(key)) continue;
      const print = fingerprint(key);
      prints.set(key, print);
      try {
        const cached = await stripCache.getItem<BakedStrip>(`${key}:${print}`);
        if (cached) publishStrip(cached);
      } catch {
        /* no cache (private window, quota) — bake instead */
      }
    }
  }
  const ordered = [...BAKE_FIRST, ...keys.filter((k) => !BAKE_FIRST.includes(k))];
  const missing = ordered.filter((k) => !baked.has(k));
  if (!missing.length) return;
  // Two workers, alternating keys, so the first few (citadel, portals, spire) land together
  workers = [0, 1]
    .map((w) => missing.filter((_, i) => i % 2 === w))
    .filter((batch) => batch.length > 0)
    .map((batch) => {
      const worker = new Worker(new URL('./structureBake.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<BakedStrip>) => {
        const strip = event.data;
        publishStrip(strip);
        const print = prints.get(strip.key);
        if (print) void stripCache.setItem(`${strip.key}:${print}`, strip).catch(() => undefined);
      };
      worker.postMessage(batch);
      return worker;
    });
}

/**
 * The exact strips the game draws, for previews outside Phaser (the Atlas).
 * Calls back with every strip already baked and each one as it lands;
 * returns an unsubscribe.
 */
export function subscribeStructureStrips(listener: (strip: BakedStrip) => void): () => void {
  for (const strip of baked.values()) listener(strip);
  listeners.add(listener);
  startStructureBake();
  return () => listeners.delete(listener);
}

export const isStructureReady = (scene: Phaser.Scene, key: StructureKey): boolean =>
  baked.has(key) && scene.textures.exists(textureKey(key));

/** A sprite for a structure (anchored at its footprint centre), or null while baking. */
export function createStructureSprite(scene: Phaser.Scene, key: StructureKey, anim: string): Phaser.GameObjects.Sprite | null {
  const strip = baked.get(key);
  if (!strip || !scene.textures.exists(textureKey(key))) return null;
  const first = strip.layout.animations[anim]?.start ?? 0;
  const sprite = scene.add.sprite(0, 0, textureKey(key), `${first}`);
  sprite.setOrigin(strip.layout.anchorX / strip.layout.frameWidth, strip.layout.anchorY / strip.layout.frameHeight);
  sprite.setScale(STRUCTURE_PIXEL);
  sprite.setData('structureKey', key);
  playStructureAnim(sprite, anim);
  return sprite;
}

/** Plays a named structure animation unless it is already running. */
export function playStructureAnim(sprite: Phaser.GameObjects.Sprite, anim: string, restart = false): void {
  const key = sprite.getData('structureKey') as StructureKey;
  const animKey = structureAnimKey(key, anim);
  if (!sprite.scene?.anims.exists(animKey)) return;
  if (!restart && sprite.anims.currentAnim?.key === animKey && sprite.anims.isPlaying) return;
  sprite.anims.play(animKey);
}

/** Height (world units) of a structure sprite above its anchor — for HP bars and effect origins. */
export function structureHeadroom(key: StructureKey): number | null {
  const strip = baked.get(key);
  return strip ? strip.headroom * STRUCTURE_PIXEL : null;
}

/** Whether this structure's strip has the named state (HD-derived states may be missing on old caches). */
export function hasStructureAnim(sprite: Phaser.GameObjects.Sprite, anim: string): boolean {
  const key = sprite.getData('structureKey') as StructureKey;
  return !!sprite.scene?.anims.exists(structureAnimKey(key, anim));
}

/** Holds one frame of a state, e.g. the construction stage matching build progress (0–1). */
export function showStructureStage(sprite: Phaser.GameObjects.Sprite, anim: string, progress: number): boolean {
  const key = sprite.getData('structureKey') as StructureKey;
  const slot = baked.get(key)?.layout.animations[anim];
  if (!slot) return false;
  const index = Math.min(slot.count - 1, Math.max(0, Math.floor(progress * slot.count)));
  const frame = `${slot.start + index}`;
  if (sprite.anims.isPlaying) sprite.anims.stop();
  if (sprite.frame.name !== frame) sprite.setFrame(frame);
  return true;
}

/** Plays `first` once (e.g. collapse), then settles on `then` (e.g. ruined). Falls back to `then`. */
export function playStructureSequence(sprite: Phaser.GameObjects.Sprite, first: string, then: string): void {
  if (!hasStructureAnim(sprite, first)) return playStructureAnim(sprite, then, true);
  playStructureAnim(sprite, first, true);
  const key = structureAnimKey(sprite.getData('structureKey') as StructureKey, first);
  sprite.once(`${Phaser.Animations.Events.ANIMATION_COMPLETE_KEY}${key}`, () => sprite.active && playStructureAnim(sprite, then, true));
}
