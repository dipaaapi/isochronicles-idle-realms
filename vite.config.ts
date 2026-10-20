import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Modes:
 *  - `vite` / `vite build`        web build (PWA + service worker)
 *  - `vite build --mode steam`    desktop build loaded by Electron (electron/main.cjs): no service
 *                                 worker, saves go through the desktop bridge
 * Dev tools (Developer Mode, DevPanel) exist only in the dev server: `__DEV_TOOLS__` is a
 * compile-time constant, so release builds drop that code entirely.
 */
export default defineConfig(({ command, mode }) => ({
  base: './',
  define: {
    __DEV_TOOLS__: JSON.stringify(command === 'serve'),
    __STEAM__: JSON.stringify(mode === 'steam'),
  },
  plugins: [
    react(),
    mode !== 'steam' && VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['robots.txt'],
      manifest: {
        name: 'IsoChronicle: Idle Realms',
        short_name: 'IsoChronicle',
        description: 'Offline Aetherpunk Isometric Idle Base-Builder Simulation Game',
        theme_color: '#0f172a',
        background_color: '#020617',
        display: 'standalone',
        orientation: 'landscape',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,jpg,svg,json}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024 // 5 MB
      }
    })
  ],
  build: {
    outDir: mode === 'steam' ? 'dist-steam' : 'dist',
    // Phaser alone is ~1.5 MB minified; keep vendors in their own long-cached chunks
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: {
      usePolling: true,
      interval: 300
    }
  }
}));
