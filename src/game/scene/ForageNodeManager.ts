import Phaser from 'phaser';
import config from '../../data/forageNodes.json';
import { GRID_SIZE, isLandTile, isProtectedTile, isRaisedTile } from '../../state/buildingLayout';
import { useGameStore } from '../../state/useGameStore';
import { logMessage } from '../../state/activityLog';
import { IsometricHelper } from '../IsometricHelper';
import { soundFx } from '../audio/soundFx';

type Kind = 'bush' | 'tree';
interface Node { tile: { x: number; y: number }; object: Phaser.GameObjects.Container }

/** Clickable renewable wood nodes, kept deliberately sparse so roads and battles stay readable. */
export class ForageNodeManager {
  private nodes: Node[] = [];
  private pending: number[] = [];

  constructor(private scene: Phaser.Scene, private layer: Phaser.GameObjects.Container) {
    this.fillToTarget();
  }

  update(deltaMs: number): void {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      this.pending[i] -= deltaMs;
      if (this.pending[i] <= 0) this.pending.splice(i, 1);
    }
    this.fillToTarget();
  }

  private targetCount(): number {
    const wave = useGameStore.getState().invasion.waveNumber ?? 0;
    return Math.min(config.maxNodes, config.baseNodes + Math.floor(wave / config.extraNodeEveryWaves));
  }

  private respawnMs(): number {
    const wave = useGameStore.getState().invasion.waveNumber ?? 0;
    return Math.max(config.minRespawnSeconds, config.respawnSeconds / (1 + wave * config.respawnAccelerationPerWave)) * 1000;
  }

  private fillToTarget(): void {
    while (this.nodes.length + this.pending.length < this.targetCount()) this.spawn();
  }

  private spawn(): void {
    const occupied = new Set(this.nodes.map((n) => `${n.tile.x},${n.tile.y}`));
    const choices: Array<{ x: number; y: number }> = [];
    for (let y = 1; y < GRID_SIZE - 1; y++) for (let x = 1; x < GRID_SIZE - 1; x++) {
      if (isLandTile(x, y) && !isRaisedTile(x, y) && !isProtectedTile(x, y) && !occupied.has(`${x},${y}`)) choices.push({ x, y });
    }
    if (!choices.length) return;
    const tile = choices[Math.floor(Math.random() * choices.length)];
    const kind: Kind = Math.random() < config.treeChance ? 'tree' : 'bush';
    const p = IsometricHelper.gridToScreen(tile.x, tile.y);
    const object = this.scene.add.container(p.x, p.y - 3);
    const art = this.scene.add.graphics();
    if (kind === 'tree') {
      art.fillStyle(0x5b3a22, 1).fillRect(-3, -24, 6, 24);
      art.fillStyle(0x14532d, 1).fillCircle(0, -30, 14);
      art.fillStyle(0x22c55e, 1).fillCircle(-6, -34, 8).fillCircle(7, -32, 9);
    } else {
      art.fillStyle(0x14532d, 1).fillCircle(0, -9, 12);
      art.fillStyle(0x22c55e, 1).fillCircle(-7, -12, 7).fillCircle(7, -11, 8);
    }
    object.add(art);
    object.setSize(kind === 'tree' ? 34 : 30, kind === 'tree' ? 52 : 28).setInteractive({ useHandCursor: true });
    object.setData('headY', kind === 'tree' ? -48 : -24);
    this.layer.add(object);
    const node = { tile, object };
    this.nodes.push(node);
    object.once('pointerdown', () => this.harvest(node, kind));
  }

  private harvest(node: Node, kind: Kind): void {
    if (!node.object.active) return;
    const range = config.wood[kind];
    const amount = Phaser.Math.Between(range[0], range[1]);
    useGameStore.getState().addResources({ wood: amount });
    logMessage('forageHarvested', { kind, amount });
    soundFx.playHarvest('wood');
    this.nodes = this.nodes.filter((n) => n !== node);
    node.object.destroy();
    this.pending.push(this.respawnMs());
  }

  destroy(): void {
    for (const node of this.nodes) node.object.destroy();
    this.nodes = [];
    this.pending = [];
  }
}
