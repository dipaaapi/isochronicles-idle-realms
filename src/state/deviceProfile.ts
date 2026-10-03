export type FpsPreset = 30 | 60 | 90;

/**
 * Best-guess FPS preset for this device from CPU cores, memory and touch input.
 * Browsers that hide these values get the middle preset. (No JSON imports: the store
 * uses this for its default and the logic tests load the store in a VM.)
 */
export function recommendedFps(): FpsPreset {
  if (typeof navigator === 'undefined') return 60;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const touch = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
  if (!touch && cores >= 8 && memory >= 8) return 90;
  if (cores >= 4 && memory >= 4) return 60;
  return 30;
}
