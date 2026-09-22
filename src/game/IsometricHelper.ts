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

  /**
   * Calculates z-depth for Phaser game objects so foreground tiles and units
   * properly occlude background tiles.
   */
  static getDepth(gridX: number, gridY: number, layerOffset: number = 0): number {
    return (gridX + gridY) * 20 + layerOffset;
  }
}
