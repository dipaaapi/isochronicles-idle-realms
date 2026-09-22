import React, { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { MainScene } from './MainScene';
import { useGameStore } from '../state/useGameStore';

export const PhaserGame: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const targetFps = useGameStore((state) => state.targetFps);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    const initialTargetFps = useGameStore.getState().targetFps;
    // forceSetTimeOut is only beneficial in battery-saver / 30fps mode.
    // At 60+ fps it causes inconsistent frame-pacing compared to rAF.
    const useForcedTimeout = initialTargetFps <= 30;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: '100%',
      height: '100%',
      backgroundColor: '#020617',
      fps: {
        target: initialTargetFps,
        forceSetTimeOut: useForcedTimeout,
        // Smooth the delta to avoid sudden spike spikes from tab-suspension
        smoothStep: true,
      },
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [MainScene],
      render: {
        antialias: true,
        pixelArt: false,
        roundPixels: false,
        // Request the high-performance GPU power profile from the browser
        powerPreference: 'high-performance',
        // Reduce input latency when supported (Chrome/Edge with WebGL2)
        desynchronized: true,
      },
      // Disable the default Phaser banner to shave a tiny bit of init time
      banner: false,
    };

    gameRef.current = new Phaser.Game(config);

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  // Propagate FPS target changes made at runtime (from Settings drawer)
  useEffect(() => {
    if (!gameRef.current) return;
    // Update the loop target FPS — forceSetTimeOut cannot be changed at runtime
    // (it is a read-only property on the live GameLoop); it is set correctly at init.
    gameRef.current.loop.targetFps = targetFps;
  }, [targetFps]);

  return (
    <div
      ref={containerRef}
      id="phaser-canvas-container"
      className="absolute inset-0 w-full h-full z-0 overflow-hidden"
    />
  );
};
