-- Ancient Caterpillar skill FX (80x64, ground point at (40,52)).
--   erupt        (16) Burrow Eruption: ground bulges, cracks glow, sand geyser bursts, rocks rain, dust settles
--   burrow       (10) dust mound travelling under the ground (loop)
--   snare-cast   (10) silk threads shoot out and weave a web over the ground
--   snare-hold   (8)  web pulsing, strands quivering (loop)
--   snare-break  (8)  strands snap and drift away
--   vortex-open  (8)  sand starts to spin into a funnel
--   vortex       (12) sand vortex funnel spinning (loop)
--   vortex-close (8)  funnel collapses into a dust puff
local L = dofile("art/skills/lib.lua")
local rgba, px, line, rect, disc = L.rgba, L.px, L.line, L.rect, L.disc
local out = app.params["out"] or "caterpillar-skills.aseprite"
local W, H = 80, 64
L.new(W, H, out, "caterpillar")
local C = {
  sand={ rgba(233,216,166), rgba(214,186,128), rgba(178,140,86), rgba(130,96,56) },
  dust={ rgba(214,190,146,220), rgba(196,168,120,170), rgba(176,150,108,110), rgba(160,136,100,60) },
  crack=rgba(52,30,18), glow=rgba(192,132,252), glowHi=rgba(240,214,255), rock=rgba(120,96,70), rockHi=rgba(170,146,110),
  silk=rgba(245,245,240), silkDim=rgba(200,200,196,170), silkGlow=rgba(220,200,255),
}
local GX, GY = 40, 52

local function ell(img, cx, cy, rx, ry, c)
  for y = math.floor(cy - ry), math.ceil(cy + ry) do for x = math.floor(cx - rx), math.ceil(cx + rx) do
    if ((x - cx) / rx) ^ 2 + ((y - cy) / ry) ^ 2 <= 1 then px(img, x, y, c) end end end
end
local function ellRing(img, cx, cy, rx, ry, c, n)
  n = n or 64
  for a = 0, n - 1 do local t = a / n * math.pi * 2; px(img, cx + math.cos(t) * rx, cy + math.sin(t) * ry, c) end
end

L.tag("erupt", 16, 65, function(img, i)
  -- 1-4: bulge + glowing cracks; 5-10: geyser; 11-16: rock rain + settling dust
  local bulge = math.min(i, 4)
  ell(img, GX, GY, 8 + bulge * 2.5, 3 + bulge, C.sand[3])
  ell(img, GX, GY - bulge * 0.6, 6 + bulge * 2, 2 + bulge * 0.8, C.sand[2])
  for k = 0, 6 do
    local a = k / 7 * math.pi * 2
    local len = math.min(i, 6) * 2.4
    line(img, GX, GY, GX + math.cos(a) * len, GY + math.sin(a) * len * 0.5, (i >= 3 and i <= 8) and C.glow or C.crack)
  end
  if i >= 5 and i <= 11 then
    local h = (i <= 8) and (i - 4) * 11 or (11 - i + 4) * 9
    for y = 0, h do
      local t = y / math.max(1, h)
      local half = 3 + t * 7 + math.sin(y * 0.6 + i) * 1.5
      for x = math.floor(GX - half), math.ceil(GX + half) do
        local c = (math.abs(x - GX) < half * 0.4) and C.sand[1] or C.sand[2]
        if (x + y + i) % 7 == 0 then c = C.sand[3] end
        px(img, x, GY - y, c)
      end
    end
    disc(img, GX, GY - h, 6 + (i % 3), C.dust[1])
    if i <= 7 then ell(img, GX, GY - 2, 12, 4, C.glowHi) end
  end
  if i >= 8 then
    for k = 0, 9 do
      local a = (k / 10) * math.pi
      local t = i - 7
      local rx = GX + math.cos(a) * (6 + k) * t * 0.55
      local ry = GY - 40 + t * t * 0.9 + (k % 3) * 4
      if ry < GY then rect(img, rx, ry, rx + 1, ry + 1, k % 2 == 0 and C.rock or C.rockHi) end
    end
    local d = i - 8
    for k = -3, 3 do disc(img, GX + k * 6, GY - 2 - math.abs(k) * 0.5, 3 + d * 0.6, C.dust[math.min(4, 1 + math.floor(d / 2))]) end
    ellRing(img, GX, GY, 10 + d * 3, 4 + d * 1.2, C.sand[2])
  end
end)

