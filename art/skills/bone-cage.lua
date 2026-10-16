-- Bone cage, swelling pit and fluttering bats for the QWERTY trap skill.
local W, H = 48, 64
local RISE, HOLD, SINK = 3, 3, 8
local N = RISE + HOLD + SINK
local out = app.params["out"] or "bone-cage.aseprite"
local function rgba(r, g, b, a) return app.pixelColor.rgba(r, g, b, a or 255) end
local C = {
  pit = rgba(4, 6, 14, 248), pitRim = rgba(50, 31, 63, 245),
  boneShade = rgba(102, 88, 72, 255), bone = rgba(205, 191, 160, 255),
  boneLight = rgba(250, 239, 203, 255), boneGlint = rgba(255, 251, 228, 255),
  bat = rgba(37, 24, 58, 255), batLight = rgba(91, 55, 103, 255), eye = rgba(228, 60, 73, 255),
}
local spr = Sprite(W, H, ColorMode.RGB)
spr.filename = out
spr.layers[1].name = "bones-pit-and-bats"
for _ = 2, N do spr:newEmptyFrame() end
local function pixel(img, x, y, color)
  x, y = math.floor(x), math.floor(y)
  if x >= 0 and y >= 0 and x < W and y < H then img:drawPixel(x, y, color) end
end
local function line(img, x1, y1, x2, y2, color, width)
  local steps = math.max(math.abs(x2 - x1), math.abs(y2 - y1))
  for i = 0, steps do
    local t = steps == 0 and 0 or i / steps
    local x, y = math.floor(x1 + (x2 - x1) * t), math.floor(y1 + (y2 - y1) * t)
    for oy = -(width or 0), (width or 0) do for ox = -(width or 0), (width or 0) do
      if ox * ox + oy * oy <= ((width or 0) + 0.35) ^ 2 then pixel(img, x + ox, y + oy, color) end
    end end
  end
end
local function disk(img, cx, cy, rx, ry, color)
  for y = math.floor(cy - ry), math.ceil(cy + ry) do for x = math.floor(cx - rx), math.ceil(cx + rx) do
    local dx, dy = (x - cx) / rx, (y - cy) / ry
    if dx * dx + dy * dy <= 1 then pixel(img, x, y, color) end
  end end
end
local function bone(img, x1, y1, x2, y2, width)
  line(img, x1 + 1, y1 + 1, x2 + 1, y2 + 1, C.boneShade, width + 1)
  line(img, x1, y1, x2, y2, C.bone, width)
  line(img, x1, y1 - 1, x2, y2 - 1, C.boneLight, 0)
  disk(img, x1, y1, width + 2, width + 2, C.boneLight)
  disk(img, x2, y2, width + 2, width + 2, C.boneLight)
  pixel(img, x1 - 1, y1 - 1, C.boneGlint)
  pixel(img, x2 - 1, y2 - 1, C.boneGlint)
end
local function skull(img, x, y)
  disk(img, x, y, 5, 4, C.boneShade)
  disk(img, x - 1, y - 1, 4, 3, C.boneLight)
  disk(img, x - 2, y, 1, 1, C.pit)
  disk(img, x + 2, y, 1, 1, C.pit)
  pixel(img, x + 1, y - 2, C.boneGlint)
  line(img, x - 2, y + 3, x + 2, y + 3, C.bone, 0)
end
local function bat(img, x, y, flap)
  pixel(img, x, y, C.bat)
  pixel(img, x, y - 1, C.batLight)
  local wing = flap and 3 or 1
  for i = 1, wing do
    pixel(img, x - i, y - i, C.bat)
    pixel(img, x + i, y - i, C.bat)
    if i == wing then pixel(img, x - i - 1, y - i + 1, C.batLight); pixel(img, x + i + 1, y - i + 1, C.batLight) end
  end
  if flap then pixel(img, x - 1, y, C.eye); pixel(img, x + 1, y, C.eye) end
end
local lower = { 12, 6, 1, 1, 0, 1, 2, 4, 7, 10, 13, 17, 22, 28 }
local pitSize = { 3, 5, 7, 7, 7, 7, 8, 9, 10, 11, 12, 13, 15, 18 }
for f = 1, N do
  local phase = f <= RISE and f or f <= RISE + HOLD and RISE + 1 + (f - RISE - 1) % 2 or f - 1
  local sink = lower[phase]
  local img = Image(W, H, ColorMode.RGB)
  -- A black sinkhole opens under the target, its violet rim flickering as it widens.
  local rx = pitSize[phase]
  disk(img, 24, 53, rx + 2, math.max(2, math.floor(rx * 0.42)) + 1, C.pitRim)
  disk(img, 24, 53, rx, math.max(2, math.floor(rx * 0.42)), C.pit)
  pixel(img, 24 - rx + 2, 52, C.batLight)
  pixel(img, 24 + rx - 2, 54, C.pitRim)

  -- The cage has a curved rib roof, a crowned skull and thick, jointed bone bars.
  local top = 17 + sink
  for x = 7, 41 do
    local arch = 8 + math.floor(((x - 24) * (x - 24)) / 42)
    bone(img, x, top + arch - 2, x, top + arch, 0)
  end
  bone(img, 7, top + 8, 41, top + 8, 1)
  bone(img, 7, top + 29, 41, top + 29, 1)
  bone(img, 7, top + 8, 7, top + 29, 1)
  bone(img, 41, top + 8, 41, top + 29, 1)
  for x = 13, 35, 7 do bone(img, x, top + 9, x, top + 28, 0) end
  for x = 10, 38, 7 do
    pixel(img, x, top + 8, C.boneGlint)
    pixel(img, x, top + 29, C.boneGlint)
  end
  skull(img, 24, top + 7)
  -- Broken ribs and loose fragments tumble into the hole during the sink frames.
  if f >= RISE + HOLD + 3 then
    local fall = f - (RISE + HOLD)
    for i = 1, 4 do
      local x = ((i * 11 + fall * (i % 2 == 0 and 2 or -1)) % 40) + 4
      pixel(img, x, math.min(58, top + 28 + i + fall), C.boneLight)
      if i % 2 == 0 then pixel(img, x + 1, math.min(58, top + 29 + i + fall), C.boneShade) end
    end
  end
  -- A pair of tiny bats flap out from the cage and spiral away as it sinks.
  local orbit = f * 1.7
  local bx1 = 8 + math.floor((f * 3) % 30)
  local bx2 = 39 - math.floor((f * 2) % 29)
  local by = math.max(5, math.min(36, top + 12 + math.floor(math.sin(orbit) * 5)))
  bat(img, bx1, by, f % 2 == 0)
  bat(img, bx2, math.max(4, by - 6), f % 2 == 1)

  spr:newCel(spr.layers[1], f, img, Point(0, 0))
  spr.frames[f].duration = 140
end
spr:newTag(1, RISE).name = "rise"
spr:newTag(RISE + 1, RISE + HOLD).name = "hold"
spr:newTag(RISE + HOLD + 1, N).name = "sink"
spr:saveAs(out)
