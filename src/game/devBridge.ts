/** Dev-mode handle on the live scene (set by MainScene, cleared on shutdown). */
export const devBridge: {
  invasion?: { getInvaders(): { isDead: boolean }[]; devKillAll(): number };
  kirov?: { launch(): void; isActive(): boolean };
} = {};
