-- Toxic cloud sprite for the QWERTY poison skill. Rendered as an Aseprite loop.
local W, H, N = 64, 48, 12
local out = app.params["out"] or "poison-smoke.aseprite"
local function rgba(r, g, b, a) return app.pixelColor.rgba(r, g, b, a or 255) end
local C = {
  edge = rgba(18, 48, 28, 224), shade = rgba(34, 93, 43, 230),
  body = rgba(68, 145, 53, 226), light = rgba(137, 196, 62, 218),
  acid = rgba(203, 231, 74, 230), glint = rgba(231, 250, 155, 245),
  bubble = rgba(177, 227, 53, 242),
}
local spr = Sprite(W, H, ColorMode.RGB)
spr.filename = out
spr.layers[1].name = "toxic-vapor"
for _ = 2, N do spr:newEmptyFrame() end
local tau = math.pi * 2
local function hash(x, y, f)
  local n = math.sin(x * 12.9898 + y * 78.233 + f * 37.719) * 43758.5453
  return n - math.floor(n)
end
local function ellipseScore(x, y, cx, cy, rx, ry)
  local dx, dy = (x - cx) / rx, (y - cy) / ry
  return 1 - math.sqrt(dx * dx + dy * dy)
end
for f = 1, N do
  local t = (f - 1) / N
  local img = Image(W, H, ColorMode.RGB)
  local mask = {}
  for y = 0, H - 1 do
    mask[y] = {}
    for x = 0, W - 1 do
      local drift = math.sin(tau * t + x * 0.11) * 1.5
      local score = math.max(
        ellipseScore(x, y, 32 + drift, 28, 23, 13),
        ellipseScore(x, y, 19 + drift, 26, 13, 12),
        ellipseScore(x, y, 31 - drift, 20, 13, 12),
        ellipseScore(x, y, 45 + drift, 26, 13, 11),
        ellipseScore(x, y, 26, 38 + math.sin(tau * t) * 1.5, 8, 7),
        ellipseScore(x, y, 39, 38 - math.sin(tau * t) * 1.5, 7, 6)
      )
      mask[y][x] = score > 0.02
      if score > 0.02 then
        local n = hash(x, y, f)
        local col
        if score < 0.12 then col = C.edge
        elseif score < 0.32 then col = n > 0.55 and C.shade or C.body
        elseif y < 24 and n > 0.6 then col = C.light
        elseif n > 0.94 then col = C.acid
        else col = C.body end
        img:drawPixel(x, y, col)
      end
    end
  end
  -- Uneven vapor tendrils curl above the puff so it reads as drifting smoke, not a ring.
  for w = 1, 4 do
    local baseX = 8 + w * 11
    local drift = math.sin(tau * t + w * 1.7) * 3
    local topY = 2 + (w % 2) * 3
    local endY = 17 + (w % 3) * 2
    for y = topY, endY do
      local progress = (y - topY) / math.max(1, endY - topY)
      local curl = math.sin(progress * math.pi * 1.4 + tau * t + w) * (2 + progress * 2)
      local x = math.floor(baseX + drift + curl)
      if y < 9 or hash(x, y, f) > 0.18 then img:drawPixel(x, y, y < 7 and C.light or C.acid) end
      if progress > 0.7 and hash(x + w, y, f) > 0.56 then img:drawPixel(x + 1, y, C.glint) end
    end
  end
  -- Rolling lime eddies and bright bubbles drift around the cloud without breaking the loop.
  for i = 1, 6 do
    local phase = tau * (t + i / 6)
    local x = math.floor(32 + math.cos(phase) * (9 + (i % 3) * 5))
    local y = math.floor(27 + math.sin(phase * 1.5) * (5 + (i % 2) * 3))
    if mask[y] and mask[y][x] then
      img:drawPixel(x, y, C.acid)
      if (i + f) % 3 == 0 and x + 1 < W then img:drawPixel(x + 1, y, C.glint) end
    end
  end
  -- Two poisonous droplets rise, swell, then merge back into the vapor.
  for i = 1, 3 do
    local phase = (t + i / 3) % 1
    local x = math.floor((i * 19 + f * 2) % 54 + 5)
    local y = math.floor(35 - phase * 15)
    local r = phase < 0.5 and 1 or 2
    for dy = -r, r do for dx = -r, r do
      if dx * dx + dy * dy <= r * r and y + dy >= 0 and y + dy < H then img:drawPixel(x + dx, y + dy, (dx + dy < 0) and C.glint or C.bubble) end
    end end
  end
  spr:newCel(spr.layers[1], f, img, Point(0, 0))
  spr.frames[f].duration = 100
end
local tag = spr:newTag(1, N)
tag.name = "poof"
spr:saveAs(out)
