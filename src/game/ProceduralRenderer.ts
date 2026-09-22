import Phaser from 'phaser';
import { TILE_WIDTH, TILE_HEIGHT, TILE_DEPTH } from './IsometricHelper';
import { TileType } from '../types/game';

// ── Pre-computed constants (avoid repeated division each draw call) ──────────
const HALF_W = TILE_WIDTH / 2;   // 36
const HALF_H = TILE_HEIGHT / 2;  // 18

interface TileColors {
  topColor: number;
  leftColor: number;
  rightColor: number;
  strokeColor: number;
}

/**
 * Pure function: resolve the three face-colours + stroke for a given tile
 * type and platform phase. Extracted from the hot-path so the switch is
 * evaluated only once per tile, not duplicated across render methods.
 */
function getTileColors(
  tileType: TileType,
  isAlternate: boolean,
  platformPhase: 1 | 2 | 3 | 4
): TileColors | null {
  switch (tileType) {
    case 'AETHER_GRASS': {
      if (platformPhase === 2) {
        return {
          topColor: isAlternate ? 0x7c2d12 : 0x9a3412,
          leftColor: 0x431407,
          rightColor: 0x292524,
          strokeColor: 0xea580c,
        };
      } else if (platformPhase === 3) {
        return {
          topColor: isAlternate ? 0x0891b2 : 0x06b6d4,
          leftColor: 0x0e7490,
          rightColor: 0x155e75,
          strokeColor: 0x67e8f9,
        };
      } else if (platformPhase === 4) {
        return {
          topColor: isAlternate ? 0x4338ca : 0x4f46e5,
          leftColor: 0x312e81,
          rightColor: 0x1e1b4b,
          strokeColor: 0x818cf8,
        };
      }
      // Phase 1: Demon Citadel
      return {
        topColor: isAlternate ? 0x10b981 : 0x059669,
        leftColor: 0x047857,
        rightColor: 0x065f46,
        strokeColor: 0x34d399,
      };
    }

    case 'ANCIENT_STONE': {
      if (platformPhase === 2) {
        return {
          topColor: isAlternate ? 0x292524 : 0x1c1917,
          leftColor: 0x0c0a09,
          rightColor: 0x000000,
          strokeColor: 0xf97316,
        };
      } else if (platformPhase === 3) {
        return {
          topColor: isAlternate ? 0x475569 : 0x334155,
          leftColor: 0x1e293b,
          rightColor: 0x0f172a,
          strokeColor: 0x94a3b8,
        };
      } else if (platformPhase === 4) {
        return {
          topColor: isAlternate ? 0xf8fafc : 0xe2e8f0,
          leftColor: 0xcbd5e1,
          rightColor: 0x94a3b8,
          strokeColor: 0xfde047,
        };
      }
      // Phase 1: Demon Citadel obsidian stone
      return {
        topColor: isAlternate ? 0x475569 : 0x334155,
        leftColor: 0x1e293b,
        rightColor: 0x0f172a,
        strokeColor: 0x64748b,
      };
    }

    case 'NEXUS_BASE':
      return {
        topColor:   platformPhase === 2 ? 0xc2410c : platformPhase === 3 ? 0x0284c7 : platformPhase === 4 ? 0xca8a04 : 0x0369a1,
        leftColor:  platformPhase === 2 ? 0x9a3412 : platformPhase === 3 ? 0x0369a1 : platformPhase === 4 ? 0xa16207 : 0x075985,
        rightColor: platformPhase === 2 ? 0x7c2d12 : platformPhase === 3 ? 0x075985 : platformPhase === 4 ? 0x854d0e : 0x0c4a6e,
        strokeColor:platformPhase === 2 ? 0xfb923c : platformPhase === 3 ? 0x38bdf8 : platformPhase === 4 ? 0xfef08a : 0x38bdf8,
      };

    case 'AETHER_CRYSTAL':
      return { topColor: 0x0284c7, leftColor: 0x0369a1, rightColor: 0x075985, strokeColor: 0x7dd3fc };

    case 'ANCIENT_GROVE':
      return {
        topColor:   platformPhase === 2 ? 0x854d0e : platformPhase === 3 ? 0x0d9488 : 0x15803d,
        leftColor:  platformPhase === 2 ? 0x713f12 : platformPhase === 3 ? 0x0f766e : 0x166534,
        rightColor: platformPhase === 2 ? 0x451a03 : platformPhase === 3 ? 0x115e59 : 0x14532d,
        strokeColor:platformPhase === 2 ? 0xf59e0b : platformPhase === 3 ? 0x2dd4bf : 0x22c55e,
      };

    case 'RUNIC_PILLAR':
      return { topColor: 0x7e22ce, leftColor: 0x6b21a8, rightColor: 0x581c87, strokeColor: 0xc084fc };

    case 'MYSTIC_CAVE':
      return { topColor: 0x1e1b4b, leftColor: 0x0f172a, rightColor: 0x020617, strokeColor: 0xa855f7 };

    case 'BARRACKS':
      return { topColor: 0xb45309, leftColor: 0x92400e, rightColor: 0x78350f, strokeColor: 0xf59e0b };

    case 'OCEAN_BLOCK': {
      if (platformPhase === 2) {
        return { topColor: 0xd97706, leftColor: 0xb45309, rightColor: 0x92400e, strokeColor: 0xf59e0b };
      } else if (platformPhase === 3) {
        return { topColor: 0x38bdf8, leftColor: 0x0284c7, rightColor: 0x0369a1, strokeColor: 0xe0f2fe };
      } else if (platformPhase === 4) {
        return { topColor: 0x6366f1, leftColor: 0x4f46e5, rightColor: 0x3730a3, strokeColor: 0xc084fc };
      }
      return { topColor: 0x0ea5e9, leftColor: 0x0284c7, rightColor: 0x0369a1, strokeColor: 0x38bdf8 };
    }

    case 'SPAWN_BLOCK':
      return {
        topColor: 0x1e1b4b,
        leftColor: 0x0f172a,
        rightColor: 0x020617,
        strokeColor: platformPhase === 2 ? 0xf97316 : platformPhase === 3 ? 0x38bdf8 : platformPhase === 4 ? 0xfacc15 : 0xf43f5e,
      };

    default:
      return null;
  }
}

