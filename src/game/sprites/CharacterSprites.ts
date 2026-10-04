import Phaser from 'phaser';
import type { InvaderType, UnitClass } from '../../types/game';
import { ANIMATION_ORDER, AnimationName, DIRECTION_COUNT, directionFromVector } from './VoxelSprite';
import { ENEMY_MODELS, INVADER_SPRITE } from './enemyModels';
import { MINION_MODELS, UNIT_SPRITE } from './minionModels';
import type { BakedSheet } from './spriteBake.worker';
import { useLoadProgress } from '../loadProgress';

/**
 * Phaser glue for the baked 8-direction character sprite sheets (minions and
 * invaders).
 *
 * Sheets are rendered once per page load by two Web Workers (minions first,
 * since they are on screen from the start) and cached here at module level,
 * so a new Phaser.Game (e.g. after Regression) re-creates its textures
 * instantly instead of re-baking.
 */

const bakedSheets = new Map<string, BakedSheet>();
let workers: Worker[] = [];
const listeners = new Set<(sheet: BakedSheet) => void>();

const textureKey = (key: string) => `char-${key}`;
const animKey = (key: string, anim: AnimationName, dir: number) => `char-${key}-${anim}-${dir}`;
const FRAME_RATES: Record<AnimationName, number> = { walk: 8, attack: 10, idle: 2.5 };
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
    const { start, count } = sheet.layout.animations[anim];
    for (let d = 0; d < DIRECTION_COUNT; d++) {
      const k = animKey(sheet.key, anim, d);
      if (scene.anims.exists(k)) continue;
      scene.anims.create({
        key: k,
        frames: Array.from({ length: count }, (_, i) => ({ key, frame: `${d}_${start + i}` })),
        frameRate: FRAME_RATES[anim],
        repeat: anim === 'attack' ? 0 : -1,
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
  progress.setTotal('characters', Object.keys(MINION_MODELS).length + Object.keys(ENEMY_MODELS).length);
  progress.setDone('characters', bakedSheets.size);

  const onSheet = (sheet: BakedSheet) => {
    if (scene.sys.isActive() || scene.sys.isSleeping()) installSheet(scene, sheet);
  };
  listeners.add(onSheet);
  scene.events.once(Phaser.Scenes.Events.DESTROY, () => listeners.delete(onSheet));
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => listeners.delete(onSheet));

  if (workers.length > 0) return;
  const batches = [Object.keys(MINION_MODELS), Object.keys(ENEMY_MODELS)].map((keys) =>
    keys.filter((k) => !bakedSheets.has(k))
  );
  workers = batches
    .filter((batch) => batch.length > 0)
    .map((batch) => {
      const worker = new Worker(new URL('./spriteBake.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<BakedSheet>) => {
        bakedSheets.set(event.data.key, event.data);
        useLoadProgress.getState().setDone('characters', bakedSheets.size);
        listeners.forEach((listener) => listener(event.data));
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
    if (anim.key.includes('-attack-')) sprite.anims.play(animKey(key, 'idle', sprite.getData('dir') as number));
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

/**
 * Turns the sprite toward a screen-space vector. Moving plays the walk cycle,
 * standing still plays the idle loop. An attack in progress is never cut off.
 */
export function faceCharacterSprite(sprite: Phaser.GameObjects.Sprite, dx: number, dy: number, moving: boolean): void {
  const key = sprite.getData('spriteKey') as string;
  const dir = directionFromVector(dx, dy, sprite.getData('dir') as number);
  sprite.setData('dir', dir);
  if (sprite.anims.isPlaying && currentAnim(sprite).includes('-attack-')) return;
  const next = animKey(key, moving ? 'walk' : 'idle', dir);
  if (currentAnim(sprite) !== next) {
    // Keep the cycle's phase when only the direction changes
    const progress = sprite.anims.isPlaying ? sprite.anims.getProgress() : 0;
    sprite.anims.play(next);
    if (currentAnim(sprite).split('-')[2] === (moving ? 'walk' : 'idle')) sprite.anims.setProgress(progress);
  }
}

/** Plays the one-shot attack / work swing in the sprite's current direction. */
export function playCharacterAttack(sprite: Phaser.GameObjects.Sprite): void {
  const key = sprite.getData('spriteKey') as string;
  sprite.anims.play(animKey(key, 'attack', sprite.getData('dir') as number));
}

/** Plays the attack once unless one is already playing (for repeated work swings). */
export function playCharacterWork(sprite: Phaser.GameObjects.Sprite): void {
  if (sprite.anims.isPlaying && currentAnim(sprite).includes('-attack-')) return;
  playCharacterAttack(sprite);
}

// Enemy-facing aliases kept for InvasionManager readability
export const faceEnemySprite = faceCharacterSprite;
export const playEnemyAttack = playCharacterAttack;
