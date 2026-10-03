import Phaser from 'phaser';
import { STRUCTURE_MODELS, StructureKey } from './structureModels';
import type { BakedStrip } from './structureBake.worker';

/**
 * Phaser glue for baked building / portal strips. Baked once per page load in
 * a Web Worker (started before the character bakes, since structures are
 * on screen first) and cached here so a remounted game re-uses them.
 */

/** World units per strip pixel — the same chunky pixel size as the island tiles. */
export const STRUCTURE_PIXEL = 2;

const baked = new Map<StructureKey, BakedStrip>();
const listeners = new Set<(strip: BakedStrip) => void>();
let workers: Worker[] = [];

const textureKey = (key: StructureKey) => `struct-${key}`;
export const structureAnimKey = (key: StructureKey, anim: string) => `struct-${key}-${anim}`;

function install(scene: Phaser.Scene, strip: BakedStrip): void {
  const key = textureKey(strip.key);
  if (!scene.textures.exists(key)) {
    const texture = scene.textures.createCanvas(key, strip.width, strip.height);
    if (!texture) return;
    texture.context.putImageData(new ImageData(new Uint8ClampedArray(strip.data), strip.width, strip.height), 0, 0);
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    for (let c = 0; c < strip.layout.columns; c++) {
      texture.add(`${c}`, 0, c * strip.layout.frameWidth, 0, strip.layout.frameWidth, strip.layout.frameHeight);
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

/** Starts the background bake once per page (also used by the Atlas, which has no scene). */
function startStructureBake(): void {
  if (workers.length > 0) return;
  const missing = (Object.keys(STRUCTURE_MODELS) as StructureKey[]).filter((k) => !baked.has(k));
  // Two workers, alternating keys, so the first few (citadel, portals, spire) land together
  workers = [0, 1]
    .map((w) => missing.filter((_, i) => i % 2 === w))
    .filter((batch) => batch.length > 0)
    .map((batch) => {
      const worker = new Worker(new URL('./structureBake.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<BakedStrip>) => {
        baked.set(event.data.key, event.data);
        listeners.forEach((listener) => listener(event.data));
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
