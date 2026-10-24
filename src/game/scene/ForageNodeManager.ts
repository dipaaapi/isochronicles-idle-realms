import Phaser from 'phaser';
import config from '../../data/forageNodes.json';
import { GRID_SIZE, isLandTile, isProtectedTile, isRaisedTile } from '../../state/buildingLayout';
import { useGameStore } from '../../state/useGameStore';
import { logMessage } from '../../state/activityLog';
import { IsometricHelper } from '../IsometricHelper';
import { soundFx } from '../audio/soundFx';
import {
  BUSH_BASE, BUSH_H, CANOPY_PIVOT, FOLIAGE_PARTICLE, FOLIAGE_SS, TREE_BASE, TREE_H,
  bushTexture, treeCanopyTexture, treeTrunkTexture, type FoliageKind, type Realm,
} from './foliageArt';

type State = 'growing' | 'idle' | 'harvesting';
interface Node {
  tile: { x: number; y: number };
  kind: FoliageKind;
  variant: number;
  realm: Realm;
  /** Carries arcane essence: shimmers, and pays essence on top of the logs. */
  essence: boolean;
  state: State;
  object: Phaser.GameObjects.Container;
  /** The swaying part: the canopy of a tree, the whole bush. */
  sway: Phaser.GameObjects.Image;
  trunk?: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Ellipse;
  phase: number;
  shedIn: number;
  hover: boolean;
}

const realmNow = (): Realm => Math.min(4, Math.max(1, useGameStore.getState().platformPhase || 1)) as Realm;

/**
 * Clickable renewable wild trees and bushes, kept sparse so roads and battles
 * stay readable. Painted per realm (foliageArt.ts) and re-skinned when the
 * biome changes. States: growing (sprouts up), idle (sways, sheds leaves /
 * embers / snow / star motes; essence-bearing nodes shimmer), hover
 * (brightens), harvesting (shakes, then the tree topples / the bush bursts
 * and the logs and essence fly out). Pays wood, sometimes arcane essence.
 */
export class ForageNodeManager {
  private nodes: Node[] = [];
  private pending: number[] = [];
  private bits: { g: Phaser.GameObjects.Arc; vx: number; vy: number; life: number; t: number; fall: boolean }[] = [];
  private realm: Realm = realmNow();

  constructor(private scene: Phaser.Scene, private layer: Phaser.GameObjects.Container) {
    this.fillToTarget(true);
  }

