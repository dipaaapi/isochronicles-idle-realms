import { GridPoint } from '../types/game';

interface ANode {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent: ANode | null;
}

/**
 * Lightweight synchronous A* pathfinder for the 10×10 isometric grid.
 * Returns a path immediately — no async, no callbacks, no queuing.
 */
export class PathfindingService {
  private gridWidth: number = 10;
  private gridHeight: number = 10;
  private acceptableTiles: number[] = [0];
  private walkableGrid: number[][] = [];

  public initGrid(walkableGrid: number[][]): void {
    this.gridHeight = walkableGrid.length;
    this.gridWidth = walkableGrid[0]?.length ?? 10;
    this.walkableGrid = walkableGrid.map((row) => [...row]);
  }

  /**
   * Synchronous A* pathfind. Returns the path array or null if unreachable.
   * On a 10×10 grid this runs in microseconds.
   */
  public findPath(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    allowedTiles: number[] = [0]
  ): GridPoint[] | null {
    // Bounds check
    if (
      startX < 0 || startX >= this.gridWidth ||
      startY < 0 || startY >= this.gridHeight ||
      endX < 0 || endX >= this.gridWidth ||
      endY < 0 || endY >= this.gridHeight
    ) {
      return null;
    }

    // Same tile — trivial
    if (startX === endX && startY === endY) {
      return [{ x: startX, y: startY }];
    }

    const h = (x: number, y: number) => Math.abs(x - endX) + Math.abs(y - endY);

    const open: ANode[] = [];
    const closed = new Set<number>(); // packed int key: y*10+x

    open.push({ x: startX, y: startY, g: 0, h: h(startX, startY), f: h(startX, startY), parent: null });

    const DIRS = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];

    while (open.length > 0) {
      // Pick node with lowest f (small grid → linear scan is fine)
      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[bestIdx].f) bestIdx = i;
      }
      const cur = open[bestIdx];

      if (cur.x === endX && cur.y === endY) {
        // Reconstruct path
        const path: GridPoint[] = [];
        let node: ANode | null = cur;
        while (node) {
          path.unshift({ x: node.x, y: node.y });
          node = node.parent;
        }
        return path;
      }

      open.splice(bestIdx, 1);
      closed.add(cur.y * 10 + cur.x);

      for (const { dx, dy } of DIRS) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;

        if (nx < 0 || nx >= this.gridWidth || ny < 0 || ny >= this.gridHeight) continue;
        if (closed.has(ny * 10 + nx)) continue;
        const tileVal = this.walkableGrid[ny]?.[nx] ?? -1;
        if (!allowedTiles.includes(tileVal)) continue;

        const g = cur.g + 1;
        const existing = open.find((n) => n.x === nx && n.y === ny);
        if (existing) {
          if (g < existing.g) {
            existing.g = g;
            existing.f = g + existing.h;
            existing.parent = cur;
          }
        } else {
          const nh = h(nx, ny);
          open.push({ x: nx, y: ny, g, h: nh, f: g + nh, parent: cur });
        }
      }
    }

    return null; // No path found — caller should use direct fallback
  }

  /**
   * No-op — kept so MainScene.update() doesn't need changing.
   * With synchronous A* there is no queue to process.
   */
  public calculate(): void {}
}