L.tag("burrow", 10, 70, function(img, i)
  ell(img, GX, GY, 12, 4, C.sand[3])
  ell(img, GX, GY - 1 - (i % 2), 9, 3, C.sand[2])
  ell(img, GX + 1, GY - 2 - (i % 2), 5, 1.6, C.sand[1])
  for k = 0, 4 do
    local t = (i + k * 2) % 10
    disc(img, GX - 10 - t * 1.6 + k, GY - 2 - t * 0.8, 1 + t * 0.25, C.dust[math.min(4, 1 + math.floor(t / 3))])
  end
  for k = 0, 2 do px(img, GX - 4 + k * 4 + (i % 3), GY - 4 - ((i + k) % 3), C.rock) end
end)

local function web(img, radius, alpha, wobble, i)
  local spokes = 8
  local cS = alpha and C.silk or C.silkDim
  for k = 0, spokes - 1 do
    local a = k / spokes * math.pi * 2
    line(img, GX, GY, GX + math.cos(a) * radius, GY + math.sin(a) * radius * 0.48 + math.sin(i + k) * wobble, cS)
  end
  for r = 4, radius, 4 do
    local pts = {}
    for k = 0, spokes do
      local a = k / spokes * math.pi * 2
      local rr = r * (0.92 + 0.08 * math.sin(k * 1.3 + i * 0.7))
      pts[#pts + 1] = { GX + math.cos(a) * rr, GY + math.sin(a) * rr * 0.48 + math.sin(i + k) * wobble * (r / radius) }
    end
    for k = 1, spokes do line(img, pts[k][1], pts[k][2], pts[k + 1][1], pts[k + 1][2], cS) end
  end
  px(img, GX, GY, C.silkGlow)
end

L.tag("snare-cast", 10, 60, function(img, i)
  -- threads shoot out first, then the rings weave in
  local reach = math.min(i, 5) * 5.6
  for k = 0, 7 do
    local a = k / 8 * math.pi * 2
    line(img, GX, GY - 18 + math.min(i, 4) * 4.5, GX + math.cos(a) * reach, GY + math.sin(a) * reach * 0.48, C.silk)
  end
  if i > 5 then web(img, 28 * ((i - 5) / 5), true, 0.5, i) end
end)
L.tag("snare-hold", 8, 90, function(img, i)
  web(img, 28, true, 1.2, i)
  for k = 0, 3 do
    local a = (i / 8 + k / 4) * math.pi * 2
    px(img, GX + math.cos(a) * 18, GY + math.sin(a) * 8.6, C.silkGlow)
  end
end)
L.tag("snare-break", 8, 70, function(img, i)
  for k = 0, 11 do
    local a = k / 12 * math.pi * 2
    local d = 6 + i * 3.2
    local x, y = GX + math.cos(a) * d, GY + math.sin(a) * d * 0.48 - i * 1.6
    line(img, x, y, x + math.cos(a + 1.2) * (5 - i * 0.5), y - 2, (i < 5) and C.silk or C.silkDim)
  end
end)

local function funnel(img, i, scale)
  local h = 44 * scale
  for y = 0, h do
    local t = y / math.max(1, h)
    local rx = (3 + t * 15) * (0.4 + 0.6 * scale)
    local ry = rx * 0.32
    local cy = GY - y
    local sway = math.sin(t * 3 + i * 0.5) * 2 * scale
    -- solid cone slice: spiral bands wind around it as it spins
    for x = math.floor(-rx), math.ceil(rx) do
      local ang = math.acos(math.max(-1, math.min(1, x / math.max(0.5, rx))))
      local band = math.sin(ang * 3 - i * 0.9 + t * 7)
      local c = band > 0.45 and C.sand[1] or (band > -0.3 and C.sand[2] or C.sand[3])
      if math.abs(x) > rx - 1 then c = C.sand[4] end
      px(img, GX + sway + x, cy, c)
    end
    if y % 3 == 0 then px(img, GX + sway + math.cos(i * 0.7 + y) * (rx + 2), cy, C.dust[1]) end
  end
  ellRing(img, GX, GY, 18 * scale + 3, 6 * scale + 1, C.dust[2], 48)
  for k = 0, 5 do
    local ang = k / 6 * math.pi * 2 + i * 0.8
    local r = 20 * scale
    rect(img, GX + math.cos(ang) * r, GY - 6 - k * 5 * scale + math.sin(ang) * 3, GX + math.cos(ang) * r + 1, GY - 6 - k * 5 * scale + math.sin(ang) * 3, C.rock)
  end
end

L.tag("vortex-open", 8, 70, function(img, i) funnel(img, i, i / 8) end)
L.tag("vortex", 12, 60, function(img, i) funnel(img, i, 1) end)
L.tag("vortex-close", 8, 70, function(img, i)
  if i < 5 then funnel(img, i, 1 - i / 5) end
  for k = -3, 3 do disc(img, GX + k * 5, GY - 4 - math.abs(k), 2 + i * 0.7, C.dust[math.min(4, 1 + math.floor(i / 2))]) end
end)

L.save(out)