  update(deltaMs: number): void {
    const dt = deltaMs / 1000;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      this.pending[i] -= deltaMs;
      if (this.pending[i] <= 0) this.pending.splice(i, 1);
    }
    this.fillToTarget(false);
    // The biome changed: every node takes the new realm's look
    const realm = realmNow();
    if (realm !== this.realm) {
      this.realm = realm;
      for (const n of this.nodes) this.reskin(n, realm);
    }
    const time = this.scene.time.now / 1000;
    for (const n of this.nodes) {
      if (n.state !== 'idle') continue;
      const wind = Math.sin(time * 1.3 + n.phase) * 0.5 + Math.sin(time * 2.9 + n.phase * 2) * 0.2;
      n.sway.setRotation(wind * (n.kind === 'tree' ? 0.045 : 0.03));
      n.sway.setScale((1 + Math.sin(time * 1.1 + n.phase) * 0.012) / FOLIAGE_SS, (1 + Math.sin(time * 1.1 + n.phase + 1) * 0.015) / FOLIAGE_SS);
      if (n.hover) n.object.setScale(1.06);
      else n.object.setScale(1);
      n.glow.setAlpha(n.essence ? 0.25 + 0.2 * Math.sin(time * 3 + n.phase) : n.hover ? 0.25 : 0);
      n.shedIn -= dt;
      if (n.shedIn <= 0) {
        n.shedIn = 1.5 + Math.random() * 3;
        this.shed(n, 1, false);
        if (n.essence) this.shed(n, 1, true);
      }
    }
    this.updateBits(dt);
  }

  private targetCount(): number {
    const wave = useGameStore.getState().invasion.waveNumber ?? 0;
    return Math.min(config.maxNodes, config.baseNodes + Math.floor(wave / config.extraNodeEveryWaves));
  }

  private respawnMs(): number {
    const wave = useGameStore.getState().invasion.waveNumber ?? 0;
    return Math.max(config.minRespawnSeconds, config.respawnSeconds / (1 + wave * config.respawnAccelerationPerWave)) * 1000;
  }

  private fillToTarget(instant: boolean): void {
    while (this.nodes.length + this.pending.length < this.targetCount()) {
      if (!this.spawn(instant)) break;
    }
  }

  private spawn(instant: boolean): boolean {
    const occupied = new Set(this.nodes.map((n) => `${n.tile.x},${n.tile.y}`));
    const choices: Array<{ x: number; y: number }> = [];
    for (let y = 1; y < GRID_SIZE - 1; y++) for (let x = 1; x < GRID_SIZE - 1; x++) {
      if (isLandTile(x, y) && !isRaisedTile(x, y) && !isProtectedTile(x, y) && !occupied.has(`${x},${y}`)) choices.push({ x, y });
    }
    if (!choices.length) return false;
    const tile = choices[Math.floor(Math.random() * choices.length)];
    const kind: FoliageKind = Math.random() < config.treeChance ? 'tree' : 'bush';
    const realm = realmNow();
    const variant = Math.floor(Math.random() * 3);
    const p = IsometricHelper.gridToScreen(tile.x, tile.y);
    const object = this.scene.add.container(p.x, p.y + 2);
    const glow = this.scene.add.ellipse(0, -2, kind === 'tree' ? 46 : 38, 14, 0xfde68a, 0).setBlendMode(Phaser.BlendModes.ADD);
    object.add(glow);
    let sway: Phaser.GameObjects.Image;
    let trunk: Phaser.GameObjects.Image | undefined;
    if (kind === 'tree') {
      trunk = this.scene.add.image(0, 0, treeTrunkTexture(this.scene, realm, variant)).setOrigin(0.5, TREE_BASE / TREE_H).setScale(1 / FOLIAGE_SS);
      // The canopy pivots where it meets the trunk
      sway = this.scene.add.image(0, -CANOPY_PIVOT, treeCanopyTexture(this.scene, realm, variant))
        .setOrigin(0.5, (TREE_BASE - CANOPY_PIVOT) / TREE_H).setScale(1 / FOLIAGE_SS);
      object.add([trunk, sway]);
    } else {
      sway = this.scene.add.image(0, 0, bushTexture(this.scene, realm, variant)).setOrigin(0.5, BUSH_BASE / BUSH_H).setScale(1 / FOLIAGE_SS);
      object.add(sway);
    }
    object.setSize(kind === 'tree' ? 40 : 34, kind === 'tree' ? 64 : 30).setInteractive({ useHandCursor: true });
    object.setData('headY', kind === 'tree' ? -64 : -28);
    this.layer.add(object);
    const chance = config.essence.chance[kind];
    const node: Node = {
      tile, kind, variant, realm, essence: Math.random() < chance, state: instant ? 'idle' : 'growing',
      object, sway, trunk, glow, phase: Math.random() * Math.PI * 2, shedIn: Math.random() * 3, hover: false,
    };
    this.nodes.push(node);
    object.on('pointerover', () => { node.hover = true; });
    object.on('pointerout', () => { node.hover = false; });
    object.once('pointerdown', () => this.harvest(node));
    if (!instant) {
      // Sprouts up from the ground
      object.setScale(0.15).setAlpha(0);
      this.scene.tweens.add({ targets: object, scale: 1, alpha: 1, duration: 900, ease: 'Back.easeOut', onComplete: () => { if (node.state === 'growing') node.state = 'idle'; } });
      this.shed(node, 6, false);
    }
    return true;
  }

  private reskin(n: Node, realm: Realm): void {
    n.realm = realm;
    if (n.kind === 'tree') {
      n.trunk?.setTexture(treeTrunkTexture(this.scene, realm, n.variant));
      n.sway.setTexture(treeCanopyTexture(this.scene, realm, n.variant));
    } else {
      n.sway.setTexture(bushTexture(this.scene, realm, n.variant));
    }
  }

  /** Little bits drifting off a node: leaves / embers / snow / star motes (or essence sparks). */
  private shed(n: Node, count: number, essence: boolean): void {
    const colors = essence ? [0xfde68a, 0xc084fc] : FOLIAGE_PARTICLE[n.realm];
    const top = n.kind === 'tree' ? -58 : -20;
    for (let i = 0; i < count && this.bits.length < 160; i++) {
      const g = this.scene.add.circle(n.object.x + (Math.random() - 0.5) * (n.kind === 'tree' ? 34 : 26), n.object.y + top + Math.random() * 18,
        essence ? 1.6 : 1.2 + Math.random(), colors[Math.floor(Math.random() * colors.length)], 0.9);
      if (essence || n.realm === 2 || n.realm === 4) g.setBlendMode(Phaser.BlendModes.ADD);
      this.layer.add(g);
      // Leaves and snow fall; embers, motes and essence rise
      const fall = !essence && (n.realm === 1 || n.realm === 3);
      this.bits.push({ g, vx: (Math.random() - 0.5) * 10, vy: fall ? 8 + Math.random() * 6 : -(10 + Math.random() * 10), life: 1.6 + Math.random() * 1.4, t: 0, fall });
    }
  }

  private updateBits(dt: number): void {
    for (const b of this.bits) {
      b.t += dt;
      b.g.x += (b.vx + Math.sin(b.t * 4) * 6) * dt;
      b.g.y += b.vy * dt;
      b.g.setAlpha(Math.max(0, 0.9 * (1 - b.t / b.life)));
    }
    this.bits = this.bits.filter((b) => {
      if (b.t < b.life) return true;
      b.g.destroy();
      return false;
    });
  }

  private harvest(node: Node): void {
    if (!node.object.active || node.state === 'harvesting') return;
    node.state = 'harvesting';
    node.object.disableInteractive();
    node.glow.setAlpha(0);
    const range = config.wood[node.kind];
    const wood = Phaser.Math.Between(range[0], range[1]);
    const essence = node.essence ? Phaser.Math.Between(config.essence.amount[0], config.essence.amount[1]) : 0;
    useGameStore.getState().addResources(essence ? { wood, arcaneEssence: essence } : { wood });
    if (essence) logMessage('forageHarvestedEssence', { kind: node.kind, amount: wood, essence });
    else logMessage('forageHarvested', { kind: node.kind, amount: wood });
    soundFx.playHarvest('wood');
    // Shake from the blows...
    const x0 = node.object.x;
    this.scene.tweens.add({
      targets: node.object, x: x0 + 2.5, duration: 45, yoyo: true, repeat: 3,
      onComplete: () => {
        node.object.x = x0;
        this.shed(node, 10, false);
        this.lootPop(node, wood, essence);
        if (node.kind === 'tree') {
          // ...then the tree topples away from the axe and fades
          this.scene.tweens.add({ targets: node.object, rotation: Math.random() < 0.5 ? 1.35 : -1.35, alpha: 0, duration: 650, ease: 'Quad.easeIn', onComplete: () => this.remove(node) });
        } else {
          // ...the bush squashes and bursts
          this.scene.tweens.add({ targets: node.object, scaleX: 1.3, scaleY: 0.2, alpha: 0, duration: 380, ease: 'Quad.easeIn', onComplete: () => this.remove(node) });
        }
      },
    });
  }

  /** Logs (and essence sparks) tumble out and arc away: art only, the amounts go to the activity log. */
  private lootPop(node: Node, wood: number, essence: number): void {
    const n = Math.min(4, 1 + Math.floor(wood / 6));
    for (let i = 0; i < n; i++) {
      const log = this.scene.add.rectangle(node.object.x, node.object.y - 10, 9, 3.4, 0x8b5a2b).setStrokeStyle(1, 0x3b2418);
      this.layer.add(log);
      const dx = (Math.random() - 0.5) * 40;
      this.scene.tweens.add({ targets: log, x: log.x + dx, y: log.y - 18 - Math.random() * 10, rotation: (Math.random() - 0.5) * 4, duration: 260, ease: 'Quad.easeOut', yoyo: false,
        onComplete: () => this.scene.tweens.add({ targets: log, y: node.object.y + 2, alpha: 0, duration: 420, delay: 200, ease: 'Bounce.easeOut', onComplete: () => log.destroy() }) });
    }
    for (let i = 0; i < Math.min(6, essence); i++) {
      const s = this.scene.add.star(node.object.x, node.object.y - 18, 4, 1.2, 3.2, 0xfde68a).setBlendMode(Phaser.BlendModes.ADD);
      this.layer.add(s);
      this.scene.tweens.add({ targets: s, x: s.x + (Math.random() - 0.5) * 30, y: s.y - 30 - Math.random() * 20, alpha: 0, angle: 180, duration: 900, ease: 'Sine.easeOut', onComplete: () => s.destroy() });
    }
  }

  private remove(node: Node): void {
    this.nodes = this.nodes.filter((n) => n !== node);
    node.object.destroy();
    this.pending.push(this.respawnMs());
  }

  destroy(): void {
    for (const node of this.nodes) node.object.destroy();
    for (const b of this.bits) b.g.destroy();
    this.nodes = [];
    this.bits = [];
    this.pending = [];
  }
}
