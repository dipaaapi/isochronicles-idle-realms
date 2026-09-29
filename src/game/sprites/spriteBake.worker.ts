/// <reference lib="webworker" />
import { renderSheet, SheetLayout, VoxelModel } from './VoxelSprite';
import { ENEMY_MODELS } from './enemyModels';
import { MINION_MODELS } from './minionModels';

export const CHARACTER_MODELS: Record<string, () => VoxelModel> = { ...MINION_MODELS, ...ENEMY_MODELS };

/** Message posted back for every baked character sprite sheet. */
export interface BakedSheet {
  key: string;
  layout: SheetLayout;
  width: number;
  height: number;
  /** Pixels from the foot anchor up to the tallest opaque pixel in any frame. */
  headroom: number;
  data: Uint8ClampedArray;
}

// Ray-casting every frame takes several seconds, so it runs here instead of on the game thread.
// The message is the list of model keys this worker should bake.
self.onmessage = (event: MessageEvent<string[]>) => {
  for (const key of event.data) {
    const make = CHARACTER_MODELS[key];
    if (!make) continue;
    const { layout, width, height, data } = renderSheet(make());

    let topRow = layout.frameHeight;
    for (let y = 0; y < height && topRow > 0; y++) {
      const rowInFrame = y % layout.frameHeight;
      if (rowInFrame >= topRow) continue;
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 0) {
          topRow = rowInFrame;
          break;
        }
      }
    }

    const message: BakedSheet = { key, layout, width, height, headroom: layout.anchorY - topRow, data };
    (self as unknown as DedicatedWorkerGlobalScope).postMessage(message, [data.buffer]);
  }
};
