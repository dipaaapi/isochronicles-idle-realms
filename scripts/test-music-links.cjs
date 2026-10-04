// External music links (YouTube / Spotify): only real provider links are accepted,
// and the embed URL is always rebuilt from the parsed id.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const mod = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/state/externalMusic.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, {
  exports: mod,
  URL,
  require: (name) => {
    if (name === 'zustand') return { create: () => () => ({}) };
    throw new Error(`unexpected import ${name}`);
  },
});
const { parseMusicLink: parse, musicEmbedUrl: embed, musicLink: link } = mod;

const accepted = {
  'https://www.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI': ['YOUTUBE', 'playlist', 'PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI'],
  'https://youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ': ['YOUTUBE', 'playlist', 'RDdQw4w9WgXcQ'],
  'youtu.be/dQw4w9WgXcQ': ['YOUTUBE', 'video', 'dQw4w9WgXcQ'],
  'https://m.youtube.com/watch?v=dQw4w9WgXcQ': ['YOUTUBE', 'video', 'dQw4w9WgXcQ'],
  'https://www.youtube.com/shorts/dQw4w9WgXcQ': ['YOUTUBE', 'video', 'dQw4w9WgXcQ'],
  'https://music.youtube.com/playlist?list=OLAK5uy_kAb1Z': ['YOUTUBE', 'playlist', 'OLAK5uy_kAb1Z'],
  '<iframe width="560" height="315" src="https://www.youtube.com/embed/videoseries?si=x&amp;list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI" frameborder="0"></iframe>':
    ['YOUTUBE', 'playlist', 'PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI'],
  'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc': ['SPOTIFY', 'playlist', '37i9dQZF1DXcBWIGoYBM5M'],
  'https://open.spotify.com/intl-fr/album/4aawyAB9vmqN3uQ7FjRGTy': ['SPOTIFY', 'album', '4aawyAB9vmqN3uQ7FjRGTy'],
  'spotify:track:4cOdK2wGLETKBW3PvgPWqT': ['SPOTIFY', 'track', '4cOdK2wGLETKBW3PvgPWqT'],
  '<iframe style="border-radius:12px" src="https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M?utm_source=generator" width="100%" height="352"></iframe>':
    ['SPOTIFY', 'playlist', '37i9dQZF1DXcBWIGoYBM5M'],
};
for (const [input, [provider, kind, id]] of Object.entries(accepted)) {
  const src = parse(input);
  assert.ok(src, `should accept ${input}`);
  assert.deepEqual({ ...src }, { provider, kind, id }, input);
  const url = new URL(embed(src));
  assert.ok(['www.youtube-nocookie.com', 'open.spotify.com'].includes(url.hostname), `embed host for ${input}`);
  assert.deepEqual({ ...parse(link(src)) }, { ...src }, `canonical link round-trips for ${input}`);
}

const rejected = [
  '', 'javascript:alert(1)', 'https://evil.com/playlist?list=PLxx',
  'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=short',
  'https://open.spotify.com/user/abc', 'spotify:playlist:abc',
  'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"onload=alert(1)',
  '<iframe src="https://evil.com/embed/dQw4w9WgXcQ"></iframe>',
  '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  `https://www.youtube.com/watch?v=dQw4w9WgXcQ&x=${'a'.repeat(600)}`,
];
for (const input of rejected) assert.equal(parse(input), null, `should reject ${input.slice(0, 80)}`);

console.log(`music links: ${Object.keys(accepted).length} accepted, ${rejected.length} rejected — ok`);