export class ProceduralRenderer {
  /**
   * Draws a 3D isometric prism block (top diamond, left skirt, right skirt).
   */
  static drawIsoBlock(
    graphics: Phaser.GameObjects.Graphics,
    centerX: number,
    centerY: number,
    tileType: TileType,
    depthOffset: number = TILE_DEPTH,
    isAlternate: boolean = false,
    platformPhase: 1 | 2 | 3 | 4 = 1
  ): void {
    const colors = getTileColors(tileType, isAlternate, platformPhase);
    if (!colors) return;

    const { topColor, leftColor, rightColor, strokeColor } = colors;

    // 1. Draw Left Face (Skirting depth)
    graphics.fillStyle(leftColor, 1);
    graphics.beginPath();
    graphics.moveTo(centerX - HALF_W, centerY);
    graphics.lineTo(centerX, centerY + HALF_H);
    graphics.lineTo(centerX, centerY + HALF_H + depthOffset);
    graphics.lineTo(centerX - HALF_W, centerY + depthOffset);
    graphics.closePath();
    graphics.fillPath();

    // 2. Draw Right Face (Skirting depth)
    graphics.fillStyle(rightColor, 1);
    graphics.beginPath();
    graphics.moveTo(centerX, centerY + HALF_H);
    graphics.lineTo(centerX + HALF_W, centerY);
    graphics.lineTo(centerX + HALF_W, centerY + depthOffset);
    graphics.lineTo(centerX, centerY + HALF_H + depthOffset);
    graphics.closePath();
    graphics.fillPath();

    // Wave overlay for ocean
    if (tileType === 'OCEAN_BLOCK') {
      graphics.fillStyle(0x38bdf8, 0.15);
      graphics.beginPath();
      graphics.moveTo(centerX, centerY - HALF_H);
      graphics.lineTo(centerX + HALF_W, centerY);
      graphics.lineTo(centerX, centerY + HALF_H);
      graphics.lineTo(centerX - HALF_W, centerY);
      graphics.closePath();
      graphics.fillPath();
    }

    // 3. Draw Top Diamond Face
    graphics.fillStyle(topColor, 1);
    graphics.lineStyle(1, strokeColor, 0.4);
    graphics.beginPath();
    graphics.moveTo(centerX, centerY - HALF_H);
    graphics.lineTo(centerX + HALF_W, centerY);
    graphics.lineTo(centerX, centerY + HALF_H);
    graphics.lineTo(centerX - HALF_W, centerY);
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();

    // Subtle edge highlight for clean modern look
    graphics.lineStyle(1, 0xffffff, 0.15);
    graphics.beginPath();
    graphics.moveTo(centerX - HALF_W, centerY);
    graphics.lineTo(centerX, centerY - HALF_H);
    graphics.lineTo(centerX + HALF_W, centerY);
    graphics.strokePath();

    // Spawn Portal Core
    if (tileType === 'SPAWN_BLOCK') {
      graphics.fillStyle(0x000000, 0.8);
      graphics.fillEllipse(centerX, centerY, TILE_WIDTH * 0.4, TILE_HEIGHT * 0.4);
      graphics.lineStyle(2, 0xf43f5e, 0.9);
      graphics.strokeEllipse(centerX, centerY, TILE_WIDTH * 0.4, TILE_HEIGHT * 0.4);
      graphics.fillStyle(0xf43f5e, 0.3);
      graphics.fillEllipse(centerX, centerY, TILE_WIDTH * 0.4, TILE_HEIGHT * 0.4);
    }
  }

