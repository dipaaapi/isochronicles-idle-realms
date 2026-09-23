import React, { useEffect, useRef } from 'react';
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
    if (!containerRef.current || gameRef.current) return;

    const initialTargetFps = useGameStore.getState().targetFps;
    const useForcedTimeout = initialTargetFps <= 30;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: '100%',
      height: '100%',
      transparent: true,
      backgroundColor: 'rgba(0,0,0,0)',
      fps: {
        target: initialTargetFps,
        forceSetTimeOut: useForcedTimeout,
        smoothStep: true,
      },
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: '100%',
        height: '100%',
      },
      scene: [MainScene],
      render: {
        antialias: true,
        pixelArt: true,
        roundPixels: true,
        powerPreference: 'high-performance',
        desynchronized: false,
        clearBeforeRender: true,
      },
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
    <div className="relative w-full h-full overflow-hidden bg-slate-950">
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