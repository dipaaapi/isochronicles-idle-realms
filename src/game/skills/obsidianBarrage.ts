import Phaser from 'phaser';
import { halo, sparkBurst } from './glowFx';
import TUNING from '../../data/obsidianBarrage.json';

type Point = { x: number; y: number };
type Layer = Phaser.GameObjects.Container;

const hex = (s: string) => Phaser.Display.Color.HexStringToColor(s).color;
const C = Object.fromEntries(Object.entries(TUNING.colors).map(([k, v]) => [k, hex(v)])) as Record<keyof typeof TUNING.colors, number>;

/** Lifecycle states of one monolith, each drawn with its own frames. */
type State = 'summon' | 'hover' | 'charge' | 'fly' | 'lock' | 'fire' | 'shatter';

interface Crystal {
  g: Phaser.GameObjects.Graphics;
  x: number;
  y: number;
  /** Ground point the monolith hovers over (for its shadow). */
  groundY: number;
  state: State;
  t: number;
  targets: Point[];
  shot: number;
  tilt: number;
  scale: number;
}

/**
 * Earth Titan Cataclysm, after the trailer: cracked obsidian monoliths are torn
 * out of the castle (summon), hang in an arc above it (hover), gather red light
 * (charge), sail over the invaders (fly), lock a thin guide ray (lock), fire a
 * thick red beam that scorches the ground (fire, once per target), then crack
 * apart into falling shards (shatter). Visual only; damage is applied by SkillSystem.
 */