  /**
   * Draws the Central Arcane Nexus Castle — a fortified multi-tiered citadel.
   */
  static drawNexusStructure(graphics: Phaser.GameObjects.Graphics, x: number, y: number): void {
    // === STONE PLATFORM BASE ===
    // Wide hexagonal stone foundation
    graphics.fillStyle(0x1e293b, 1);
    graphics.beginPath();
    graphics.moveTo(x - 28, y + 2);
    graphics.lineTo(x, y + 14);
    graphics.lineTo(x + 28, y + 2);
    graphics.lineTo(x + 28, y - 2);
    graphics.lineTo(x, y + 10);
    graphics.lineTo(x - 28, y - 2);
    graphics.closePath();
    graphics.fillPath();

    // Platform top face
    graphics.fillStyle(0x334155, 1);
    graphics.beginPath();
    graphics.moveTo(x, y - 8);
    graphics.lineTo(x + 28, y - 2);
    graphics.lineTo(x, y + 10);
    graphics.lineTo(x - 28, y - 2);
    graphics.closePath();
    graphics.fillPath();
    graphics.lineStyle(1, 0x475569, 0.5);
    graphics.strokePath();

    // === MAIN CASTLE BODY ===
    // Left wall
    graphics.fillStyle(0x1e3a5f, 1);
    graphics.beginPath();
    graphics.moveTo(x - 18, y - 6);
    graphics.lineTo(x, y + 4);
    graphics.lineTo(x, y - 32);
    graphics.lineTo(x - 18, y - 40);
    graphics.closePath();
    graphics.fillPath();

    // Right wall
    graphics.fillStyle(0x0c4a6e, 1);
    graphics.beginPath();
    graphics.moveTo(x + 18, y - 6);
    graphics.lineTo(x, y + 4);
    graphics.lineTo(x, y - 32);
    graphics.lineTo(x + 18, y - 40);
    graphics.closePath();
    graphics.fillPath();

    // Castle roof (top face)
    graphics.fillStyle(0x0369a1, 1);
    graphics.beginPath();
    graphics.moveTo(x, y - 46);
    graphics.lineTo(x + 18, y - 40);
    graphics.lineTo(x, y - 32);
    graphics.lineTo(x - 18, y - 40);
    graphics.closePath();
    graphics.fillPath();
    graphics.lineStyle(1, 0x38bdf8, 0.6);
    graphics.strokePath();

    // === BATTLEMENTS (crenellations) ===
    // Left side battlements
    graphics.fillStyle(0x164e63, 1);
    for (let i = 0; i < 3; i++) {
      const bx = x - 16 + i * 7;
      const by = y - 40 + i * 1.5;
      graphics.fillRect(bx, by - 5, 4, 5);
    }
    // Right side battlements
    for (let i = 0; i < 3; i++) {
      const bx = x + 4 + i * 5;
      const by = y - 42 + i * 1.8;
      graphics.fillRect(bx, by - 5, 4, 5);
    }

    // === CENTRAL TOWER SPIRE ===
    // Tower body
    graphics.fillStyle(0x075985, 1);
    graphics.fillRect(x - 5, y - 58, 10, 18);
    graphics.lineStyle(1, 0x0ea5e9, 0.5);
    graphics.strokeRect(x - 5, y - 58, 10, 18);

    // Pointed spire roof
    graphics.fillStyle(0x0284c7, 1);
    graphics.fillTriangle(x, y - 72, x - 7, y - 58, x + 7, y - 58);
    graphics.fillStyle(0x38bdf8, 0.7);
    graphics.fillTriangle(x, y - 72, x, y - 58, x + 7, y - 58);

    // === DECORATIVE WINDOWS ===
    // Castle body windows (warm glow)
    graphics.fillStyle(0xfbbf24, 0.8);
    graphics.fillRect(x - 8, y - 26, 3, 4);
    graphics.fillRect(x + 5, y - 28, 3, 4);
    graphics.fillRect(x - 3, y - 20, 3, 5);

    // Tower window
    graphics.fillStyle(0x38bdf8, 0.9);
    graphics.fillRect(x - 2, y - 54, 4, 5);

    // === FLOATING ARCANE RINGS ===
    graphics.lineStyle(1.5, 0x38bdf8, 0.5);
    graphics.strokeEllipse(x, y - 48, 30, 8);
    graphics.lineStyle(1, 0xa855f7, 0.3);
    graphics.strokeEllipse(x, y - 52, 22, 6);

    // === CRYSTAL APEX GLOW ===
    graphics.fillStyle(0x7dd3fc, 0.6);
    graphics.fillCircle(x, y - 72, 4);
    graphics.fillStyle(0xffffff, 0.95);
    graphics.fillCircle(x, y - 72, 2);

    // === GATE / ENTRANCE ===
    graphics.fillStyle(0x0f172a, 0.9);
    graphics.beginPath();
    graphics.moveTo(x - 4, y + 4);
    graphics.lineTo(x, y - 2);
    graphics.lineTo(x + 4, y + 4);
    graphics.closePath();
    graphics.fillPath();
    graphics.lineStyle(1, 0xfbbf24, 0.6);
    graphics.strokePath();

    // === BANNER FLAGS ===
    // Left banner
    graphics.fillStyle(0xef4444, 0.8);
    graphics.fillTriangle(x - 17, y - 44, x - 17, y - 38, x - 22, y - 41);
    // Right banner
    graphics.fillStyle(0x3b82f6, 0.8);
    graphics.fillTriangle(x + 17, y - 45, x + 17, y - 39, x + 22, y - 42);
  }

