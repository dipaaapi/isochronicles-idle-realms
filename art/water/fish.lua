-- Swimming creature for IsoChronicle, generated in Aseprite (batch: see art/water/build.sh).
-- 32x16 at 2x resolution (scaled 0.5 in game), faces right: 6-frame "swim" tail-beat loop
-- and a 4-frame "dive" ripple ring for when it slips under.
-- Param biome = ocean (carp) | magma (lava salamander) | frost (ice fish) | astral (spirit koi).
local W, H = 32, 16
local biome = app.params["biome"] or "ocean"
local out = app.params["out"] or ("fish-" .. biome .. ".aseprite")

local function rgba(r, g, b, a) return app.pixelColor.rgba(r, g, b, a) end
local P = ({
  ocean  = { body = rgba(251,146,60,255),  belly = rgba(254,215,170,255), dark = rgba(194,65,12,255),  fin = rgba(253,186,116,230), eye = rgba(15,23,42,255),    shine = rgba(255,247,237,255), ripple = rgba(224,242,254,170), wake = rgba(186,230,253,110), len = 9.5, girth = 4.2 },
  magma  = { body = rgba(220,38,38,255),   belly = rgba(253,224,71,255),  dark = rgba(69,10,10,255),   fin = rgba(249,115,22,240),  eye = rgba(254,240,138,255), shine = rgba(255,255,255,255), ripple = rgba(253,186,116,200), wake = rgba(251,146,60,150),  len = 11,  girth = 3.0, spots = rgba(254,240,138,255) },
  frost  = { body = rgba(186,230,253,255), belly = rgba(248,250,252,255), dark = rgba(14,116,144,255), fin = rgba(224,242,254,220), eye = rgba(12,74,110,255),   shine = rgba(255,255,255,255), ripple = rgba(248,250,252,190), wake = rgba(224,242,254,120), len = 9,   girth = 3.6 },
  astral = { body = rgba(232,121,249,240), belly = rgba(250,245,255,250), dark = rgba(126,34,206,255), fin = rgba(103,232,249,200), eye = rgba(255,255,255,255), shine = rgba(255,255,255,255), ripple = rgba(216,180,254,190), wake = rgba(103,232,249,140), len = 10,  girth = 4.0, spots = rgba(103,232,249,255) },
})[biome]

local spr = Sprite(W, H, ColorMode.RGB)
spr.filename = out
local layer = spr.layers[1]
layer.name = "fish-" .. biome
for _ = 2, 10 do spr:newEmptyFrame() end

local function swim(f)
  local img = Image(W, H, ColorMode.RGB)
  local beat = math.sin((f - 1) / 6 * math.pi * 2)
  local cy = 8
  local x0, x1 = math.floor(17 - P.len), math.floor(17 + P.len * 0.95)
  for x = x0, x1 do
    local u = (x - 17) / P.len
    local half = math.floor(P.girth * math.sqrt(math.max(0, 1 - u * u)) + 0.5)
    local bend = math.floor(beat * 1.2 * math.max(0, (17 - x) / P.len) + 0.5)
    for y = -half, half do
      local c = P.body
      if y > half * 0.35 then c = P.belly end
      if y == -half then c = P.dark end
      if P.spots and y == 0 and x % 4 == 0 then c = P.spots end
      img:drawPixel(x, cy + y + bend, c)
    end
  end
  -- tail fin swings with the beat
  local tb = math.floor(beat * 3 + 0.5)
  local tx = x0 - 1
  for i = 0, 5 do
    for y = -i, i do img:drawPixel(tx - i, cy + y + tb, (i == 5) and P.dark or P.fin) end
  end
  -- dorsal fin, eye, shine, wake
  for x = 14, 19 do img:drawPixel(x, cy - math.floor(P.girth + 0.5) - 1, P.fin) end
  img:drawPixel(x1 - 3, cy - 1, P.eye)
  img:drawPixel(x1 - 5, cy - 2, P.shine)
  for i = 0, 3 do img:drawPixel(1 + i * 2 - ((f - 1) % 2), cy + ((i % 2 == 0) and 3 or -3), P.wake) end
  return img
end

local function ring(k)
  local img = Image(W, H, ColorMode.RGB)
  local rx, ry = 4 + k * 3, 2 + k * 1.5
  for a = 0, 63 do
    local ang = a / 64 * math.pi * 2
    img:drawPixel(math.floor(16 + math.cos(ang) * rx + 0.5), math.floor(8 + math.sin(ang) * ry + 0.5), P.ripple)
  end
  return img
end

for f = 1, 6 do
  spr:newCel(layer, f, swim(f), Point(0, 0))
  spr.frames[f].duration = 0.09
end
for k = 1, 4 do
  spr:newCel(layer, 6 + k, ring(k - 1), Point(0, 0))
  spr.frames[6 + k].duration = 0.12
end
local s = spr:newTag(1, 6); s.name = "swim"
local d = spr:newTag(7, 10); d.name = "dive"
spr:saveAs(out)
