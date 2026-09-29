/// <reference lib="webworker" />
import { renderStrip, StripLayout } from './VoxelSprite';
import { STRUCTURE_MODELS, StructureKey } from './structureModels';

/** Message posted back for every baked structure strip. */
export interface BakedStrip {
  key: StructureKey;
  layout: StripLayout;
  rates: Record<string, number>;
  loops: string[];
  width: number;
  height: number;
  /** Strip pixels from the foot anchor up to the tallest opaque pixel in any frame. */
  headroom: number;
  data: Uint8ClampedArray;
}

// Buildings and portals face one fixed direction, so each bakes into a single row of frames.
self.onmessage = (event: MessageEvent<StructureKey[]>) => {
  for (const key of event.data) {
    const make = STRUCTURE_MODELS[key];
    if (!make) continue;
    const model = make();
    const { layout, width, height, data } = renderStrip(model, model.animations);
    let topRow = height;
    for (let y = 0; y < height && topRow === height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 0) {
          topRow = y;
          break;
        }
      }
    }
    const message: BakedStrip = {
      key, layout, rates: model.rates, loops: model.loops, width, height, headroom: layout.anchorY - topRow, data,
    };
    (self as unknown as DedicatedWorkerGlobalScope).postMessage(message, [data.buffer]);
  }
};
