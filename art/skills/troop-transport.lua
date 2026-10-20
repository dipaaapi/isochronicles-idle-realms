-- Armoured troop transport crossing the island during waves.
-- fly: cruising with prop spin + nav lights; drop: rear ramp open with jump light;
-- damaged: engine on fire, trailing smoke, sputtering prop.
local L = dofile("art/skills/lib.lua")
local rgba, px, line, rect, disc = L.rgba, L.px, L.line, L.rect, L.disc
local out = app.params["out"] or "troop-transport.aseprite"
L.new(56,36,out,"armoured-transport")
local C = {
  shadow=rgba(8,14,20), body=rgba(56,68,69), light=rgba(105,119,109), hi=rgba(170,178,153),
  dark=rgba(30,39,42), glass=rgba(75,145,166), glassHi=rgba(161,221,224), red=rgba(233,72,65),
  green=rgba(80,220,110), gold=rgba(236,178,70), exhaust=rgba(222,157,82,175), soot=rgba(24,20,22),
  fire={ rgba(200,30,30), rgba(251,140,50), rgba(255,236,140) },
  sm={ rgba(50,46,50,200), rgba(80,76,80,160), rgba(120,116,118,110), rgba(160,156,156,60) },
}
local OX, OY = 4, 2

local function plane(img,f,opts)
  local function P(x,y,c) px(img,x+OX,y+OY,c) end
  local function Ln(a,b,c2,d,c) line(img,a+OX,b+OY,c2+OX,d+OY,c) end
  local function R(a,b,c2,d,c) rect(img,a+OX,b+OY,c2+OX,d+OY,c) end
  -- exhaust glow
  R(2,15,8,17,C.dark); P(2,16,(f%3==0) and C.gold or C.exhaust)
  -- tail and wings
  Ln(10,15,14,9,C.dark); Ln(13,15,16,10,C.light); Ln(10,15,16,15,C.hi)
  Ln(16,16,24,26,C.dark); Ln(19,15,26,24,C.light); Ln(24,26,39,18,C.dark)
  Ln(19,14,34,17,C.hi); Ln(34,17,41,17,C.light)
  Ln(15,15,11,8,C.dark); Ln(16,14,13,8,C.light); Ln(11,8,18,10,C.hi)
  -- fuselage and nose
  R(9,14,37,17,C.shadow); R(10,14,36,16,C.body); Ln(12,14,34,14,C.light)
  Ln(11,17,36,17,C.dark); Ln(12,13,32,13,C.hi)
  Ln(36,14,42,15,C.hi); Ln(42,15,45,17,C.body); Ln(45,17,42,19,C.dark)
  R(13,12,17,13,C.dark); R(14,12,16,12,C.glass); P(14,12,C.glassHi)
  R(21,13,32,14,C.dark); R(23,13,30,13,C.light)
  -- nav lights: red port tail, green wingtip, blinking
  if f%2==0 then P(9,13,C.red) end
  if f%3~=0 then P(26,24,C.green) end
  P(35,13,C.gold)
  if opts.drop then
    Ln(8,16,3,23,C.dark); Ln(7,17,2,23,C.hi)
    P(6,14,(f%2==0) and C.green or C.red)
    -- jumper silhouette leaving the ramp
    local jy = 20 + (f%3)*2
    P(3,jy,C.dark); P(3,jy+1,C.dark); P(2,jy+1,C.dark); P(4,jy+1,C.dark)
  else
    Ln(8,16,6,18,C.dark)
  end
  if opts.damaged then
    -- soot scorching on the wing root and a burning engine
    P(22,18,C.soot); P(23,19,C.soot); P(25,20,C.soot); P(20,16,C.soot)
    local fx, fy = 27+OX, 21+OY
    L.flame(img,fx,fy,4,4+(f%3),-3,C.fire)
    for k=1,4 do
      local t = k + (f%2)*0.5
      disc(img,fx-4-t*3.5,fy-2-t*1.2,1+k*0.6,C.sm[math.min(4,k)])
    end
  end
  -- propeller (sputters when damaged)
  local stall = opts.damaged and f%3==0
  if stall then Ln(44,14,46,19,C.dark)
  elseif f%2==0 then Ln(45,12,45,21,C.hi); Ln(43,16,47,16,C.light)
  else Ln(43,14,47,19,C.hi); Ln(44,19,47,14,C.light) end
  P(18,14,C.gold); P(33,15,C.hi); P(27,15,C.dark)
end

L.tag("fly",6,90,function(img,i) plane(img,i,{}) end)
L.tag("drop",6,90,function(img,i) plane(img,i,{drop=true}) end)
L.tag("damaged",6,80,function(img,i) plane(img,i,{damaged=true}) end)
L.save(out)
