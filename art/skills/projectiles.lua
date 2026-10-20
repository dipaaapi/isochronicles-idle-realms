-- Projectiles in flight (pointing +x, rotated in code) and their impacts.
-- 'orb' and 'burst' are greyscale so Phaser can tint them per unit colour.
local L = dofile("art/skills/lib.lua")
local rgba, px, line, rect, disc, ring = L.rgba, L.px, L.line, L.rect, L.disc, L.ring
local out = app.params["out"] or "projectiles.aseprite"
L.new(24,24,out,"projectiles")
local C = {
  wood=rgba(120,78,42), woodHi=rgba(181,128,72), steel=rgba(200,210,214), feather=rgba(220,60,52), featherHi=rgba(250,214,196),
  w=rgba(255,255,255), w2=rgba(220,220,220,230), w3=rgba(170,170,170,170), w4=rgba(120,120,120,90),
  y=rgba(255,240,140), o=rgba(251,146,60), r=rgba(220,38,38), dr=rgba(127,29,29,200), smoke=rgba(70,64,72,150),
  brass=rgba(236,190,90), brassHi=rgba(255,236,170), tracer=rgba(255,210,120,150),
  cy=rgba(120,240,255), cyHi=rgba(230,255,255), cyD=rgba(40,150,220,170),
  rock=rgba(110,100,92), rockHi=rgba(160,150,138), rockD=rgba(62,55,52),
}
local cx, cy = 12, 12

L.tag("arrow",4,70,function(img,i)
  line(img,3,cy,17,cy,C.wood); line(img,5,cy-1,15,cy-1,C.woodHi)
  line(img,17,cy-2,21,cy,C.steel); line(img,17,cy+2,21,cy,C.steel); px(img,18,cy,C.w)
  local f = (i%2==0) and 1 or 0
  line(img,2,cy-3-f,6,cy,C.feather); line(img,2,cy+3+f,6,cy,C.feather); px(img,3,cy-2-f,C.featherHi)
  if i>2 then px(img,0,cy,C.w4); px(img,1,cy,C.w3) end
end)

L.tag("orb",6,60,function(img,i)
  local p = 1 + 0.6*math.sin(i/6*math.pi*2)
  for k=1,4 do disc(img,cx-3-k*2.2,cy+math.sin(i+k)*1.2,2.4-k*0.45,(k<3) and C.w3 or C.w4) end
  disc(img,cx+1,cy,4.4+p*0.5,C.w3); disc(img,cx+1,cy,3.2+p*0.3,C.w2); disc(img,cx+1,cy,1.8,C.w)
  local a = i/6*math.pi*2
  px(img,cx+1+math.cos(a)*6,cy+math.sin(a)*6,C.w); px(img,cx+1-math.cos(a)*6,cy-math.sin(a)*6,C.w2)
end)

L.tag("fireball",6,60,function(img,i)
  for k=1,5 do
    local r = 3.2-k*0.5
    disc(img,cx-2-k*2.4,cy+math.sin(i*1.7+k)*1.6,r,(k<2) and C.o or ((k<4) and C.r or C.smoke))
  end
  disc(img,cx+2,cy,5,C.r); disc(img,cx+2.5,cy,3.8,C.o); disc(img,cx+3,cy-0.5,2.2,C.y); px(img,cx+4,cy-1,C.w)
  if i%2==0 then px(img,cx-1,cy-5,C.y) else px(img,cx-2,cy+5,C.o) end
end)

L.tag("bullet",3,50,function(img,i)
  line(img,1,cy,14,cy,C.tracer); line(img,6,cy,14,cy,C.y)
  rect(img,15,cy-1,19,cy+1,C.brass); px(img,20,cy,C.brassHi); line(img,16,cy-1,19,cy-1,C.brassHi)
  if i==2 then px(img,3,cy-1,C.w4) end
end)

L.tag("plasma",4,55,function(img,i)
  line(img,2,cy,18,cy,C.cyD); line(img,6,cy-1,18,cy-1,C.cyD); line(img,6,cy+1,18,cy+1,C.cyD)
  line(img,8,cy,20,cy,C.cy); line(img,14,cy,21,cy,C.cyHi)
  local z = (i%2==0) and -2 or 2
  line(img,10,cy+z,13,cy-z,C.cyHi); px(img,22,cy,C.w)
end)

L.tag("rock",4,80,function(img,i)
  local a = i/4*math.pi*0.5
  for k=0,5 do
    local t = a + k/6*math.pi*2; local r = (k%2==0) and 5 or 4
    line(img,cx,cy,cx+math.cos(t)*r,cy+math.sin(t)*r,C.rock)
  end
  disc(img,cx,cy,3.6,C.rock); disc(img,cx-1,cy-1,1.6,C.rockHi); px(img,cx+2,cy+2,C.rockD)
  px(img,cx-7,cy+1,C.w4); px(img,cx-9,cy,C.w4)
end)

-- Impacts --------------------------------------------------------------------
L.tag("spark",5,45,function(img,i,n)
  local r = 2 + i*1.8
  for k=0,7 do
    local t = k/8*math.pi*2 + 0.3
    local a, b = r*0.45, r
    line(img,cx+math.cos(t)*a,cy+math.sin(t)*a,cx+math.cos(t)*b,cy+math.sin(t)*b,(i<3) and C.y or C.o)
  end
  if i<3 then disc(img,cx,cy,3-i,C.w) end
end)

L.tag("burst",6,50,function(img,i)
  local r = 2 + i*1.6
  if i<5 then ring(img,cx,cy,r,C.w2); ring(img,cx,cy,r-1,C.w3) end
  if i<3 then disc(img,cx,cy,4-i,C.w) end
  for k=0,5 do
    local t = k/6*math.pi*2 + i*0.4
    px(img,cx+math.cos(t)*(r+2),cy+math.sin(t)*(r+2),(i<5) and C.w or C.w4)
  end
end)

L.tag("explode",8,60,function(img,i)
  if i<=2 then disc(img,cx,cy,3+i*2,C.y); disc(img,cx,cy,2+i,C.w)
  elseif i<=5 then
    disc(img,cx,cy,6+i*0.8,C.r); disc(img,cx,cy-1,5+i*0.4,C.o); disc(img,cx,cy-1,3,C.y)
    for k=0,5 do local t=k/6*math.pi*2+i; px(img,cx+math.cos(t)*(i*2+3),cy+math.sin(t)*(i*2+3),C.o) end
  else
    local r = 4 + (i-5)*1.5
    disc(img,cx-3,cy-2-(i-5),r,C.smoke); disc(img,cx+3,cy-3-(i-5),r-1,C.smoke)
    if i==6 then disc(img,cx,cy,3,C.dr) end
  end
end)

L.save(out)
