import Phaser from 'phaser';

/**
 * Sprite-sheet battle effects authored in Aseprite (art/skills/*.lua → public/skills):
 * flying projectiles with impacts, establishment fire stages, smoke puffs, the troop
 * transport and the paratrooper canopy. InvasionManager loads the sheets and registers
 * the scene/layer here; everything else just calls the spawn helpers.
 */

export type ProjectileKind = 'arrow' | 'orb' | 'fireball' | 'bullet' | 'plasma' | 'rock';
export type ImpactKind = 'spark' | 'burst' | 'explode';
export type FireStage = 'ignite' | 'burn' | 'blaze' | 'smoulder';

const SHEETS: Array<[string, string, Array<[tag: string, fps: number, repeat: number]>]> = [
  ['battle-projectiles', 'projectiles', [
    ['arrow', 14, -1], ['orb', 16, -1], ['fireball', 16, -1], ['bullet', 20, -1], ['plasma', 18, -1], ['rock', 12, -1],
    ['spark', 22, 0], ['burst', 20, 0], ['explode', 16, 0],
  ]],
  ['battle-fire', 'fire', [['ignite', 10, 0], ['burn', 12, -1], ['blaze', 14, -1], ['smoulder', 7, -1], ['smoke', 11, 0]]],
  ['battle-transport', 'troop-transport', [['fly', 11, -1], ['drop', 11, -1], ['damaged', 12, -1]]],
  ['battle-parachute', 'parachute', [['deploy', 14, 0], ['fall', 9, -1], ['land', 12, 0]]],
];

let scene: Phaser.Scene | null = null;
let layer: Phaser.GameObjects.Container | null = null;
let ready = false;

export function queueBattleFxSheets(s: Phaser.Scene, base: string): void {
  for (const [key, file] of SHEETS) s.load.aseprite(key, `${base}skills/${file}.png`, `${base}skills/${file}.json`);
}

/** Call after the loader completes. Builds every tag animation as `<key>:<tag>`. */
export function initBattleFx(s: Phaser.Scene, l: Phaser.GameObjects.Container | null): void {
  scene = s;
  layer = l;
  for (const [key, , tags] of SHEETS) {
    if (!s.textures.exists(key)) continue;
    s.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    const json = s.cache.json.get(key) as { meta?: { frameTags?: Array<{ name: string; from: number; to: number }> } } | undefined;
    for (const [tag, fps, repeat] of tags) {
      const anim = `${key}:${tag}`;
      if (s.anims.exists(anim)) continue;
      const range = json?.meta?.frameTags?.find((t) => t.name === tag);
      const count = range ? range.to - range.from : 0;
      s.anims.create({ key: anim, frames: s.anims.generateFrameNames(key, { prefix: `${tag}-`, start: 0, end: count }), frameRate: fps, repeat });
    }
  }
  ready = s.textures.exists('battle-projectiles');
}

export function battleFxReady(): boolean {
  return ready && !!scene?.sys?.isActive();
}

function add(obj: Phaser.GameObjects.Sprite): Phaser.GameObjects.Sprite {
  obj.setDepth(9500);
  layer?.add(obj);
  return obj;
}

export function spawnImpact(x: number, y: number, kind: ImpactKind, tint?: number, scale = 1.6): void {
  if (!battleFxReady() || !scene) return;
  const s = add(scene.add.sprite(x, y, 'battle-projectiles').setScale(scale).setRotation(Math.random() * Math.PI * 2));
  if (kind === 'explode') s.setRotation(0);
  if (tint !== undefined && kind === 'burst') s.setTint(tint);
  s.play(`battle-projectiles:${kind}`);
  s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy());
}

/** Fires a projectile from → to; `onHit` runs (and the impact plays) when it lands. */
export function shootProjectile(
  from: { x: number; y: number },
  to: { x: number; y: number },
  kind: ProjectileKind,
  opts: { tint?: number; impact?: ImpactKind; arc?: number; scale?: number; onHit?: () => void } = {}
): void {
  if (!battleFxReady() || !scene) { opts.onHit?.(); return; }
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const speed = kind === 'bullet' || kind === 'plasma' ? 900 : kind === 'arrow' ? 620 : 420;
  const duration = Math.max(90, (dist / speed) * 1000);
  const arc = opts.arc ?? (kind === 'arrow' || kind === 'rock' ? Math.min(60, dist * 0.25) : 0);
  const p = add(scene.add.sprite(from.x, from.y, 'battle-projectiles').setScale(opts.scale ?? 1.4));
  if (opts.tint !== undefined && kind === 'orb') p.setTint(opts.tint);
  p.play(`battle-projectiles:${kind}`);
  let lastX = from.x, lastY = from.y;
  scene.tweens.addCounter({
    from: 0, to: 1, duration, ease: 'Linear',
    onUpdate: (tw) => {
      const t = tw.getValue() ?? 0;
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t - Math.sin(Math.PI * t) * arc;
      if (kind !== 'rock') p.setRotation(Math.atan2(y - lastY, x - lastX));
      p.setPosition(x, y);
      lastX = x; lastY = y;
    },
    onComplete: () => {
      p.destroy();
      const impact = opts.impact ?? (kind === 'fireball' || kind === 'rock' ? 'explode' : kind === 'orb' ? 'burst' : 'spark');
      spawnImpact(to.x, to.y, impact, opts.tint);
      opts.onHit?.();
    },
  });
}

/** One smoke puff that rises and fades (engine trails, doused fires). */
export function spawnSmoke(x: number, y: number, scale = 1.2, drift = -8): void {
  if (!battleFxReady() || !scene) return;
  const s = add(scene.add.sprite(x, y, 'battle-fire').setScale(scale).setAlpha(0.9));
  s.play('battle-fire:smoke');
  scene.tweens.add({ targets: s, x: x + drift, y: y - 14, alpha: 0, duration: 760 });
  s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy());
}

/** Picks a projectile look for a unit from its name/role. */
export function projectileFor(name: string, magical: boolean): ProjectileKind {
  const n = name.toUpperCase();
  if (/ARCHER|RANGER|DRYAD|THORN/.test(n)) return 'arrow';
  if (/IMP|EMBER|LAVA|GARGOYLE|DRAGON|FIRE/.test(n)) return 'fireball';
  if (/TANK|SIEGE|GOLEM|MINOTAUR|QUARRY|CATAPULT/.test(n)) return 'rock';
  if (/DRONE|VALKYRIE|TITAN|SCOUT|PLASMA/.test(n)) return 'plasma';
  if (/MECHA|TECHNICIAN|GUN/.test(n)) return 'bullet';
  return magical ? 'orb' : 'arrow';
}
