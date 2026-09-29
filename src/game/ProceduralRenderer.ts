import Phaser from 'phaser';
import { TileType } from '../types/game';

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
export function getTileColors(
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
}