export function playObsidianBarrage(scene: Phaser.Scene, layer: Layer, tilePx: number, castle: Point, targets: Point[]): void {
  const T = TUNING;
  const count = Math.max(1, Math.min(T.maxCrystals, targets.length || 3));
  const beam = scene.add.graphics();
  const shadows = scene.add.graphics();
  layer.add(shadows);
  layer.add(beam);

  const crystals: Crystal[] = [];
  for (let i = 0; i < count; i++) {
    const g = scene.add.graphics();
    layer.add(g);
    crystals.push({
      g, x: castle.x, y: castle.y - tilePx * 0.6, groundY: castle.y,
      state: 'summon', t: -i * T.summon.stagger,
      targets: targets.filter((_, k) => k % count === i), shot: 0,
      tilt: (i - (count - 1) / 2) * 0.12, scale: 0.35,
    });
  }

  // Castle wake-up: a red rune ring and rubble kicked loose as the stones tear free.
  halo(scene, layer, castle, tilePx * 2.6, C.crack, 900);
  sparkBurst(scene, layer, castle, 0x8b7e93, 16, tilePx * 1.4, 18);
  scene.cameras.main.shake(220, 0.003);

  const slot = (i: number): Point => {
    const span = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
    return {
      x: castle.x + span * tilePx * T.summon.spreadTiles,
      y: castle.y - tilePx * (T.summon.riseTiles + (1 - Math.abs(span)) * 0.6),
    };
  };
  const scorches: { at: Point; t: number }[] = [];
  const embers: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
  const shards: { x: number; y: number; vx: number; vy: number; rot: number; vr: number; life: number; size: number }[] = [];

  const onUpdate = (_time: number, delta: number) => {
    beam.clear();
    shadows.clear();
    const frame = Math.floor(scene.time.now / T.frameMs);

    crystals.forEach((c, i) => {
      c.t += delta;
      if (c.t < 0 && c.state === 'summon') return;
      const home = slot(i);
      switch (c.state) {
        case 'summon': {
          const k = Phaser.Math.Easing.Back.Out(Math.min(1, c.t / T.summon.duration));
          c.x = castle.x + (home.x - castle.x) * k;
          c.y = castle.y - tilePx * 0.6 + (home.y - castle.y + tilePx * 0.6) * k;
          c.scale = 0.35 + 0.65 * k;
          if (Math.random() < 0.4) embers.push({ x: c.x, y: c.y + 10, vx: (Math.random() - 0.5) * 30, vy: 40 + Math.random() * 40, life: 500 });
          if (c.t >= T.summon.duration) next(c, 'hover');
          break;
        }
        case 'hover':
          c.x = home.x;
          c.y = home.y + Math.sin((c.t + i * 200) / 180) * tilePx * T.hover.bobTiles;
          if (c.t >= T.hover.duration) next(c, 'charge');
          break;
        case 'charge':
          c.y = home.y + Math.sin(c.t / 40) * 1.2;
          if (Math.random() < 0.6) {
            const a = Math.random() * Math.PI * 2;
            embers.push({ x: c.x + Math.cos(a) * 26, y: c.y + Math.sin(a) * 26, vx: -Math.cos(a) * 70, vy: -Math.sin(a) * 70, life: 340 });
          }
          if (c.t >= T.charge.duration) next(c, c.targets.length ? 'fly' : 'shatter');
          break;
        case 'fly': {
          const to = c.targets[c.shot];
          const k = Math.min(1, delta / Math.max(1, T.fly.duration - c.t + delta));
          c.x += (to.x - c.x) * k;
          c.y += (to.y - tilePx * T.fly.heightTiles - c.y) * k;
          c.tilt *= 0.9;
          if (c.t >= T.fly.duration) next(c, 'lock');
          break;
        }
        case 'lock': {
          const to = c.targets[c.shot];
          const a = 0.35 + 0.35 * Math.sin(c.t / 30);
          beam.lineStyle(1, C.beam, a);
          beam.lineBetween(c.x, c.y + 14 * c.scale, to.x, to.y);
          const r = tilePx * (0.7 - 0.35 * Math.min(1, c.t / T.lock.duration));
          beam.lineStyle(2, C.beam, 0.8);
          beam.strokeEllipse(to.x, to.y, r * 2, r);
          if (c.t >= T.lock.duration) next(c, 'fire');
          break;
        }
        case 'fire': {
          const to = c.targets[c.shot];
          const k = c.t / T.fire.duration;
          const w = tilePx * T.fire.widthTiles * (k < 0.15 ? k / 0.15 : k > 0.75 ? (1 - k) / 0.25 : 1) * (0.85 + 0.15 * (frame % 2));
          const top = c.y + 14 * c.scale;
          beam.fillStyle(C.beam, 0.25);
          beam.fillRect(to.x - w * 1.8, top, w * 3.6, to.y - top);
          beam.fillStyle(C.beam, 0.85);
          beam.fillRect(to.x - w / 2, top, w, to.y - top);
          beam.fillStyle(C.beamCore, 0.95);
          beam.fillRect(to.x - w / 6, top, w / 3, to.y - top);
          beam.fillStyle(C.beamCore, 0.8);
          beam.fillEllipse(to.x, to.y, w * 3.2, w * 1.4);
          c.y += Math.sin(c.t / 25) * 0.4; // recoil shiver
          if (Math.random() < 0.7) embers.push({ x: to.x + (Math.random() - 0.5) * tilePx * 0.6, y: to.y, vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 70, life: 600 });
          if (c.t >= T.fire.duration) {
            scorches.push({ at: to, t: 0 });
            halo(scene, layer, to, tilePx * 1.1, C.beam, 380, 6);
            sparkBurst(scene, layer, to, C.ember, 8, tilePx * 0.8, 4);
            c.shot++;
            if (c.shot < c.targets.length) { c.state = 'fly'; c.t = -T.fire.gap; } else next(c, 'shatter');
          }
          break;
        }
        case 'shatter':
          if (c.t >= 0 && !c.g.getData('broken')) {
            c.g.setData('broken', true);
            for (let s = 0; s < T.shatter.shards; s++) {
              shards.push({
                x: c.x, y: c.y, vx: (Math.random() - 0.5) * 120, vy: -40 - Math.random() * 60,
                rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, life: T.shatter.duration, size: 3 + Math.random() * 4,
              });
            }
            halo(scene, layer, { x: c.x, y: c.y }, tilePx * 0.8, C.crack, 300);
          }
          break;
      }
      c.groundY = c.state === 'summon' || c.state === 'hover' || c.state === 'charge' ? castle.y : c.targets[c.shot]?.y ?? castle.y;
      drawCrystal(c, frame, i);
    });

    // Scorch marks cool from orange to dark and fade.
    for (const s of [...scorches]) {
      s.t += delta;
      const k = s.t / 1400;
      if (k >= 1) { scorches.splice(scorches.indexOf(s), 1); continue; }
      shadows.fillStyle(C.scorch, 0.6 * (1 - k));
      shadows.fillEllipse(s.at.x, s.at.y, tilePx * 0.9, tilePx * 0.45);
      shadows.fillStyle(C.ember, 0.7 * Math.max(0, 1 - k * 3));
      shadows.fillEllipse(s.at.x, s.at.y, tilePx * 0.4, tilePx * 0.2);
    }
    const dt = delta / 1000;
    for (const e of [...embers]) {
      e.life -= delta;
      if (e.life <= 0) { embers.splice(embers.indexOf(e), 1); continue; }
      e.x += e.vx * dt; e.y += e.vy * dt;
      beam.fillStyle(e.life > 250 ? C.crackHot : C.ember, Math.min(1, e.life / 300));
      beam.fillRect(e.x - 1, e.y - 1, 2, 2);
    }
    for (const s of [...shards]) {
      s.life -= delta;
      if (s.life <= 0) { shards.splice(shards.indexOf(s), 1); continue; }
      s.vy += 260 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt;
      const a = Math.min(1, s.life / 250);
      const cs = Math.cos(s.rot) * s.size, sn = Math.sin(s.rot) * s.size;
      beam.fillStyle(C.body, a);
      beam.fillTriangle(s.x + cs, s.y + sn, s.x - sn, s.y + cs, s.x - cs * 0.6, s.y - sn * 0.6);
      beam.lineStyle(1, C.crack, a);
      beam.lineBetween(s.x + cs, s.y + sn, s.x - sn, s.y + cs);
    }

    const done = crystals.every((c) => c.state === 'shatter' && c.t > 0) && !scorches.length && !embers.length && !shards.length;
    if (done) {
      scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
      crystals.forEach((c) => c.g.destroy());
      beam.destroy();
      shadows.destroy();
    }
  };

  const next = (c: Crystal, state: State) => { c.state = state; c.t = 0; };

  /** Faceted monolith: 4 turn frames, red cracks that pulse with the state. */
  const drawCrystal = (c: Crystal, frame: number, i: number) => {
    const g = c.g;
    g.clear();
    if (c.state === 'shatter' && c.t > 0) return;
    if (c.t < 0 && c.state === 'summon') return;
    const s = tilePx * T.crystalSize * c.scale;
    const turn = (frame + i) % 4;
    const glow = c.state === 'charge' ? 0.6 + 0.4 * Math.sin(c.t / 35)
      : c.state === 'fire' ? 1 : c.state === 'lock' ? 0.8 : 0.45 + 0.2 * Math.sin((frame + i * 3) / 3);

    // Ground shadow under the monolith.
    shadows.fillStyle(0x000000, 0.25);
    shadows.fillEllipse(c.x, c.groundY, s * 1.4, s * 0.5);

    g.setPosition(c.x, c.y);
    g.setRotation(c.tilt);
    const w = s * (0.5 + 0.08 * Math.abs(2 - turn - 0.5));
    const top = { x: 0, y: -s * 1.25 }, bot = { x: 0, y: s * 1.1 };
    const l = { x: -w, y: -s * 0.15 }, r = { x: w, y: -s * 0.05 };
    const mid = { x: (turn - 1.5) * w * 0.35, y: -s * 0.1 };
    // Outer red bloom.
    g.fillStyle(C.crack, 0.12 * glow);
    g.fillEllipse(0, 0, s * 2.4, s * 3);
    // Two lit facets and two dark facets; the split line moves with the turn frame.
    g.fillStyle(C.facetLight, 1);
    g.fillTriangle(top.x, top.y, l.x, l.y, mid.x, mid.y);
    g.fillTriangle(l.x, l.y, bot.x, bot.y, mid.x, mid.y);
    g.fillStyle(C.facetDark, 1);
    g.fillTriangle(top.x, top.y, r.x, r.y, mid.x, mid.y);
    g.fillTriangle(r.x, r.y, bot.x, bot.y, mid.x, mid.y);
    g.lineStyle(1, C.edge, 0.9);
    g.strokePoints([top, l, bot, r], true);
    g.lineBetween(top.x, top.y, mid.x, mid.y);
    g.lineBetween(mid.x, mid.y, bot.x, bot.y);
    // Glowing crack veins.
    g.lineStyle(Math.max(1, s * 0.07), glow > 0.8 ? C.crackHot : C.crack, 0.55 + 0.45 * glow);
    g.lineBetween(mid.x - w * 0.6, -s * 0.7, mid.x, -s * 0.25);
    g.lineBetween(mid.x, -s * 0.25, mid.x + w * 0.4, s * 0.2);
    g.lineBetween(mid.x + w * 0.4, s * 0.2, mid.x - w * 0.1, s * 0.75);
    g.lineBetween(mid.x, -s * 0.25, mid.x - w * 0.55, s * 0.1);
    // Hot tip that fires the beam.
    g.fillStyle(C.crackHot, glow);
    g.fillCircle(bot.x, bot.y - s * 0.1, s * 0.12 * (0.6 + glow));
  };

  scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate));
}
