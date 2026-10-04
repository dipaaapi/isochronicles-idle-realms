import Phaser from 'phaser';
import { useGameStore } from '../state/useGameStore';
import { soundFx } from './audio/soundFx';
import { logFloatingText, logMessage } from '../state/activityLog';
import { IsometricHelper } from './IsometricHelper';
import { GRID_SIZE } from '../state/buildingLayout';
import type { Resources } from '../types/state';

export interface GroundLootItem {
  id: string;
  resourceKey: keyof Resources;
  amount: number;
  icon: string;
  gridX: number;
  gridY: number;
  container: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;
  sprite: Phaser.GameObjects.Text;
  glow: Phaser.GameObjects.Arc;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  arcProgress: number; // 0 to 1
  isLanded: boolean;
  bobTimer: number;
  lifeTimer: number;
  maxLife: number;
  /** Scout spoils: only Generals may pick these up. */
  generalsOnly?: boolean;
  /** Equipment piece (craftableItems.json id) granted on pickup instead of a resource. */
  itemId?: string;
}

export interface DropOptions {
  generalsOnly?: boolean;
  itemId?: string;
  /** Seconds on the ground before it fades (default 45). */
  life?: number;
}

/** Who is looking for loot: tenants skip General-only spoils. */
export type LootSeeker = 'tenant' | 'general';

export class GroundLootManager {
  private scene: Phaser.Scene;
  private parentContainer: Phaser.GameObjects.Container;
  private lootItems: Map<string, GroundLootItem> = new Map();
  private nextId: number = 1;

  constructor(scene: Phaser.Scene, parentContainer: Phaser.GameObjects.Container) {
    this.scene = scene;
    this.parentContainer = parentContainer;
  }

  /**
   * Spawns a physical drop with an arc trajectory and bouncing landing.
   */
  public dropLoot(
    x: number,
    y: number,
    resourceKey: keyof Resources,
    amount: number,
    customIcon?: string,
    options: DropOptions = {}
  ): GroundLootItem | null {
    if (!this.scene || !this.scene.add) return null;

    const id = `loot_${this.nextId++}_${Date.now()}`;
    const icon = customIcon || this.getDefaultIcon(resourceKey);

    // Random scattering landing spot within 30-70px
    const angle = Math.random() * Math.PI * 2;
    const distance = 25 + Math.random() * 45;
    const targetX = x + Math.cos(angle) * distance;
    const targetY = y + Math.sin(angle) * distance;

    const grid = IsometricHelper.screenToGrid(targetX, targetY);
    const gridX = Phaser.Math.Clamp(grid.x, 0, GRID_SIZE - 1);
    const gridY = Phaser.Math.Clamp(grid.y, 0, GRID_SIZE - 1);

    const container = this.scene.add.container(x, y);
    container.setDepth(6000 + y);

    // Drop Shadow
    const shadow = this.scene.add.ellipse(0, 0, 20, 10, 0x000000, 0.5);
    container.add(shadow);

    // Soft Ambient Glow
    // General-only spoils glow gold so they stand out from ordinary drops
    const glowColor = options.generalsOnly ? 0xfbbf24 : this.getGlowColor(resourceKey);
    const glow = this.scene.add.arc(0, -4, 8, 0, 360, false, glowColor, 0.45);
    container.add(glow);

    // Icon Emoji Sprite
    const sprite = this.scene.add.text(0, -10, icon, {
      fontSize: '11px',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 0.5);
    container.add(sprite);

    // Make interactive for direct player clicking as well
    sprite.setInteractive({ useHandCursor: true });
    sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation();
      this.collectLoot(id);
    });

    this.parentContainer.add(container);

    const loot: GroundLootItem = {
      id,
      resourceKey,
      amount,
      icon,
      gridX,
      gridY,
      container,
      shadow,
      sprite,
      glow,
      startX: x,
      startY: y,
      targetX,
      targetY,
      arcProgress: 0,
      isLanded: false,
      bobTimer: Math.random() * Math.PI * 2,
      lifeTimer: 0,
      maxLife: options.life ?? 45, // stays on the ground this long before despawning
      generalsOnly: options.generalsOnly,
      itemId: options.itemId,
    };

    // Parabolic pop animation
    this.scene.tweens.add({
      targets: loot,
      arcProgress: 1,
      duration: 520,
      ease: 'Quad.easeOut',
      onUpdate: () => {
        const p = loot.arcProgress;
        const curX = Phaser.Math.Linear(loot.startX, loot.targetX, p);
        const curY = Phaser.Math.Linear(loot.startY, loot.targetY, p);
        const heightArc = Math.sin(p * Math.PI) * -45;

        loot.container.setPosition(curX, curY);
        loot.sprite.setY(-18 + heightArc);
        loot.glow.setY(-6 + heightArc * 0.7);
        loot.shadow.setScale(Math.max(0.4, 1 - Math.sin(p * Math.PI) * 0.5));
      },
      onComplete: () => {
        loot.isLanded = true;
        // High-energy Bouncing effect upon landing
        this.scene.tweens.add({
          targets: loot.sprite,
          y: -30,
          duration: 160,
          yoyo: true,
          repeat: 2,
          ease: 'Sine.easeOut',
          onComplete: () => {
            loot.sprite.setY(-18);
          }
        });
      },
    });

