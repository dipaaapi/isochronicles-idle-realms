-- Kirov-class siege airship (random-battle raider, replaces the wave transport).
-- Side view facing right (the game flips it). States:
--   cruise   (12) engines spinning, envelope breathing, beacon blinking
--   drop     (12) belly hatch opens, red jump light, paratroopers leaving
--   bomb     (14) bomb bay doors swing open, bombs released in a stream
--   anchor   (14) winch drum turns, wrecking anchor lowered on its chain and hauled back
--   flare    (12) side launchers ripple-fire incendiary canisters
--   hit      (6)  jolt + white flash, panels spark
--   damaged  (12) torn envelope, burning engine, sputtering prop, heavy smoke
--   destroyed(16) envelope ruptures, fireballs, hull breaks and falls
local L = dofile("art/skills/lib.lua")
local rgba, px, line, rect, disc = L.rgba, L.px, L.line, L.rect, L.disc
local out = app.params["out"] or "kirov.aseprite"
local W, H = 120, 84
L.new(W, H, out, "kirov")
local C = {
  envDark=rgba(92,22,26), env=rgba(158,36,38), envMid=rgba(196,58,52), envHi=rgba(232,112,92), envGlint=rgba(255,186,160),
  seam=rgba(70,16,20), band=rgba(52,50,58), bandHi=rgba(112,110,120), gold=rgba(236,178,70), goldDk=rgba(160,108,36),
  metal=rgba(64,70,78), metalHi=rgba(128,136,146), metalDk=rgba(34,38,44), glass=rgba(255,214,120), glassDk=rgba(170,120,50),
  red=rgba(255,64,58), green=rgba(80,230,120), white=rgba(255,255,255), black=rgba(14,12,16),
  bomb=rgba(40,44,40), bombHi=rgba(110,118,100), chain=rgba(150,150,160), chainDk=rgba(80,80,92),
  fire={ rgba(200,30,30), rgba(251,140,50), rgba(255,236,140) },
  sm={ rgba(40,36,40,220), rgba(72,68,72,180), rgba(112,108,110,130), rgba(150,146,146,80) },
  flare=rgba(255,120,40), flareHi=rgba(255,240,170),
}
local CX, CY, RX, RY = 58, 28, 44, 17

local function inEnv(x, y, sq)
  local dx, dy = (x - CX) / RX, (y - CY) / (RY * (sq or 1))
  -- slightly pointed nose, rounder tail
  if dx > 0 then dx = dx * (1 + 0.12 * dx) end
  return dx * dx + dy * dy <= 1
end

local function envelope(img, o)
  local bob, sq, torn, flash = o.bob or 0, o.sq or 1, o.torn, o.flash
  for y = CY - RY - 2, CY + RY + 2 do
    for x = CX - RX - 2, CX + RX + 4 do
      if inEnv(x, y - bob, sq) then
        local ny = (y - bob - CY) / RY
        local nx = (x - CX) / RX
        local c
        if ny < -0.62 then c = C.envHi elseif ny < -0.15 then c = C.envMid elseif ny < 0.5 then c = C.env else c = C.envDark end
        if ny < -0.7 and nx > -0.3 and nx < 0.35 then c = C.envGlint end
        -- rib seams
        if (x - CX + 60) % 11 == 0 then c = C.seam end
        -- armoured belly band and nose cap
        if ny > 0.38 and ny < 0.52 then c = C.band end
        if nx > 0.86 then c = (ny < -0.2) and C.bandHi or C.band end
        -- gold star-less crest stripe near the nose
        if nx > 0.6 and nx < 0.68 and math.abs(ny) < 0.55 then c = C.gold end
        if torn and ((x * 7 + y * 13) % 23 == 0 or ((x - 40) ^ 2 + (y - bob - 22) ^ 2 < 10)) then c = C.black end
        if flash then c = C.white end
        px(img, x, y, c)
      end
    end
  end
  -- tail fins (cross)
  local fy = CY + bob
  for i = 0, 9 do
    line(img, CX - RX + 4 - i * 0.6, fy - 4 - i, CX - RX + 12, fy - 4 - i * 0.5, flash and C.white or (i < 3 and C.envMid or C.envDark))
    line(img, CX - RX + 4 - i * 0.6, fy + 4 + i, CX - RX + 12, fy + 4 + i * 0.5, flash and C.white or C.envDark)
  end
  line(img, CX - RX - 2, fy - 13, CX - RX - 2, fy + 13, C.band)
  line(img, CX - RX - 1, fy - 13, CX - RX + 2, fy - 13, C.gold)
