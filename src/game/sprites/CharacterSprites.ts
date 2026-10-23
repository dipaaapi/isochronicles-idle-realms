import Phaser from 'phaser';
import type { InvaderType, UnitClass } from '../../types/game';
import { ANIMATION_ORDER, AnimationName, DIRECTION_COUNT, directionFromVector } from './VoxelSprite';
import { ENEMY_MODELS, INVADER_SPRITE } from './enemyModels';
import { MINION_MODELS, UNIT_SPRITE } from './minionModels';
import { SEA_MODELS, type SeaSpriteKey } from './seaModels';
import { LAIR_MODELS, type LairSpriteKey } from './lairModels';
import type { BakedSheet } from './spriteBake.worker';
import { useLoadProgress } from '../loadProgress';
import MOVEMENT from '../../data/minionMovement.json';
import localforage from 'localforage';

/**
 * Phaser glue for the baked 8-direction character sprite sheets (minions and
 * invaders).
 *
 * Sheets are rendered once per page load by two Web Workers (minions first,
 * since they are on screen from the start) and cached here at module level,
 * so a new Phaser.Game (e.g. a new realm after game over) re-creates its textures
 * instantly instead of re-baking.
 */

const bakedSheets = new Map<string, BakedSheet>();
let workers: Worker[] = [];
const listeners = new Set<(sheet: BakedSheet) => void>();

const textureKey = (key: string) => `char-${key}`;
const animKey = (key: string, anim: AnimationName, dir: number) => `char-${key}-${anim}-${dir}`;
const FRAME_RATES: Record<AnimationName, number> = {
  walk: MOVEMENT.walkFps, attack: 10, idle: 2.5,
  run: MOVEMENT.walkFps * 1.6, tired: MOVEMENT.walkFps * 0.6, skill: 9, hit: 12, death: 7,
};
/** One-shot animations: they play once, then hand back to idle (death holds its last frame). */
const ONE_SHOT = new Set<AnimationName>(['attack', 'skill', 'hit', 'death']);
/** Gait loops chosen by faceCharacterSprite. */
export type Gait = 'walk' | 'run' | 'tired';
/** Walk frame shown for a single held pose (the "passing" pose). */
const HOLD_FRAME = 1;

function installSheet(scene: Phaser.Scene, sheet: BakedSheet): void {
  const key = textureKey(sheet.key);
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, sheet.width, sheet.height);
  if (!texture) return;
  texture.context.putImageData(new ImageData(new Uint8ClampedArray(sheet.data), sheet.width, sheet.height), 0, 0);
  texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

  const { frameWidth: fw, frameHeight: fh, columns } = sheet.layout;
  for (let d = 0; d < DIRECTION_COUNT; d++) {
    for (let c = 0; c < columns; c++) texture.add(`${d}_${c}`, 0, c * fw, d * fh, fw, fh);
  }
  texture.refresh();

  for (const anim of ANIMATION_ORDER) {
    const slot = sheet.layout.animations[anim];
    if (!slot) continue;
    const { start, count } = slot;
    for (let d = 0; d < DIRECTION_COUNT; d++) {
      const k = animKey(sheet.key, anim, d);
      if (scene.anims.exists(k)) continue;
      scene.anims.create({
        key: k,
        frames: Array.from({ length: count }, (_, i) => ({ key, frame: `${d}_${start + i}` })),
        frameRate: FRAME_RATES[anim],
        repeat: ONE_SHOT.has(anim) ? 0 : -1,
      });
    }
  }
}

/**
 * Makes character sprites available in this scene: installs cached sheets now
 * and starts the background bake (once per page) for any that are missing.
 */
export function prepareCharacterSprites(scene: Phaser.Scene): void {
  for (const sheet of bakedSheets.values()) installSheet(scene, sheet);
  const progress = useLoadProgress.getState();
  progress.setTotal('characters', Object.keys(MINION_MODELS).length + Object.keys(ENEMY_MODELS).length + Object.keys(SEA_MODELS).length + Object.keys(LAIR_MODELS).length);
  progress.setDone('characters', bakedSheets.size);

  const onSheet = (sheet: BakedSheet) => {
    if (scene.sys.isActive() || scene.sys.isSleeping()) installSheet(scene, sheet);
  };
  listeners.add(onSheet);
  scene.events.once(Phaser.Scenes.Events.DESTROY, () => listeners.delete(onSheet));
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => listeners.delete(onSheet));

  if (workers.length > 0) return;
  workers = [] as Worker[]; // claims the bake so a second scene doesn't start one while the cache loads
  void loadCachedThenBake();
}

