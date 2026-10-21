-- Kirov ordnance hitting the ground (64x64, centred on the impact point near the bottom).
--   bomb-fall   (6)  finned bomb spinning down (loop)
--   blast       (12) bomb impact: flash, fireball, shock ring, debris, smoke
--   anchor-slam (12) dust shock ring, cracks spreading, rubble kicked up
--   canister    (6)  incendiary canister falling with a flame tail (loop)
--   napalm      (14) burning patch: splash, spreading flames, licking fire (last 6 loop)
local L = dofile("art/skills/lib.lua")
local rgba, px, line, rect, disc, ring = L.rgba, L.px, L.line, L.rect, L.disc, L.ring
local out = app.params["out"] or "kirov-ordnance.aseprite"
local W, H = 64, 64
L.new(W, H, out, "ordnance")
local C = {
  bomb=rgba(42,46,42), bombHi=rgba(120,128,110), fin=rgba(90,96,90), white=rgba(255,255,255),
  fire={ rgba(190,28,24), rgba(250,130,44), rgba(255,232,140) },
  sm={ rgba(46,42,44,220), rgba(80,76,78,170), rgba(120,116,116,120), rgba(160,156,152,70) },
  dust={ rgba(150,120,82,230), rgba(186,156,110,190), rgba(214,190,146,130) },
  crack=rgba(40,30,22), rock=rgba(110,96,80), rockHi=rgba(160,146,120), napalm=rgba(255,96,24),
}
local GX, GY = 32, 52

local function ell(img, cx, cy, rx, ry, c)
  for y = math.floor(cy - ry), math.ceil(cy + ry) do for x = math.floor(cx - rx), math.ceil(cx + rx) do
    if ((x - cx) / rx) ^ 2 + ((y - cy) / ry) ^ 2 <= 1 then px(img, x, y, c) end end end
end
local function ellRing(img, cx, cy, rx, ry, c)
  for a = 0, 63 do local t = a / 64 * math.pi * 2; px(img, cx + math.cos(t) * rx, cy + math.sin(t) * ry, c) end
end

L.tag("bomb-fall", 6, 60, function(img, i)
  local y = 20
  rect(img, GX - 2, y, GX + 2, y + 7, C.bomb); px(img, GX - 1, y + 1, C.bombHi); px(img, GX, y + 1, C.bombHi)
  line(img, GX - 2, y + 8, GX + 2, y + 8, C.bomb); px(img, GX, y + 9, C.bomb)
  local w = ({ 3, 2, 0, 2, 3, 1 })[i]
  line(img, GX - w, y - 1, GX + w, y - 1, C.fin); line(img, GX, y - 3, GX, y - 1, C.fin)
  if i % 2 == 0 then px(img, GX, y - 5, rgba(255,255,255,120)) end
end)

L.tag("blast", 12, 55, function(img, i)
  local t = i / 12
  if i <= 2 then ell(img, GX, GY - 4, 10 + i * 4, 6 + i * 2, C.white) end
  -- shock ring along the ground
  ellRing(img, GX, GY, 6 + i * 2.4, 3 + i * 1.1, i < 6 and C.fire[3] or C.dust[2])
  -- fireball rising and cooling into smoke
  local r = (i < 6) and (4 + i * 2) or (14 - (i - 6) * 0.8)
  local cy = GY - 6 - i * 1.6
  if i < 9 then
    disc(img, GX, cy, r + 1, C.fire[1]); disc(img, GX, cy, r * 0.8, C.fire[2]); disc(img, GX, cy, r * 0.45, C.fire[3])
  end
  if i >= 5 then
    for k = 1, 4 do disc(img, GX + (k - 2.5) * 5, cy - 4 - k * 1.5 - (i - 5), 3 + k + (i - 5) * 0.4, C.sm[math.min(4, k + math.floor((i - 5) / 3))]) end
  end
  -- debris flung out
  for k = 0, 7 do
    local a = k / 8 * math.pi * 2
    local d = i * 2.6
    local dx, dy = GX + math.cos(a) * d, GY - 4 + math.sin(a) * d * 0.5 - i * 1.5 + (i * i) * 0.12
    px(img, dx, dy, k % 2 == 0 and C.rock or C.crack)
  end
  -- scorch
  if i > 3 then ell(img, GX, GY + 1, 9, 3.5, rgba(26,20,18,math.floor(200 - t * 80))) end
end)

L.tag("anchor-slam", 12, 60, function(img, i)
  -- cracks spreading from the strike point
  local reach = math.min(i, 7) * 3
  for k = 0, 5 do
    local a = k / 6 * math.pi * 2 + 0.3
    local x, y = GX, GY
    for s = 1, reach do
      local nx = x + math.cos(a + math.sin(s * 1.7 + k) * 0.5) * 1
      local ny = y + math.sin(a + math.sin(s * 1.7 + k) * 0.5) * 0.5
      px(img, nx, ny, C.crack); x, y = nx, ny
    end
  end
  -- dust shock ring
  ellRing(img, GX, GY, 4 + i * 2.6, 2 + i * 1.2, C.dust[1])
  if i > 1 then ellRing(img, GX, GY, 2 + i * 2, 1 + i * 0.9, C.dust[2]) end
  -- dust columns
  if i <= 9 then for k = -2, 2 do disc(img, GX + k * 6, GY - 3 - (i % 4) - math.abs(k), 2 + (9 - i) * 0.35, C.dust[3]) end end
  -- rubble kicked up
  for k = 0, 9 do
    local a = k / 10 * math.pi
    local v = 2 + (k % 3)
    local rx = GX + math.cos(a) * v * i * 0.9
    local ry = GY - math.sin(a) * v * i * 1.3 + i * i * 0.35
    if ry < GY + 2 then rect(img, rx, ry, rx + (k % 2), ry + 1, k % 3 == 0 and C.rockHi or C.rock) end
  end
  if i == 1 then ell(img, GX, GY - 2, 8, 4, C.white) end
end)

L.tag("canister", 6, 60, function(img, i)
  local y = 22
  rect(img, GX - 1, y, GX + 1, y + 4, C.bomb); px(img, GX, y, C.fire[3])
  for s = 1, 6 do
    local c = s < 2 and C.fire[3] or (s < 4 and C.fire[2] or C.fire[1])
    px(img, GX + math.sin(i + s) * 0.8, y - s, c)
    if s < 4 then px(img, GX + 1 + math.sin(i + s), y - s, C.fire[2]) end
  end
end)

L.tag("napalm", 14, 75, function(img, i)
  local spread = math.min(i, 6) / 6
  ell(img, GX, GY, 4 + spread * 14, 2 + spread * 6, rgba(40,20,12,180))
  if i <= 3 then for k = 0, 9 do
    local a = k / 10 * math.pi * 2
    px(img, GX + math.cos(a) * i * 4, GY - 3 + math.sin(a) * i * 2 - i, C.napalm)
  end end
  -- tongues of fire across the patch
  local n = math.floor(3 + spread * 6)
  for k = 0, n - 1 do
    local fx = GX - spread * 12 + k * (spread * 24 / math.max(1, n - 1))
    local fy = GY + math.sin(k * 2.1) * spread * 3
    L.flame(img, fx, fy, 3 + (k % 2), 4 + ((i + k) % 4) + spread * 3, ((i + k) % 3) - 1, C.fire)
  end
  if i > 6 then disc(img, GX - 4 + (i % 3) * 3, GY - 14 - (i % 4) * 2, 2 + (i % 3), C.sm[3]) end
end)

L.save(out)
