import { GridPoint, ScreenPoint } from '../types/game';

export const TILE_WIDTH = 72;
export const TILE_HEIGHT = 36;
export const TILE_DEPTH = 24; // Isometric 3D prism depth

export class IsometricHelper {
  static gridToScreen(gridX: number, gridY: number, originX: number = 0, originY: number = 0): ScreenPoint {
    const halfW = TILE_WIDTH / 2;
    const halfH = TILE_HEIGHT / 2;
    return {
      x: (gridX - gridY) * halfW + originX,
      y: (gridX + gridY) * halfH + originY,
    };
  }

  static screenToGrid(screenX: number, screenY: number, originX: number = 0, originY: number = 0): GridPoint {
    const dx = screenX - originX;
    const dy = screenY - originY;
    const halfW = TILE_WIDTH / 2;
    const halfH = TILE_HEIGHT / 2;

    const gridX = Math.floor((dx / halfW + dy / halfH) / 2);
    const gridY = Math.floor((dy / halfH - dx / halfW) / 2);

    return { x: gridX, y: gridY };
  }

  /** Spreadsheet-style column letters for a grid X (0 → "A", 25 → "Z", 26 → "AA", 29 → "AD"). */
  static fileLetter(gridX: number): string {
    let n = gridX + 1;
    let out = '';
    while (n > 0) {
      const r = (n - 1) % 26;
      out = String.fromCharCode(65 + r) + out;
      n = Math.floor((n - 1) / 26);
    }
    return out;
  }

  /** Chess-style tile name: column letter from X, 1-based row number from Y (e.g. (4,5) → "E6"). */
  static tileName(gridX: number, gridY: number): string {
    return `${IsometricHelper.fileLetter(gridX)}${gridY + 1}`;
  }

  /**
   * Calculates z-depth for Phaser game objects so foreground tiles and units
   * properly occlude background tiles.
   */
  static getDepth(gridX: number, gridY: number, layerOffset: number = 0): number {
    return (gridX + gridY) * 20 + layerOffset;
  }
}