  /**
   * Draws an Aether Crystal cluster node — shimmering crystalline formation.
   */
  static drawAetherCrystalCluster(graphics: Phaser.GameObjects.Graphics, x: number, y: number): void {
    // === ROCKY BASE PLATFORM ===
    graphics.fillStyle(0x1e293b, 0.9);
    graphics.beginPath();
    graphics.moveTo(x - 20, y + 4);
    graphics.lineTo(x, y + 12);
    graphics.lineTo(x + 20, y + 4);
    graphics.lineTo(x + 16, y - 2);
    graphics.lineTo(x - 16, y - 2);
    graphics.closePath();
    graphics.fillPath();

    // Base glow pool
    graphics.fillStyle(0x0369a1, 0.3);
    graphics.fillEllipse(x, y + 2, 36, 14);

    // === GROUND CRYSTAL SHARDS (scattered) ===
    graphics.fillStyle(0x0ea5e9, 0.6);
    graphics.fillTriangle(x - 16, y, x - 18, y + 6, x - 13, y + 5);
    graphics.fillTriangle(x + 14, y + 2, x + 17, y + 7, x + 12, y + 6);
    graphics.fillStyle(0x7dd3fc, 0.4);
    graphics.fillTriangle(x - 8, y + 4, x - 10, y + 8, x - 5, y + 7);

    // === MAIN LARGE CRYSTAL SPIRE (center) ===
    // Back face (darker)
    graphics.fillStyle(0x0369a1, 0.95);
    graphics.fillTriangle(x, y - 42, x - 10, y - 2, x, y - 2);
    // Front face (lighter)
    graphics.fillStyle(0x0ea5e9, 1);
    graphics.fillTriangle(x, y - 42, x, y - 2, x + 10, y - 2);
    // Inner glow highlight
    graphics.fillStyle(0x38bdf8, 0.5);
    graphics.fillTriangle(x, y - 38, x - 3, y - 8, x + 3, y - 8);

    // === LEFT MEDIUM CRYSTAL ===
    graphics.fillStyle(0x0284c7, 0.9);
    graphics.fillTriangle(x - 12, y - 28, x - 18, y, x - 6, y);
    graphics.fillStyle(0x38bdf8, 0.6);
    graphics.fillTriangle(x - 12, y - 28, x - 12, y, x - 6, y);

    // === RIGHT MEDIUM CRYSTAL ===
    graphics.fillStyle(0x06b6d4, 0.9);
    graphics.fillTriangle(x + 11, y - 26, x + 5, y, x + 18, y);
    graphics.fillStyle(0x67e8f9, 0.5);
    graphics.fillTriangle(x + 11, y - 26, x + 11, y, x + 18, y);

    // === SMALL LEFT CRYSTAL ===
    graphics.fillStyle(0x7dd3fc, 0.85);
    graphics.fillTriangle(x - 17, y - 16, x - 21, y + 2, x - 13, y + 2);

    // === SMALL RIGHT CRYSTAL ===
    graphics.fillStyle(0xa5f3fc, 0.8);
    graphics.fillTriangle(x + 16, y - 14, x + 12, y + 2, x + 20, y + 2);

    // === APEX HIGHLIGHTS ===
    graphics.fillStyle(0xffffff, 0.95);
    graphics.fillCircle(x, y - 42, 2.5);
    graphics.fillCircle(x - 12, y - 28, 1.8);
    graphics.fillCircle(x + 11, y - 26, 1.8);
    graphics.fillCircle(x - 17, y - 16, 1.2);
    graphics.fillCircle(x + 16, y - 14, 1.2);

    // === FLOATING ENERGY RING ===
    graphics.lineStyle(1, 0x7dd3fc, 0.4);
    graphics.strokeEllipse(x, y - 18, 28, 8);
  }