/**
 * Baked sheets are cached in IndexedDB keyed by a fingerprint of the model, so
 * only the first launch (or a changed model) pays for ray-casting. Later
 * launches show every character immediately.
 */
const sheetCache = localforage.createInstance({ name: 'IsoChronicle_IdleRealms', storeName: 'sprite_cache' });
const CACHE_VERSION = 1;

function fingerprint(key: string): string {
  const make = MINION_MODELS[key as keyof typeof MINION_MODELS] ?? ENEMY_MODELS[key as keyof typeof ENEMY_MODELS] ?? SEA_MODELS[key as SeaSpriteKey] ?? LAIR_MODELS[key as LairSpriteKey];
  const text = `${CACHE_VERSION}|${JSON.stringify(make())}`;
  let h = 0x811c9dc5; // FNV-1a
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

const publish = (sheet: BakedSheet) => {
  bakedSheets.set(sheet.key, sheet);
  useLoadProgress.getState().setDone('characters', bakedSheets.size);
  listeners.forEach((listener) => listener(sheet));
};

async function loadCachedThenBake(): Promise<void> {
  const prints = new Map<string, string>();
  for (const key of [...Object.keys(MINION_MODELS), ...Object.keys(ENEMY_MODELS), ...Object.keys(SEA_MODELS), ...Object.keys(LAIR_MODELS)]) {
    if (bakedSheets.has(key)) continue;
    const print = fingerprint(key);
    prints.set(key, print);
    try {
      const cached = await sheetCache.getItem<BakedSheet>(`${key}:${print}`);
      if (cached) publish(cached);
    } catch {
      /* no cache (private window, quota) — bake instead */
    }
  }

  // Spread the bake over the spare cores (2–4 workers), minions dealt out first so they appear first
  const missing = [...Object.keys(MINION_MODELS), ...Object.keys(ENEMY_MODELS), ...Object.keys(SEA_MODELS), ...Object.keys(LAIR_MODELS)].filter((k) => !bakedSheets.has(k));
  const count = Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
  const batches: string[][] = Array.from({ length: count }, () => []);
  missing.forEach((key, i) => batches[i % count].push(key));
  workers = batches
    .filter((batch) => batch.length > 0)
    .map((batch) => {
      const worker = new Worker(new URL('./spriteBake.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<BakedSheet>) => {
        const sheet = event.data;
        publish(sheet);
        const print = prints.get(sheet.key);
        if (print) void sheetCache.setItem(`${sheet.key}:${print}`, sheet).catch(() => undefined);
      };
      worker.postMessage(batch);
      return worker;
    });
}

function createSprite(scene: Phaser.Scene, key: string): Phaser.GameObjects.Sprite | null {
  const sheet = bakedSheets.get(key);
  if (!sheet || !scene.textures.exists(textureKey(key))) return null;

  const sprite = scene.add.sprite(0, 0, textureKey(key), `0_${HOLD_FRAME}`);
  sprite.setOrigin(sheet.layout.anchorX / sheet.layout.frameWidth, sheet.layout.anchorY / sheet.layout.frameHeight);
  sprite.setData('spriteKey', key);
  sprite.setData('dir', 0);
  sprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, (anim: Phaser.Animations.Animation) => {
    const name = anim.key.split('-')[2] as AnimationName;
    if (name !== 'death' && ONE_SHOT.has(name)) sprite.anims.play(animKey(key, 'idle', sprite.getData('dir') as number));
  });
  sprite.anims.play(animKey(key, 'idle', 0));
  // Desync idle loops so a crowd doesn't breathe in unison
  sprite.anims.setProgress(Math.random());
  return sprite;
}

/** Sprite for an invader type, or null while its sheet is still baking. */
export function createEnemySprite(scene: Phaser.Scene, type: InvaderType): Phaser.GameObjects.Sprite | null {
  return createSprite(scene, INVADER_SPRITE[type]);
}

/** Sprite for a minion class, or null while its sheet is still baking. */
export function createMinionSprite(scene: Phaser.Scene, unitClass: UnitClass): Phaser.GameObjects.Sprite | null {
  return createSprite(scene, UNIT_SPRITE[unitClass]);
}

/** Sea Folk creature sprite (mermaid, piranha, kappa, leviathan), or null while baking. */
export function createSeaSprite(scene: Phaser.Scene, key: SeaSpriteKey): Phaser.GameObjects.Sprite | null {
  return createSprite(scene, key);
}

/** Dragon's Lair creature sprite (bat, dragon kin, Magma Golem), or null while baking. */
export function createLairSprite(scene: Phaser.Scene, key: LairSpriteKey): Phaser.GameObjects.Sprite | null {
  return createSprite(scene, key);
}

export function seaSpriteHeadroom(key: SeaSpriteKey): number | null {
  return bakedSheets.get(key)?.headroom ?? null;
}

/** Mini sapling summoned by the Sapling Grove, or null while its sheet is still baking. */
export function createSaplingSprite(scene: Phaser.Scene): Phaser.GameObjects.Sprite | null {
  return createSprite(scene, 'sapling');
}

/** Height of an invader sprite above its feet — used to place HP bars above the head. */
export function enemySpriteHeadroom(type: InvaderType): number | null {
  return bakedSheets.get(INVADER_SPRITE[type])?.headroom ?? null;
}

export function minionSpriteHeadroom(unitClass: UnitClass): number | null {
  return bakedSheets.get(UNIT_SPRITE[unitClass])?.headroom ?? null;
}

const currentAnim = (sprite: Phaser.GameObjects.Sprite) => sprite.anims.currentAnim?.key ?? '';
const currentName = (sprite: Phaser.GameObjects.Sprite) => currentAnim(sprite).split('-')[2] as AnimationName | undefined;
const hasAnim = (sprite: Phaser.GameObjects.Sprite, anim: AnimationName) =>
  !!bakedSheets.get(sprite.getData('spriteKey') as string)?.layout.animations[anim];
/** A one-shot (attack, skill, flinch, death) that must not be cut off by the gait loop. */
const busy = (sprite: Phaser.GameObjects.Sprite) => {
  const name = currentName(sprite);
  return !!name && ONE_SHOT.has(name) && (sprite.anims.isPlaying || name === 'death');
};

/**
 * Turns the sprite toward a screen-space vector. Moving plays the gait cycle
 * (walk, or run / tired when the sheet has them), standing still plays the
 * idle loop. A one-shot in progress is never cut off.
 */
export function faceCharacterSprite(sprite: Phaser.GameObjects.Sprite, dx: number, dy: number, moving: boolean, gait: Gait = 'walk'): void {
  const key = sprite.getData('spriteKey') as string;
  const dir = directionFromVector(dx, dy, sprite.getData('dir') as number);
  sprite.setData('dir', dir);
  if (busy(sprite)) return;
  const loop: AnimationName = !moving ? 'idle' : gait !== 'walk' && hasAnim(sprite, gait) ? gait : 'walk';
  const next = animKey(key, loop, dir);
  if (currentAnim(sprite) !== next) {
    // Keep the cycle's phase when only the direction changes
    const progress = sprite.anims.isPlaying ? sprite.anims.getProgress() : 0;
    const same = currentName(sprite) === loop;
    sprite.anims.play(next);
    if (same) sprite.anims.setProgress(progress);
  }
}

function playOnce(sprite: Phaser.GameObjects.Sprite, anim: AnimationName): void {
  if (currentName(sprite) === 'death') return;
  const key = sprite.getData('spriteKey') as string;
  sprite.anims.play(animKey(key, hasAnim(sprite, anim) ? anim : 'attack', sprite.getData('dir') as number));
}

/** Plays the one-shot attack / work swing in the sprite's current direction. */
export function playCharacterAttack(sprite: Phaser.GameObjects.Sprite): void {
  playOnce(sprite, 'attack');
}

/** Plays the attack once unless a one-shot is already playing (for repeated work swings). */
export function playCharacterWork(sprite: Phaser.GameObjects.Sprite): void {
  if (busy(sprite)) return;
  playCharacterAttack(sprite);
}

/** Wind-up and release for a skill or ultimate (falls back to the attack swing). */
export function playCharacterSkill(sprite: Phaser.GameObjects.Sprite): void {
  playOnce(sprite, 'skill');
}

/** Flinch on taking damage. Doesn't interrupt a swing or a cast; models without one just skip it. */
export function playCharacterHit(sprite: Phaser.GameObjects.Sprite): void {
  if (!hasAnim(sprite, 'hit') || busy(sprite)) return;
  playOnce(sprite, 'hit');
}

/**
 * Plays the death collapse and calls `onDone` when it ends (right away if the
 * model has no death animation). The last frame is held.
 */
export function playCharacterDeath(sprite: Phaser.GameObjects.Sprite, onDone: () => void): void {
  const key = sprite.getData('spriteKey') as string;
  if (!hasAnim(sprite, 'death')) return onDone();
  const k = animKey(key, 'death', sprite.getData('dir') as number);
  sprite.anims.play(k);
  sprite.once(`${Phaser.Animations.Events.ANIMATION_COMPLETE_KEY}${k}`, onDone);
}

// Enemy-facing aliases kept for InvasionManager readability
export const faceEnemySprite = faceCharacterSprite;
export const playEnemyAttack = playCharacterAttack;