end

local function engine(img, ex, ey, f, stall)
  rect(img, ex - 6, ey - 2, ex + 4, ey + 2, C.metal)
  line(img, ex - 6, ey - 2, ex + 4, ey - 2, C.metalHi)
  line(img, ex - 6, ey + 2, ex + 4, ey + 2, C.metalDk)
  px(img, ex + 5, ey, C.metalDk)
  -- strut up into the envelope
  line(img, ex - 2, ey - 3, ex - 2, ey - 7, C.metalDk)
  -- propeller blur, 4 phases
  if stall then line(img, ex + 6, ey - 1, ex + 6, ey + 1, C.metalHi) return end
  local p = f % 4
  if p == 0 then line(img, ex + 6, ey - 6, ex + 6, ey + 6, C.metalHi)
  elseif p == 1 then line(img, ex + 5, ey - 5, ex + 7, ey + 5, C.metalHi); line(img, ex + 7, ey - 5, ex + 5, ey + 5, C.chainDk)
  elseif p == 2 then line(img, ex + 6, ey - 3, ex + 6, ey + 3, C.metalHi); px(img, ex + 6, ey - 5, C.chainDk); px(img, ex + 6, ey + 5, C.chainDk)
  else line(img, ex + 7, ey - 5, ex + 5, ey + 5, C.metalHi); line(img, ex + 5, ey - 5, ex + 7, ey + 5, C.chainDk) end
  px(img, ex + 6, ey, C.gold)
end

local function gondola(img, o, f)
  local gy = CY + RY - 2 + (o.bob or 0)
  local gx1, gx2 = CX - 16, CX + 18
  rect(img, gx1, gy, gx2, gy + 8, C.metal)
  line(img, gx1, gy, gx2, gy, C.metalHi)
  line(img, gx1 + 1, gy + 8, gx2 - 1, gy + 8, C.metalDk)
  line(img, gx2 + 1, gy + 1, gx2 + 4, gy + 4, C.metalHi); line(img, gx2 + 4, gy + 4, gx2 + 1, gy + 8, C.metalDk)
  -- cabin windows (lit, flicker)
  for i = 0, 5 do
    local wx = gx1 + 5 + i * 5
    rect(img, wx, gy + 2, wx + 2, gy + 4, ((f + i) % 7 == 0) and C.glassDk or C.glass)
  end
  -- beacon light on the cabin roof, keel lights
  if f % 4 < 2 then px(img, CX + 2, gy - 1, C.red); px(img, CX + 2, gy - 2, C.red) end
  if f % 3 == 0 then px(img, CX - RX + 6, CY + (o.bob or 0), C.green) end
  return gx1, gx2, gy
end

local function bayDoors(img, cx, gy, open)
  -- open: 0..1 swing angle
  local len = 6
  local a = open * 1.3
  line(img, cx - 6, gy + 8, cx - 6 - math.cos(a) * len * 0.3, gy + 8 + math.sin(a) * len, C.metalHi)
  line(img, cx + 6, gy + 8, cx + 6 + math.cos(a) * len * 0.3, gy + 8 + math.sin(a) * len, C.metalHi)
  if open > 0.2 then rect(img, cx - 5, gy + 7, cx + 5, gy + 8, C.black) end
end

local function smoke(img, x, y, f, n)
  for k = 1, n do
    local t = k + (f % 3) * 0.33
    disc(img, x - t * 3.2, y - t * 1.6 - (f % 2), 1 + k * 0.7, C.sm[math.min(4, k)])
  end