  /** Draws the Water Port: a blue tide tower that produces only water and fish. */
  static drawWaterPort(graphics: Phaser.GameObjects.Graphics, x: number, y: number): void {
    graphics.fillStyle(0x172554, 0.35);
    graphics.fillEllipse(x, y + 8, 82, 34);

    graphics.fillStyle(0x0f3b5f, 1);
    graphics.beginPath();
    graphics.moveTo(x - 28, y + 8);
    graphics.lineTo(x, y + 20);
    graphics.lineTo(x + 28, y + 8);
    graphics.lineTo(x + 20, y - 2);
    graphics.lineTo(x - 20, y - 2);
    graphics.closePath();
    graphics.fillPath();

    graphics.fillStyle(0x075985, 1);
    graphics.fillTriangle(x - 22, y + 5, x, y - 50, x, y + 5);
    graphics.fillStyle(0x0ea5e9, 1);
    graphics.fillTriangle(x, y - 50, x, y + 5, x + 22, y + 5);
    graphics.fillStyle(0x38bdf8, 0.6);
    graphics.fillTriangle(x, y - 45, x, y - 2, x + 9, y - 2);

    graphics.fillStyle(0x164e63, 1);
    graphics.fillRect(x - 4, y - 4, 8, 25);
    graphics.fillStyle(0x7dd3fc, 0.9);
    graphics.fillCircle(x, y - 50, 4);

    graphics.lineStyle(2, 0x67e8f9, 0.75);
    graphics.strokeEllipse(x, y - 48, 52, 16);
    graphics.lineStyle(1, 0x38bdf8, 0.45);
    graphics.strokeEllipse(x, y - 48, 70, 22);
    graphics.fillStyle(0x22d3ee, 0.85);
    graphics.fillCircle(x - 26, y - 15, 2.5);
    graphics.fillCircle(x + 27, y - 10, 2.5);
  }

