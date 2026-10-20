-- Paratrooper canopy: deploy (bundle bursts open) -> fall (swaying loop) -> land (canopy collapses).
local L = dofile("art/skills/lib.lua")
local rgba, px, line = L.rgba, L.px, L.line
local out = app.params["out"] or "parachute.aseprite"
L.new(40,44,out,"canopy-and-lines")
local C = { shade=rgba(70,30,28), red=rgba(176,53,47), redHi=rgba(214,84,70), cream=rgba(232,205,157), creamHi=rgba(250,232,198),
  gold=rgba(219,164,73), rope=rgba(72,59,48), light=rgba(255,240,210), metal=rgba(102,116,120), wind=rgba(255,255,255,120) }
local HX, HY = 20, 36 -- harness point (the trooper hangs just below it)

-- canopy centred at cx, top y0, half-width w, depth d, squash 0..1 (1 = full dome)
local function canopy(img,cx,y0,w,d,tilt)
  for row=0,d do
    local t = row/d
    local half = math.floor(w*math.sqrt(math.max(0,1-(1-t)^2)) + 0.5)
    local y = y0 + row + math.floor(tilt*(row/d))
    for x=cx-half,cx+half do
      local dx = math.abs(x-cx)
      if row<d or dx%4~=2 then
        local gore = math.floor((x-cx+40)/5)%2
        local c = (gore==0) and C.red or C.cream
        if row<2 then c = (gore==0) and C.redHi or C.creamHi end
        if x==cx-half or x==cx+half then c = C.shade end
        px(img,x,y,c)
      end
    end
  end
  return y0 + d
end
local function lines(img,cx,yb,w)
  line(img,cx-w,yb,HX-2,HY,C.rope); line(img,cx+w,yb,HX+2,HY,C.rope)
  line(img,cx-w*0.45,yb,HX-1,HY,C.gold); line(img,cx+w*0.45,yb,HX+1,HY,C.gold)
  line(img,HX-2,HY,HX+2,HY,C.metal); px(img,HX,HY-1,C.light)
end

L.tag("deploy",4,70,function(img,i)
  if i==1 then
    line(img,HX,HY-2,HX,HY-10,C.rope); L.rect(img,HX-2,HY-15,HX+2,HY-10,C.red); px(img,HX-1,HY-14,C.creamHi)
  elseif i==2 then
    local yb = canopy(img,HX,HY-22,5,8,0); lines(img,HX,yb,4)
    px(img,HX-8,HY-18,C.wind); px(img,HX+8,HY-20,C.wind)
  else
    local w = (i==3) and 11 or 17; local d = (i==3) and 10 or 12
    local yb = canopy(img,HX,HY-30,w,d,0); lines(img,HX,yb,w-1)
    if i==4 then px(img,1,10,C.wind); px(img,38,12,C.wind) end
  end
end)

L.tag("fall",6,110,function(img,i)
  local a = math.sin(i/6*math.pi*2)
  local cx = HX + math.floor(a*2+0.5)
  local w = 17 + ((i%3==0) and -1 or 0)
  local yb = canopy(img,cx,HY-32+((i%2==0) and 1 or 0),w,12,a)
  lines(img,cx,yb,w-1)
  if i==2 then px(img,2,8,C.wind); px(img,3,8,C.wind) elseif i==5 then px(img,36,10,C.wind); px(img,37,10,C.wind) end
end)

L.tag("land",5,80,function(img,i)
  local w = 17 - i*2; local d = math.max(2, 12 - i*2)
  local cx = HX + i*2
  local yb = canopy(img,cx,HY-32+i*6,w,d,i)
  if i<4 then lines(img,cx,yb,w-1) else line(img,HX,HY,cx-w,yb,C.rope) end
end)

L.save(out)
