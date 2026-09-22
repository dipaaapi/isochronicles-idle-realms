/**
 * FPSController — Rolling-average FPS tracker, quality-tier detection,
 * and per-frame performance diagnostics.
 *
 * Design goals:
 *  • Zero allocations per frame (pre-allocated circular buffer)
 *  • No Zustand reads — purely a data class driven by MainScene.update()
 *  • Deterministic quality tier so callers scale effects consistently
 */

export type QualityTier = 'LOW' | 'MEDIUM' | 'HIGH';

export interface FPSDebugStats {
  /** Measured rolling-average FPS over the last SAMPLE_SIZE frames */
  measured: number;
  /** Current target FPS from game settings */
  target: number;
  /** Raw ms elapsed for the last frame */
  frameTimeMs: number;
  /** Number of frames in the last second that exceeded 50ms (jank frames) */
  jankCount: number;
  /** Quality tier derived from measured vs target ratio */
  qualityTier: QualityTier;
  /** True when measured FPS is <75% of target for >3 seconds consecutively */
  performanceWarning: boolean;
}

const SAMPLE_SIZE = 60;   // Rolling window: 60 frames ≈ 1 second at 60fps
const JANK_THRESHOLD_MS = 50; // A frame >50ms is considered a jank frame
const WARNING_DURATION_S = 3; // Consecutive seconds below 75% target → warning

export class FPSController {
  private frameTimes: Float32Array = new Float32Array(SAMPLE_SIZE);
  private frameIndex: number = 0;
  private frameCount: number = 0;

  private jankFramesInWindow: number = 0;
  private jankBuffer: Uint8Array = new Uint8Array(SAMPLE_SIZE);

  private targetFps: number = 60;
  private measuredFps: number = 60;
  private lastFrameTimeMs: number = 16.67;

  // Performance warning tracking
  private poorPerfSeconds: number = 0;
  private performanceWarning: boolean = false;

  // Scale factor cache — updated once per frame
  private _scaleFactor: number = 1.0;
  private _qualityTier: QualityTier = 'HIGH';

  constructor(targetFps: number = 60) {
    this.targetFps = targetFps;
    // Pre-fill with expected frame time so first readings are sensible
    const expectedMs = 1000 / targetFps;
    this.frameTimes.fill(expectedMs);
  }

  /**
   * Call once per game frame with the Phaser delta value (ms).
   * @param deltaMs - Time elapsed since last frame in milliseconds.
   * @param newTargetFps - Pass the current target FPS from game settings.
   */
  public tick(deltaMs: number, newTargetFps: number): void {
    this.targetFps = newTargetFps;
    this.lastFrameTimeMs = deltaMs;

    // Update jank buffer before overwriting old slot
    const wasJank = this.jankBuffer[this.frameIndex];
    const isJank = deltaMs > JANK_THRESHOLD_MS ? 1 : 0;
    this.jankFramesInWindow -= wasJank;
    this.jankFramesInWindow += isJank;
    this.jankBuffer[this.frameIndex] = isJank;

    // Write to circular frame-time buffer
    this.frameTimes[this.frameIndex] = deltaMs;
    this.frameIndex = (this.frameIndex + 1) % SAMPLE_SIZE;
    if (this.frameCount < SAMPLE_SIZE) this.frameCount++;

    // Compute rolling-average FPS from filled samples
    const sampleCount = this.frameCount;
    let sum = 0;
    for (let i = 0; i < sampleCount; i++) {
      sum += this.frameTimes[i];
    }
    const avgMs = sum / sampleCount;
    this.measuredFps = avgMs > 0 ? Math.round(1000 / avgMs) : this.targetFps;

    // Derive quality tier
    const ratio = this.measuredFps / Math.max(1, this.targetFps);
    if (ratio >= 0.90) {
      this._qualityTier = 'HIGH';
      this._scaleFactor = newTargetFps >= 90 ? 1.5 : 1.0;
    } else if (ratio >= 0.60) {
      this._qualityTier = 'MEDIUM';
      this._scaleFactor = 0.65;
    } else {
      this._qualityTier = 'LOW';
      this._scaleFactor = 0.35;
    }

    // Performance warning: track consecutive under-performance
    const deltasSec = deltaMs / 1000;
    if (ratio < 0.75) {
      this.poorPerfSeconds += deltasSec;
      if (this.poorPerfSeconds >= WARNING_DURATION_S) {
        this.performanceWarning = true;
      }
    } else {
      this.poorPerfSeconds = Math.max(0, this.poorPerfSeconds - deltasSec * 2);
      if (this.poorPerfSeconds <= 0) {
        this.performanceWarning = false;
      }
    }
  }

  /**
   * A multiplier for effect intensity:
   *  • HIGH  → 1.0–1.5  (normal / ultra)
   *  • MEDIUM → 0.65    (reduced particles / glow)
   *  • LOW    → 0.35    (minimal effects)
   */
  public getScaleFactor(): number {
    return this._scaleFactor;
  }

  public getQualityTier(): QualityTier {
    return this._qualityTier;
  }

  public getMeasuredFps(): number {
    return this.measuredFps;
  }

  public getDebugStats(): FPSDebugStats {
    return {
      measured: this.measuredFps,
      target: this.targetFps,
      frameTimeMs: this.lastFrameTimeMs,
      jankCount: this.jankFramesInWindow,
      qualityTier: this._qualityTier,
      performanceWarning: this.performanceWarning,
    };
  }

  /**
   * Update the target FPS externally (e.g. when user changes settings).
   */
  public setTargetFps(fps: number): void {
    this.targetFps = fps;
  }

  /**
   * Reset all counters (e.g. after a scene restart).
   */
  public reset(): void {
    this.frameIndex = 0;
    this.frameCount = 0;
    this.jankFramesInWindow = 0;
    this.poorPerfSeconds = 0;
    this.performanceWarning = false;
    const expectedMs = 1000 / Math.max(1, this.targetFps);
    this.frameTimes.fill(expectedMs);
    this.jankBuffer.fill(0);
  }
}