  /** Draws the Metal Mine: a dark shaft with a violet ore core that produces metal and coal. */
  static drawMetalMine(graphics: Phaser.GameObjects.Graphics, x: number, y: number): void {
    graphics.fillStyle(0x312e81, 0.2);
    graphics.fillEllipse(x, y + 8, 78, 34);

    graphics.fillStyle(0x1e293b, 1);
    graphics.beginPath();
    graphics.moveTo(x - 28, y + 7);
    graphics.lineTo(x, y + 19);
    graphics.lineTo(x + 28, y + 7);
    graphics.lineTo(x + 21, y - 4);
    graphics.lineTo(x - 21, y - 4);
    graphics.closePath();
    graphics.fillPath();

    graphics.fillStyle(0x111827, 1);
    graphics.fillTriangle(x - 22, y + 5, x, y - 34, x + 22, y + 5);
    graphics.fillStyle(0x312e81, 0.9);
    graphics.fillTriangle(x - 15, y + 3, x, y - 25, x, y + 3);
    graphics.fillStyle(0x4c1d95, 0.9);
    graphics.fillTriangle(x, y - 25, x, y + 3, x + 15, y + 3);
    graphics.fillStyle(0xa78bfa, 0.9);
    graphics.fillCircle(x, y - 28, 4);

    graphics.lineStyle(2, 0x8b5cf6, 0.8);
    graphics.strokeEllipse(x, y - 28, 48, 15);
    graphics.lineStyle(1, 0xc084fc, 0.4);
    graphics.strokeEllipse(x, y - 28, 66, 21);
    graphics.fillStyle(0x475569, 1);
    graphics.fillRect(x - 24, y - 2, 48, 5);
    graphics.fillStyle(0x0f172a, 1);
    graphics.fillCircle(x - 14, y + 2, 4);
    graphics.fillCircle(x + 14, y + 2, 4);
  }

  /**
   * Draws an Ancient Runic Pillar — a stone quarry with towering monolith.
   */
  static drawRunicPillar(graphics: Phaser.GameObjects.Graphics, x: number, y: number): void {
    // === QUARRY BASE PLATFORM ===
    graphics.fillStyle(0x1e293b, 0.8);
    graphics.beginPath();
    graphics.moveTo(x - 22, y + 4);
    graphics.lineTo(x, y + 12);
    graphics.lineTo(x + 22, y + 4);
    graphics.lineTo(x + 18, y - 2);
    graphics.lineTo(x - 18, y - 2);
    graphics.closePath();
    graphics.fillPath();

    // === SCATTERED STONE BOULDERS ===
    graphics.fillStyle(0x475569, 1);
    graphics.fillCircle(x - 16, y + 3, 7);
    graphics.lineStyle(1, 0x64748b, 0.4);
    graphics.strokeCircle(x - 16, y + 3, 7);
    graphics.fillStyle(0x334155, 1);
    graphics.fillCircle(x + 14, y + 4, 6);
    graphics.fillStyle(0x64748b, 0.9);
    graphics.fillCircle(x - 6, y + 7, 5);
    // Small pebbles
    graphics.fillStyle(0x94a3b8, 0.7);
    graphics.fillCircle(x + 8, y + 8, 3);
    graphics.fillCircle(x - 12, y + 9, 2.5);

    // === MAIN STONE PILLAR ===
    // Pillar left face
    graphics.fillStyle(0x334155, 1);
    graphics.fillRect(x - 8, y - 34, 8, 32);
    // Pillar right face (lighter)
    graphics.fillStyle(0x475569, 1);
    graphics.fillRect(x, y - 34, 8, 32);
    // Pillar edge highlight
    graphics.lineStyle(1, 0x64748b, 0.6);
    graphics.beginPath();
    graphics.moveTo(x, y - 34);
    graphics.lineTo(x, y - 2);
    graphics.strokePath();

    // === RUNIC ENGRAVINGS (glowing amber lines) ===
    graphics.lineStyle(1.5, 0xf59e0b, 0.8);
    // Horizontal runes
    graphics.beginPath();
    graphics.moveTo(x - 6, y - 28);
    graphics.lineTo(x + 6, y - 28);
    graphics.moveTo(x - 5, y - 20);
    graphics.lineTo(x + 5, y - 20);
    graphics.moveTo(x - 4, y - 12);
    graphics.lineTo(x + 4, y - 12);
    graphics.strokePath();
    // Vertical center rune
    graphics.lineStyle(1, 0xfbbf24, 0.6);
    graphics.beginPath();
    graphics.moveTo(x, y - 30);
    graphics.lineTo(x, y - 8);
    graphics.strokePath();

    // === CAPSTONE ===
    graphics.fillStyle(0x475569, 1);
    graphics.beginPath();
    graphics.moveTo(x, y - 38);
    graphics.lineTo(x - 10, y - 34);
    graphics.lineTo(x + 10, y - 34);
    graphics.closePath();
    graphics.fillPath();

    // === FLOATING RUNE STONE ===
    graphics.fillStyle(0xf59e0b, 0.9);
    graphics.fillCircle(x, y - 44, 6);
    graphics.fillStyle(0xfbbf24, 0.7);
    graphics.fillCircle(x, y - 44, 4);
    // Inner glow
    graphics.fillStyle(0xffffff, 0.9);
    graphics.fillCircle(x - 1, y - 45, 2);

    // Energy tether
    graphics.lineStyle(1, 0xf59e0b, 0.3);
    graphics.beginPath();
    graphics.moveTo(x, y - 38);
    graphics.lineTo(x, y - 38);
    graphics.strokePath();
  }

