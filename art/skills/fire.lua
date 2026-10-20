-- Establishment fire in stages: ignite -> burn -> blaze, then smoulder after it is doused,
-- plus a rising smoke puff shared with the transport's engine trail.
local L = dofile("art/skills/lib.lua")
local rgba, px, disc, flame = L.rgba, L.px, L.disc, L.flame
local out = app.params["out"] or "fire.aseprite"
L.new(32,40,out,"fire")
local HOT  = { rgba(200,30,30), rgba(251,140,50), rgba(255,236,140) }
local BLUE = { rgba(220,60,30), rgba(255,180,80), rgba(255,255,220) }
local EMB, EMB2 = rgba(255,200,90), rgba(255,120,40,200)
local SM = { rgba(60,56,62,190), rgba(92,86,92,150), rgba(130,124,128,100), rgba(170,164,166,60) }
local ASH, CHAR = rgba(40,34,34), rgba(90,40,30)
local B = 38 -- base line

local function embers(img,i,count,spread)
  for k=1,count do
    local s = k*7.31
    local y = B - ((i*5 + s*9) % 34)
    px(img,16 + math.sin(s + i*0.6)*spread,y,(k%2==0) and EMB or EMB2)
  end
end

L.tag("ignite",4,90,function(img,i)
  local h = 4 + i*3
  flame(img,16,B,5+i,h,(i%2==0) and 1 or -1,HOT)
  if i>2 then flame(img,11,B,3,h*0.6,-1,HOT) end
  embers(img,i,i,4)
end)

L.tag("burn",6,85,function(img,i)
  local s = math.sin(i/6*math.pi*2)
  flame(img,16,B,10,18+s*2,s*2,HOT)
  flame(img,9,B,6,11-s*2,-2+s,HOT)
  flame(img,23,B,6,12+s*1.5,2-s,HOT)
  embers(img,i,4,7)
end)

L.tag("blaze",6,70,function(img,i)
  local s = math.sin(i/6*math.pi*2); local c = math.cos(i/6*math.pi*2)
  flame(img,16,B,16,30+s*3,s*3,BLUE)
  flame(img,7,B,9,18-c*3,-3+s,HOT)
  flame(img,25,B,9,19+c*3,3-s,HOT)
  flame(img,12,B-2,6,22+c*2,-1,BLUE)
  flame(img,21,B-2,6,21-s*2,1,BLUE)
  embers(img,i,8,12)
end)

L.tag("smoulder",4,140,function(img,i)
  for x=6,26 do px(img,x,B,ASH); if x%3==i%3 then px(img,x,B-1,CHAR) end end
  if i%2==1 then px(img,12,B-1,EMB2); px(img,20,B-1,EMB) else px(img,16,B-1,EMB) end
  local y = B - 4 - i*6
  disc(img,15+(i%2),y,2+i*0.6,SM[math.min(4,i)])
  disc(img,19,y+6,1.6,SM[3])
end)

L.tag("smoke",8,90,function(img,i)
  local t = (i-1)/7
  local r = 3 + t*8
  local y = 32 - t*20
  local c = SM[math.min(4,1+math.floor(t*4))]
  disc(img,16-t*3,y,r,c); disc(img,16+r*0.6,y+2,r*0.7,c)
  if i<3 then disc(img,16,y,2,SM[1]) end
end)

L.save(out)