    this.lootItems.set(id, loot);
    return loot;
  }

  public update(deltaSec: number): void {
    const toRemove: string[] = [];

    this.lootItems.forEach((loot, id) => {
      loot.lifeTimer += deltaSec;
      if (loot.lifeTimer >= loot.maxLife) {
        toRemove.push(id);
        return;
      }

      // Despawn blink during last 5 seconds
      if (loot.lifeTimer > loot.maxLife - 5) {
        const blink = Math.sin(loot.lifeTimer * 12) > 0;
        loot.container.setAlpha(blink ? 0.3 : 0.9);
      }

      // Gentle floating bobbing once landed
      if (loot.isLanded) {
        loot.bobTimer += deltaSec * 3.5;
        const bobOffset = Math.sin(loot.bobTimer) * 3;
        loot.sprite.setY(-18 + bobOffset);
        loot.glow.setY(-6 + bobOffset);
      }
    });

    toRemove.forEach((id) => this.removeLoot(id));
  }

  /**
   * Find nearest unclaimed loot item within maxDist.
   */
  public getNearestLoot(x: number, y: number, maxDist: number = 320, seeker: LootSeeker = 'tenant'): GroundLootItem | null {
    let nearest: GroundLootItem | null = null;
    let minDistSq = maxDist * maxDist;

    this.lootItems.forEach((loot) => {
      if (!loot.isLanded) return;
      if (loot.generalsOnly && seeker !== 'general') return;
      const dx = loot.container.x - x;
      const dy = loot.container.y - y;
      const distSq = dx * dx + dy * dy;
      if (distSq < minDistSq) {
        minDistSq = distSq;
        nearest = loot;
      }
    });

    return nearest;
  }

  /**
   * Collect loot item, play pick-up chime and fly towards castle or worker, grant resource to store.
   */
  public collectLoot(idOrItem: string | GroundLootItem, collectorName?: string): boolean {
    const id = typeof idOrItem === 'string' ? idOrItem : idOrItem.id;
    const loot = this.lootItems.get(id);
    if (!loot) return false;

    this.lootItems.delete(id);

    const store = useGameStore.getState();
    if (loot.itemId) {
      // An equipment piece: straight into the Armory inventory
      const item = store.grantEquipmentDrop(loot.itemId);
      soundFx.playCoin();
      if (item) {
        logMessage('scoutItem', {
          name: collectorName ?? 'General',
          item: { en: `${item.icon} ${item.name}`, tl: `${item.icon} ${item.nameTl ?? item.name}` },
        });
      }
    } else {
      // Grant resources to store
      store.addResources({ [loot.resourceKey]: loot.amount } as Partial<Resources>);
      soundFx.playDeposit();
      // Narrated in the activity log tray (no floating text over the map)
      logFloatingText(`+${loot.amount} ${loot.icon}`, '#fef08a', collectorName);
    }

    // Animate item flying upward & shrinking
    this.scene.tweens.add({
      targets: loot.container,
      y: loot.container.y - 14,
      scale: 1.15,
      alpha: 0,
      duration: 350,
      ease: 'Back.easeIn',
      onComplete: () => {
        loot.container.destroy();
      },
    });

    return true;
  }

  private removeLoot(id: string): void {
    const loot = this.lootItems.get(id);
    if (!loot) return;
    this.lootItems.delete(id);
    loot.container.destroy();
  }

  public destroy(): void {
    this.lootItems.forEach((loot) => loot.container.destroy());
    this.lootItems.clear();
  }

  private getDefaultIcon(key: keyof Resources): string {
    switch (key) {
      case 'aetherShards': return '💎';
      case 'wood': return '🌲';
      case 'stone': return '🪨';
      case 'arcaneEssence': return '✨';
      case 'fish': return '🐟';
      case 'water': return '💧';
      case 'coins': return '🪙';
      case 'scrapMetal': return '⚙️';
      case 'obsidianShard': return '🌋';
      case 'soulFragments': return '💀';
      default: return '📦';
    }
  }

  private getGlowColor(key: keyof Resources): number {
    switch (key) {
      case 'aetherShards': return 0x38bdf8;
      case 'wood': return 0x4ade80;
      case 'stone': return 0xfbbf24;
      case 'arcaneEssence': return 0xc084fc;
      case 'fish': return 0x22d3ee;
      case 'water': return 0x60a5fa;
      case 'coins': return 0xfacc15;
      default: return 0xa855f7;
    }
  }
}