  /**
   * Draws the Mystic Void Cave — a dark cavern with glowing portal rift.
   */
  static drawMysticCave(graphics: Phaser.GameObjects.Graphics, x: number, y: number): void {
    // === CAVE ROCKY FORMATION ===
    // Outer dark jagged rocks
    graphics.fillStyle(0x0f172a, 1);
    graphics.beginPath();
    graphics.moveTo(x - 24, y + 6);
    graphics.lineTo(x - 18, y - 12);
    graphics.lineTo(x - 14, y - 28);
    graphics.lineTo(x - 6, y - 36);
    graphics.lineTo(x, y - 40);
    graphics.lineTo(x + 6, y - 36);
    graphics.lineTo(x + 14, y - 28);
    graphics.lineTo(x + 18, y - 12);
    graphics.lineTo(x + 24, y + 6);
    graphics.closePath();
    graphics.fillPath();

    // Inner stone layer (slightly lighter)
    graphics.fillStyle(0x1e293b, 0.8);
    graphics.beginPath();
    graphics.moveTo(x - 20, y + 4);
    graphics.lineTo(x - 12, y - 22);
    graphics.lineTo(x, y - 34);
    graphics.lineTo(x + 12, y - 22);
    graphics.lineTo(x + 20, y + 4);
    graphics.closePath();
    graphics.fillPath();

    // Crack detail lines
    graphics.lineStyle(1, 0x475569, 0.4);
    graphics.beginPath();
    graphics.moveTo(x - 16, y - 8);
    graphics.lineTo(x - 12, y - 22);
    graphics.moveTo(x + 16, y - 8);
    graphics.lineTo(x + 12, y - 22);
    graphics.strokePath();

    // === CAVE ARCH OUTLINE ===
    graphics.lineStyle(2, 0xa855f7, 0.7);
    graphics.beginPath();
    graphics.moveTo(x - 20, y + 4);
    graphics.lineTo(x - 14, y - 26);
    graphics.lineTo(x, y - 38);
    graphics.lineTo(x + 14, y - 26);
    graphics.lineTo(x + 20, y + 4);
    graphics.strokePath();

    // === PORTAL VORTEX ===
    // Outer void
    graphics.fillStyle(0x1e1b4b, 0.95);
    graphics.fillEllipse(x, y - 10, 24, 30);
    // Mid ring
    graphics.fillStyle(0x3b0764, 0.9);
    graphics.fillEllipse(x, y - 10, 18, 22);
    // Inner energy
    graphics.fillStyle(0x7c3aed, 0.85);
    graphics.fillEllipse(x, y - 10, 12, 16);
    // Core glow
    graphics.fillStyle(0xc084fc, 0.9);
    graphics.fillEllipse(x, y - 10, 6, 8);
    // Bright center
    graphics.fillStyle(0xe9d5ff, 0.95);
    graphics.fillCircle(x, y - 10, 3);

    // === FLOATING ESSENCE MOTES ===
    graphics.fillStyle(0xc084fc, 0.6);
    graphics.fillCircle(x - 10, y - 24, 2);
    graphics.fillCircle(x + 8, y - 22, 1.5);
    graphics.fillCircle(x - 6, y - 30, 1.5);
  }

