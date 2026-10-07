import React, { useEffect, useRef } from 'react';
import { useGraphicsSettings } from '../state/graphicsSettings';
import Phaser from 'phaser';
import { MainScene } from './MainScene';
import { useGameStore } from '../state/useGameStore';

export const PhaserGame: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const targetFps = useGameStore((state) => state.targetFps);
  const platformPhase = useGameStore((state) => state.platformPhase);
  const timeOfDay = useGameStore((state) => state.timeOfDay);
  const weather = useGameStore((state) => state.weather);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || gameRef.current) return;

    const initialTargetFps = useGameStore.getState().targetFps;
    const useForcedTimeout = initialTargetFps <= 30;

    // High-DPI: the canvas backing store is devicePixelRatio× the CSS size and
    // Scale zoom (1/dpr) shrinks it back, so pixels map 1:1 to the physical screen.
    const readDpr = () =>
      useGameStore.getState().targetFps <= 30 ? 1 : Math.min(window.devicePixelRatio || 1, 3);
    let dpr = readDpr();
    const cssWidth = () => Math.max(1, Math.round(container.clientWidth));
    const cssHeight = () => Math.max(1, Math.round(container.clientHeight));

    const config: Phaser.Types.Core.GameConfig = {
      // AUTO selects WebGL (and lets the browser choose the available adapter,
      // including discrete NVIDIA/AMD GPUs) with Canvas as a compatibility fallback.
      type: Phaser.AUTO,
      parent: container,
      width: cssWidth() * dpr,
      height: cssHeight() * dpr,
      transparent: true,
      backgroundColor: 'rgba(0,0,0,0)',
      fps: {
        target: initialTargetFps,
        forceSetTimeOut: useForcedTimeout,
        smoothStep: true,
      },
      scale: {
        // RESIZE mode ignores zoom, so resizing is handled by the ResizeObserver below
        mode: Phaser.Scale.NONE,
        zoom: 1 / dpr,
      },
      callbacks: {
        preBoot: (game) => game.registry.set('dpr', dpr),
      },
      scene: [MainScene],
      render: {
        antialias: true,
        // Keep WebGL available even when the browser flags an adapter as slow;
        // its own context selection can still use an integrated or software adapter.
        failIfMajorPerformanceCaveat: false,
        // Pixel art is nearest-neighbor, so multisample edges add cost without helping.
        antialiasGL: false,
        pixelArt: true,
        roundPixels: true,
        powerPreference: 'high-performance',
        desynchronized: false,
        clearBeforeRender: true,
      },
      banner: false,
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    const applySize = () => {
      if (!game.isBooted) return; // initial size is already set via config
      const nextDpr = readDpr();
      if (nextDpr !== dpr) {
        dpr = nextDpr;
        game.scale.setZoom(1 / dpr);
        game.registry.set('dpr', dpr);
      }
      game.scale.resize(cssWidth() * dpr, cssHeight() * dpr);
    };

    const resizeObserver = new ResizeObserver(applySize);
    resizeObserver.observe(container);
    // Moving the window between monitors changes devicePixelRatio without a resize
    const dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    dprQuery.addEventListener('change', applySize);
    const unsubscribeFps = useGameStore.subscribe((state, prev) => {
      if (state.targetFps !== prev.targetFps) applySize();
    });

    return () => {
      resizeObserver.disconnect();
      dprQuery.removeEventListener('change', applySize);
      unsubscribeFps();
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  const brightness = useGraphicsSettings((s) => s.brightness);

  useEffect(() => {
    if (!gameRef.current) return;
    gameRef.current.loop.targetFps = targetFps;
  }, [targetFps]);

  // Dynamic Ambient Overlay kulay base sa Time of Day at Weather
  const getAmbientTintStyle = () => {
    if (weather === 'RAIN') return 'bg-blue-950/20';
    if (weather === 'HEATWAVE') return 'bg-orange-500/10';
    if (weather === 'SNOW') return 'bg-slate-200/10';

    switch (timeOfDay) {
      case 'DAWN':
        return 'bg-amber-700/15 mix-blend-color-burn';
      case 'DUSK':
        return 'bg-purple-900/25 mix-blend-multiply';
      case 'NIGHT':
        return 'bg-slate-950/45 mix-blend-multiply';
      default:
        return 'bg-transparent';
    }
  };

  return (
    <div
      className="relative w-full h-full overflow-hidden bg-slate-950"
      style={brightness !== 1 ? { filter: `brightness(${brightness})` } : undefined}
    >
      {/* 1. Base Pixel Art Wallpaper */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none bg-cover bg-center transition-all duration-700"
        style={{
          backgroundImage: `url('${import.meta.env.BASE_URL}backgrounds/phase${platformPhase || 1}.jpg')`,
        }}
      />

      {/* 2. Fullscreen Ambient Day/Night & Weather Tint (Walang kanto, sasakop sa buong viewport) */}
      <div
        aria-hidden="true"
        className={`absolute inset-0 pointer-events-none transition-colors duration-1000 z-1 ${getAmbientTintStyle()}`}
      />

      {/* 3. Phaser Isometric Canvas */}
      <div
        ref={containerRef}
        id="phaser-canvas-container"
        className="absolute inset-0 w-full h-full z-0 overflow-hidden bg-transparent"
      />
    </div>
  );
};