end

local function ship(img, f, o)
  o = o or {}
  local bob = o.bob or math.floor(math.sin(f / 12 * math.pi * 2) * 1.2 + 0.5)
  o.bob = bob
  envelope(img, o)
  engine(img, CX - 18, CY + 12 + bob, f, o.stall)
  engine(img, CX + 20, CY + 12 + bob, f + 1, false)
  local gx1, gx2, gy = gondola(img, o, f)
  return gx1, gx2, gy, bob
end

L.tag("cruise", 12, 90, function(img, i) ship(img, i, { sq = 1 + 0.015 * math.sin(i / 12 * math.pi * 2) }) end)

L.tag("drop", 12, 90, function(img, i)
  local gx1, gx2, gy = ship(img, i, {})
  local open = math.min(1, i / 4)
  if i > 9 then open = (12 - i) / 3 end
  bayDoors(img, CX, gy, open)
  px(img, CX - 10, gy + 6, (i % 2 == 0) and C.red or C.green)
  -- paratroopers stepping out and falling
  if i >= 4 and i <= 10 then
    for k = 0, 2 do
      local t = (i - 4 + k * 2) % 7
      local tx, ty = CX - 2 + k * 3, gy + 10 + t * 4
      if ty < H - 4 then
        px(img, tx, ty, C.black); px(img, tx, ty + 1, C.metal); px(img, tx - 1, ty + 1, C.black); px(img, tx + 1, ty + 1, C.black)
        px(img, tx - 1, ty + 2, C.black); px(img, tx + 1, ty + 2, C.black)
        if t > 3 then line(img, tx - 3, ty - 3, tx + 3, ty - 3, rgba(232,232,220)); px(img, tx - 2, ty - 4, rgba(232,232,220)); px(img, tx + 2, ty - 4, rgba(232,232,220)) end
      end
    end
  end
end)

L.tag("bomb", 14, 80, function(img, i)
  local gx1, gx2, gy = ship(img, i, {})
  local open = math.min(1, i / 3)
  if i > 11 then open = (14 - i) / 3 end
  bayDoors(img, CX, gy, open)
  if i >= 3 and i <= 12 then
    for k = 0, 3 do
      local t = (i - 3) - k * 2
      if t >= 0 then
        local by = gy + 10 + t * t * 0.9
        local bx = CX - 1 + k
        if by < H - 3 then
          rect(img, bx - 1, by, bx + 1, by + 3, C.bomb); px(img, bx, by, C.bombHi)
          px(img, bx - 1, by - 1, C.metalHi); px(img, bx + 1, by - 1, C.metalHi)
        end
      end
    end
  end
  -- bay warning light
  if i % 2 == 0 then px(img, CX + 8, gy + 6, C.red) end
end)

L.tag("anchor", 14, 85, function(img, i)
  local gx1, gx2, gy = ship(img, i, {})
  -- winch drum
  disc(img, CX + 10, gy + 10, 2.5, C.metalDk); px(img, CX + 10 + math.floor(math.cos(i) * 2 + 0.5), gy + 10 + math.floor(math.sin(i) * 2 + 0.5), C.metalHi)
  -- chain length: lower, slam, haul back
  local len
  if i <= 7 then len = i * 2.6 elseif i <= 9 then len = 19 else len = 19 - (i - 9) * 3.6 end
  local ax, ay = CX + 10, gy + 12
  for s = 0, len, 2 do px(img, ax, ay + s, (s % 4 == 0) and C.chain or C.chainDk) end
  local ty = ay + len
  if ty < H - 6 then
    -- anchor: shank, ring, flukes
    line(img, ax, ty, ax, ty + 6, C.metalHi)
    disc(img, ax, ty, 1.2, C.gold)
    line(img, ax - 4, ty + 4, ax, ty + 7, C.metal); line(img, ax + 4, ty + 4, ax, ty + 7, C.metal)
    px(img, ax - 4, ty + 3, C.metalHi); px(img, ax + 4, ty + 3, C.metalHi)
    line(img, ax - 2, ty + 2, ax + 2, ty + 2, C.metal)
    if i == 8 or i == 9 then for k = 0, 5 do px(img, ax - 6 + k * 2 + (i % 2), ty + 8, C.flareHi) end end
  end
end)