  /**
   * Draws an Ancient Aether Grove tree — lush canopy with bioluminescent foliage.
   */
  static drawGroveTree(graphics: Phaser.GameObjects.Graphics, x: number, y: number): void {
    // === GROUND PLATFORM ===
    graphics.fillStyle(0x14532d, 0.6);
    graphics.fillEllipse(x, y + 4, 32, 12);

    // === HARVESTED TIMBER LOGS ===
    graphics.fillStyle(0x522e11, 1);
    graphics.fillRect(x - 18, y, 12, 4);
    graphics.lineStyle(1, 0x78350f, 0.6);
    graphics.strokeRect(x - 18, y, 12, 4);
    graphics.fillStyle(0x6b3a1f, 1);
    graphics.fillRect(x + 10, y + 2, 10, 3);
    // Log cross-section circles
    graphics.fillStyle(0x92400e, 0.8);
    graphics.fillCircle(x - 6, y + 2, 2);
    graphics.fillCircle(x + 20, y + 3.5, 1.5);

    // === EXPOSED ROOTS ===
    graphics.lineStyle(2, 0x78350f, 0.7);
    graphics.beginPath();
    graphics.moveTo(x - 3, y);
    graphics.lineTo(x - 12, y + 4);
    graphics.moveTo(x + 3, y);
    graphics.lineTo(x + 10, y + 5);
    graphics.strokePath();

    // === TRUNK ===
    // Main trunk body
    graphics.fillStyle(0x78350f, 1);
    graphics.beginPath();
    graphics.moveTo(x - 4, y);
    graphics.lineTo(x - 5, y - 18);
    graphics.lineTo(x - 3, y - 22);
    graphics.lineTo(x + 3, y - 22);
    graphics.lineTo(x + 5, y - 18);
    graphics.lineTo(x + 4, y);
    graphics.closePath();
    graphics.fillPath();
    // Bark texture highlight
    graphics.fillStyle(0x92400e, 0.5);
    graphics.fillRect(x - 2, y - 16, 2, 8);

    // === BRANCH FORKS ===
    graphics.lineStyle(2.5, 0x78350f, 0.9);
    graphics.beginPath();
    graphics.moveTo(x - 2, y - 20);
    graphics.lineTo(x - 10, y - 28);
    graphics.moveTo(x + 2, y - 20);
    graphics.lineTo(x + 10, y - 26);
    graphics.strokePath();

    // === BIOLUMINESCENT FOLIAGE CANOPY ===
    // Main canopy (large, deep green)
    graphics.fillStyle(0x047857, 0.95);
    graphics.fillCircle(x, y - 30, 18);
    // Upper-left lighter cluster
    graphics.fillStyle(0x059669, 0.9);
    graphics.fillCircle(x - 8, y - 34, 12);
    // Upper-right emerald cluster
    graphics.fillStyle(0x10b981, 0.8);
    graphics.fillCircle(x + 6, y - 32, 10);
    // Highlight glow spots
    graphics.fillStyle(0x34d399, 0.6);
    graphics.fillCircle(x - 4, y - 38, 7);
    graphics.fillCircle(x + 8, y - 36, 5);
    // Tiny bioluminescent dots
    graphics.fillStyle(0x6ee7b7, 0.7);
    graphics.fillCircle(x - 10, y - 30, 2);
    graphics.fillCircle(x + 12, y - 28, 1.5);
    graphics.fillCircle(x - 2, y - 40, 1.5);
    graphics.fillCircle(x + 4, y - 24, 1.8);
  }

  /**
   * Draws a small tuft of grass.
   */
  static drawGrassTuft(graphics: Phaser.GameObjects.Graphics, x: number, y: number): void {
    graphics.lineStyle(1.5, 0x34d399, 0.8);
    graphics.beginPath();
    // Center blade
    graphics.moveTo(x, y);
    graphics.lineTo(x, y - 6);
    // Left blade
    graphics.moveTo(x, y);
    graphics.lineTo(x - 3, y - 4);
    // Right blade
    graphics.moveTo(x, y);
    graphics.lineTo(x + 3, y - 4);
    graphics.strokePath();
  }

  /**
   * Draws stylized ocean waves (curves).
   */
  static drawOceanWaves(graphics: Phaser.GameObjects.Graphics, x: number, y: number): void {
    graphics.lineStyle(1.5, 0x7dd3fc, 0.6); // Light blue crest
    graphics.beginPath();

    // Wave crests
    graphics.moveTo(x - 6, y);
    graphics.lineTo(x, y - 3);
    graphics.lineTo(x + 6, y);

    // Wave 2
    graphics.moveTo(x - 10, y + 6);
    graphics.lineTo(x, y + 3);
    graphics.lineTo(x + 10, y + 6);

    graphics.strokePath();
  }

  /**
   * Draws soft radial luminescence aura for landmarks during night/dusk.
   */
  static drawNightGlow(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    radius: number = 32,
    color: number = 0x38bdf8,
    alpha: number = 0.35
  ): void {
    graphics.fillStyle(color, alpha * 0.4);
    graphics.fillCircle(x, y, radius * 1.6);
    graphics.fillStyle(color, alpha);
    graphics.fillCircle(x, y, radius);
  }
}
