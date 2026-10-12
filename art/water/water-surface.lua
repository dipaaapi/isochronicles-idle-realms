-- Water surface for IsoChronicle, generated in Aseprite (batch: see art/water/build.sh).
-- One iso tile diamond at 2x resolution (144x72 = 0.5 world unit per pixel), 12 looping frames.
-- The pattern is periodic in tile space, so neighbouring water tiles join seamlessly, and
-- mostly translucent so the realm's own water colour (platforms.ts / PixelTileArt) shows through.
-- Param biome = ocean | magma | frost | astral (one per realm).
local W, H, N = 144, 72, 12
local biome = app.params["biome"] or "ocean"
local out = app.params["out"] or ("water-surface-" .. biome .. ".aseprite")

local function rgba(r, g, b, a) return app.pixelColor.rgba(r, g, b, a) end
-- Thin animated lines on the realm's water colour (no big blobs: on the narrow ring they read as spots).
-- line = wave crests, soft = the faint second ripple family, seam = glowing cracks (magma / frost), dot = glints.
local P = ({
  ocean  = { line = rgba(224,247,255,150), soft = rgba(125,211,252,70),  dot = rgba(255,255,255,230) },
  magma  = { line = rgba(254,240,138,170), soft = rgba(120,40,10,55),   dot = rgba(255,251,235,240), bubbles = true },
  frost  = { line = rgba(240,249,255,120), soft = rgba(186,230,253,60), dot = rgba(255,255,255,255), sparkle = 0.985 },
  astral = { line = rgba(233,213,255,140), soft = rgba(167,139,250,60), dot = rgba(255,255,255,255), stars = true },
})[biome]

local spr = Sprite(W, H, ColorMode.RGB)
spr.filename = out
local layer = spr.layers[1]
layer.name = "surface-" .. biome
for _ = 2, N do spr:newEmptyFrame() end

local TAU = math.pi * 2
local function hash(x, y, f)
  local n = math.sin(x * 12.9898 + y * 78.233 + f * 37.719) * 43758.5453
  return n - math.floor(n)
end

for f = 1, N do
  local t = (f - 1) / N
  local img = Image(W, H, ColorMode.RGB)
  for py = 0, H - 1 do
    for px = 0, W - 1 do
      local sx = (px + 0.5 - W / 2) / (W / 2)
      local sy = (py + 0.5 - H / 2) / (H / 2)
      if math.abs(sx) + math.abs(sy) <= 1 then
        -- tile-space coordinates; integer frequencies keep tiles and the loop seamless
        local gx = (sx + sy) / 2
        local gy = (sy - sx) / 2
        -- two ripple families crossing at an angle; integer frequencies keep tiles and loop seamless
        local w1 = math.sin(TAU * (2 * gx + gy + t) + 0.6 * math.sin(TAU * (gy - t)))
        local w2 = math.sin(TAU * (gx - 2 * gy - t) + 0.6 * math.sin(TAU * (gx + t)))
        local c
        if w1 > 0.93 then c = P.line            -- thin crest line
        elseif w2 > 0.95 then c = P.soft end    -- fainter cross ripple
        if P.seam then
          -- network of thin seams that slowly shifts (magma glow / frost cracks)
          local n = math.sin(TAU * (3 * gx + t)) + math.sin(TAU * (3 * gy - t)) + math.sin(TAU * (2 * gx + 2 * gy))
          if math.abs(n) < 0.09 then c = P.seam end
        end
        local r = hash(px, py, f)
        if not c and w1 > 0.5 and r > (P.sparkle or 0.993) then c = P.dot end
        if P.bubbles and not c and hash(px, py, 0) > 0.997 and math.sin(TAU * (t + hash(py, px, 0) * 5)) > 0.6 then c = P.dot end
        if P.stars and not c then
          local st = hash(px, py, 0)
          if st > 0.996 and math.sin(TAU * (t + st * 7)) > 0 then c = P.dot end
        end
        if c then img:drawPixel(px, py, c) end
      end
    end
  end
  spr:newCel(layer, f, img, Point(0, 0))
  spr.frames[f].duration = (biome == "magma") and 0.16 or 0.11
end

local tag = spr:newTag(1, N)
tag.name = "flow"
spr:saveAs(out)
