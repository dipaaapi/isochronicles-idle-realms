import { LAIR_LENGTH, LAIR_WIDTH } from '../../state/lairExpedition';

/**
 * Tile pathing for the 10×80 lair: BFS over a blocked-tile predicate that
 * changes every frame (magma pulses, rockfalls), so paths are short-lived and
 * recomputed cheaply. Returns the next tile to step onto, or null.
 */
export function nextStep(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  blocked: (x: number, y: number) => boolean,
): { x: number; y: number } | null {
  if (fromX === toX && fromY === toY) return null;
  const key = (x: number, y: number) => y * LAIR_WIDTH + x;
  const prev = new Int32Array(LAIR_WIDTH * LAIR_LENGTH).fill(-1);
  const start = key(fromX, fromY);
  prev[start] = start;
  const queue = [start];
  let found = -1;
  // Search toward the goal only within a window around the two points (cheap per unit)
  const minY = Math.max(0, Math.min(fromY, toY) - 4);
  const maxY = Math.min(LAIR_LENGTH - 1, Math.max(fromY, toY) + 4);
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    const cx = cur % LAIR_WIDTH;
    const cy = Math.floor(cur / LAIR_WIDTH);
    if (cx === toX && cy === toY) { found = cur; break; }
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || nx >= LAIR_WIDTH || ny < minY || ny > maxY) continue;
      const k = key(nx, ny);
      if (prev[k] !== -1 || blocked(nx, ny)) continue;
      // No corner cutting past a blocked tile
      if (dx !== 0 && dy !== 0 && (blocked(cx + dx, cy) || blocked(cx, cy + dy))) continue;
      prev[k] = cur;
      queue.push(k);
    }
  }
  if (found < 0) return null;
  let step = found;
  while (prev[step] !== start) step = prev[step];
  return { x: step % LAIR_WIDTH, y: Math.floor(step / LAIR_WIDTH) };
}