L.tag("flare", 12, 80, function(img, i)
  local gx1, gx2, gy, bob = ship(img, i, {})
  -- two side launchers on the envelope belly
  for _, lx in ipairs({ CX - 26, CX + 28 }) do
    rect(img, lx - 2, CY + 13 + bob, lx + 2, CY + 15 + bob, C.metalDk)
    local fire = (i + (lx > CX and 2 or 0)) % 4 == 0
    if fire then disc(img, lx, CY + 17 + bob, 2, C.flareHi) end
  end
  -- canisters arcing down with fiery tails
  for k = 0, 3 do
    local t = (i + k * 3) % 12
    if t > 0 then
      local fx = CX - 26 + k * 18 + t * (k % 2 == 0 and -0.8 or 0.8)
      local fy = CY + 18 + bob + t * t * 0.32
      if fy < H - 3 then
        disc(img, fx, fy, 1.2, C.flareHi)
        for s = 1, 3 do px(img, fx - (k % 2 == 0 and -s or s) * 0.6, fy - s * 1.5, s < 2 and C.flare or C.fire[1]) end
      end
    end
  end
end)

L.tag("hit", 6, 60, function(img, i)
  local jolt = (i % 2 == 0) and 1 or -1
  ship(img, i, { bob = jolt, flash = i <= 2 })
  for k = 0, 4 do px(img, CX - 20 + ((i * 17 + k * 23) % 50), CY - 6 + ((i * 7 + k * 11) % 20), C.flareHi) end
end)

L.tag("damaged", 12, 85, function(img, i)
  local gx1, gx2, gy, bob = ship(img, i, { torn = true, stall = i % 3 == 0 })
  L.flame(img, CX - 18, CY + 10 + bob, 5, 5 + (i % 3), -3, C.fire)
  L.flame(img, CX - 4, CY - 10 + bob, 4, 4 + (i % 2) * 2, -2, C.fire)
  smoke(img, CX - 22, CY + 6 + bob, i, 5)
  smoke(img, CX - 8, CY - 14 + bob, i + 1, 4)
end)

L.tag("destroyed", 16, 90, function(img, i)
  local drop = math.floor((i - 1) ^ 1.6 * 0.9)
  local tilt = i / 16
  if i <= 6 then
    ship(img, i, { torn = true, bob = math.min(drop, 6), flash = (i == 3) })
  end
  -- fireballs bursting along the envelope
  local n = math.min(6, i)
  for k = 1, n do
    local bx = CX - 34 + ((k * 29) % 70)
    local by = CY - 8 + ((k * 13) % 20) + drop * 0.5
    local r = 2 + ((i + k) % 4) * (i < 10 and 1.4 or 0.6)
    disc(img, bx, by, r + 1, C.fire[1]); disc(img, bx, by, r, C.fire[2]); disc(img, bx, by, r * 0.5, C.fire[3])
  end
  if i > 6 then
    -- broken hull halves tumbling down
    local y0 = CY + drop
    for s = 0, 12 do
      line(img, CX - 30 + s, y0 - 6 + s * tilt, CX - 30 + s, y0 + 4 + s * tilt, (s % 3 == 0) and C.seam or C.envDark)
      line(img, CX + 10 + s, y0 - 4 - s * tilt * 0.5, CX + 10 + s, y0 + 6 - s * tilt * 0.5, (s % 3 == 0) and C.band or C.envDark)
    end
    rect(img, CX - 8, y0 + 8, CX + 10, y0 + 13, C.metalDk)
    smoke(img, CX - 10, y0 - 6, i, 6)
  end
end)

L.save(out)
