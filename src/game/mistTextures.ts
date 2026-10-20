import Phaser from 'phaser';

/**
 * Soft cloud textures shared by the rift fog (riftMist) and the sky clouds
 * (WorldEffects), so both read as the same mist: lobed puffs with shaded
 * bellies and lit crowns, and flat banks. Plus the sun/moon halos
 * painted in the same soft style. Painted once per page.
 */
export const MIST_TEX = {
  puff: 'rift-mist-puff',
  bank: 'rift-mist-bank',
  glint: 'rift-mist-glint',
  sunHalo: 'sky-halo-sun',
  sunRays: 'sky-rays-sun',
  moonHalo: 'sky-halo-moon',
  sunDisc: 'sky-disc-sun',
  moonDisc: 'sky-disc-moon',
  starGlow: 'sky-star-glow',
} as const;

export function paintMistTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(MIST_TEX.starGlow)) return;
  const paint = (key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
    if (scene.textures.exists(key)) return;
    const tex = scene.textures.createCanvas(key, w, h);
    if (!tex) return;
    draw(tex.context);
    tex.refresh();
  };
  const blob = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, inner: string, outer: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, inner);
    g.addColorStop(0.55, outer);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  // Billowing puff: shaded underside, bright lit crown, several overlapping lobes
  // Canvases are padded so no gradient ever reaches the texture edge (no hard cut lines)
  paint(MIST_TEX.puff, 160, 128, (ctx) => {
    ctx.translate(16, 16);
    const lobes = [[64, 56, 34], [40, 60, 26], [88, 60, 26], [52, 42, 24], [78, 40, 22], [64, 32, 18]];
    for (const [x, y, r] of lobes) blob(ctx, x, y + 6, r * 1.15, 'rgba(71,85,105,0.55)', 'rgba(71,85,105,0.25)');
    for (const [x, y, r] of lobes) blob(ctx, x, y, r, 'rgba(226,232,240,0.85)', 'rgba(203,213,225,0.45)');
    for (const [x, y, r] of lobes.slice(3)) blob(ctx, x - 5, y - 6, r * 0.6, 'rgba(255,255,255,0.8)', 'rgba(255,255,255,0.25)');
  });
  // Bank: long, flat, low-contrast layer
  paint(MIST_TEX.bank, 240, 112, (ctx) => {
    ctx.translate(24, 24);
    for (let i = 0; i < 9; i++) blob(ctx, 20 + i * 19, 34 + Math.sin(i * 1.7) * 5, 26 + (i % 3) * 5, 'rgba(148,163,184,0.55)', 'rgba(148,163,184,0.22)');
  });
  // Warm lantern glint
  paint(MIST_TEX.glint, 32, 32, (ctx) => blob(ctx, 16, 16, 15, 'rgba(255,214,140,0.95)', 'rgba(249,115,22,0.35)'));
  // Sun: warm gold halo and a soft ring of long rays
  paint(MIST_TEX.sunHalo, 160, 160, (ctx) => {
    blob(ctx, 80, 80, 80, 'rgba(253,224,71,0.5)', 'rgba(251,146,60,0.16)');
    blob(ctx, 80, 80, 38, 'rgba(255,251,235,0.65)', 'rgba(253,230,138,0.3)');
  });
  paint(MIST_TEX.sunRays, 192, 192, (ctx) => {
    ctx.translate(96, 96);
    for (let i = 0; i < 12; i++) {
      ctx.rotate(Math.PI / 6);
      const g = ctx.createLinearGradient(0, 0, 0, i % 2 ? -78 : -94);
      g.addColorStop(0, 'rgba(254,240,138,0.55)');
      g.addColorStop(1, 'rgba(254,240,138,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-5, -18);
      ctx.lineTo(0, i % 2 ? -78 : -94);
      ctx.lineTo(5, -18);
      ctx.fill();
    }
  });
  // Sun disc: soft painted orb (same airbrushed style as the clouds), white-hot core to amber rim
  paint(MIST_TEX.sunDisc, 64, 64, (ctx) => {
    const g = ctx.createRadialGradient(28, 28, 0, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,250,1)');
    g.addColorStop(0.45, 'rgba(254,240,138,1)');
    g.addColorStop(0.8, 'rgba(251,191,36,1)');
    g.addColorStop(0.93, 'rgba(249,115,22,0.9)');
    g.addColorStop(1, 'rgba(249,115,22,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fill();
  });
  // Moon disc: pale silver, soft craters, lit on its left with a soft terminator on the right
  paint(MIST_TEX.moonDisc, 56, 56, (ctx) => {
    const g = ctx.createRadialGradient(22, 22, 0, 28, 28, 25);
    g.addColorStop(0, 'rgba(248,250,252,1)');
    g.addColorStop(0.75, 'rgba(203,213,225,1)');
    g.addColorStop(0.94, 'rgba(148,163,184,0.95)');
    g.addColorStop(1, 'rgba(148,163,184,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(28, 28, 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-atop';
    for (const [x, y, r] of [[20, 20, 5], [33, 30, 4], [24, 37, 3], [36, 17, 2.5], [16, 31, 2]]) {
      blob(ctx, x, y, r, 'rgba(100,116,139,0.45)', 'rgba(100,116,139,0.2)');
    }
    const shadow = ctx.createLinearGradient(20, 0, 56, 0);
    shadow.addColorStop(0, 'rgba(30,27,75,0)');
    shadow.addColorStop(0.55, 'rgba(30,27,75,0.25)');
    shadow.addColorStop(1, 'rgba(30,27,75,0.75)');
    ctx.fillStyle = shadow;
    ctx.fillRect(0, 0, 56, 56);
  });
  // Soft glow sprite for bright stars, comet heads and shooting stars
  paint(MIST_TEX.starGlow, 32, 32, (ctx) => blob(ctx, 16, 16, 15, 'rgba(255,255,255,1)', 'rgba(199,210,254,0.35)'));
  // Moon: cool silver-violet halo, the sun's complement
  paint(MIST_TEX.moonHalo, 128, 128, (ctx) => {
    blob(ctx, 64, 64, 64, 'rgba(199,210,254,0.45)', 'rgba(167,139,250,0.14)');
    blob(ctx, 64, 64, 28, 'rgba(241,245,249,0.55)', 'rgba(199,210,254,0.25)');
  });
}
