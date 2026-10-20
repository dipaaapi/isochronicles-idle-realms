/// <reference lib="webworker" />
import { renderStrip, StripLayout } from './VoxelSprite';
import { STRUCTURE_MODELS, StructureKey } from './structureModels';
import { expandStructure } from './structureStates';

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
  /** Frames per row: HD strips are wrapped into a grid to stay under GPU texture limits. */
  perRow: number;
  data: Uint8ClampedArray;
}

const MAX_TEXTURE_WIDTH = 4096;

/** Re-packs a one-row strip into rows of `perRow` frames. */
function wrapStrip(data: Uint8ClampedArray, fw: number, fh: number, columns: number) {
  const perRow = Math.max(1, Math.min(columns, Math.floor(MAX_TEXTURE_WIDTH / fw)));
  const rows = Math.ceil(columns / perRow);
  const width = perRow * fw, height = rows * fh, srcWidth = columns * fw;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let c = 0; c < columns; c++) {
    const dx = (c % perRow) * fw, dy = Math.floor(c / perRow) * fh;
    for (let y = 0; y < fh; y++) {
      const src = (y * srcWidth + c * fw) * 4;
      out.set(data.subarray(src, src + fw * 4), ((dy + y) * width + dx) * 4);
    }
  }
  return { perRow, width, height, data: out };
}

// Buildings and portals face one fixed direction, so each bakes into a single row of frames.
self.onmessage = (event: MessageEvent<StructureKey[]>) => {
  for (const key of event.data) {
    const make = STRUCTURE_MODELS[key];
    if (!make) continue;
    const { model, animations, rates, loops, ops } = expandStructure(make());
    const strip = renderStrip(model, animations, undefined, ops);
    const { layout } = strip;
    const { width, height, data } = strip;
    let topRow = height;
    for (let y = 0; y < height && topRow === height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 0) {
          topRow = y;
          break;
        }
      }
    }
    const wrapped = wrapStrip(data, layout.frameWidth, layout.frameHeight, layout.columns);
    const message: BakedStrip = {
      key, layout, rates, loops, width: wrapped.width, height: wrapped.height, perRow: wrapped.perRow,
      headroom: layout.anchorY - topRow, data: wrapped.data,
    };
    (self as unknown as DedicatedWorkerGlobalScope).postMessage(message, [wrapped.data.buffer]);
  }
};
