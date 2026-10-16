-- Animated canopy opening/fluttering above a descending invader.
local W,H,N=32,40,4
local out=app.params["out"] or "parachute.aseprite"
local function rgba(r,g,b,a) return app.pixelColor.rgba(r,g,b,a or 255) end
local C={shade=rgba(49,35,31),red=rgba(176,53,47),cream=rgba(232,205,157),gold=rgba(219,164,73),
  rope=rgba(72,59,48),light=rgba(255,231,187),metal=rgba(102,116,120)}
local spr=Sprite(W,H,ColorMode.RGB); spr.filename=out; spr.layers[1].name="fluttering-canopy-and-lines"
for _=2,N do spr:newEmptyFrame() end
local function px(img,x,y,c) if x>=0 and y>=0 and x<W and y<H then img:drawPixel(math.floor(x),math.floor(y),c) end end
local function line(img,x1,y1,x2,y2,c)
  local n=math.max(math.abs(x2-x1),math.abs(y2-y1))
  for i=0,n do local t=n==0 and 0 or i/n; px(img,x1+(x2-x1)*t,y1+(y2-y1)*t,c) end
end
for f=1,N do
  local img=Image(W,H,ColorMode.RGB)
  local drift=(f==1 or f==4) and -1 or 1
  local cx=16+drift
  -- canopy silhouette with scalloped lower hem, red / cream alternating gores
  for y=4,16 do
    local half=math.floor((y-3)*1.38)
    for x=cx-half,cx+half do
      local dx=math.abs(x-cx)
      if dx <= half and (y<15 or dx%3~=1) then
        local gore=math.floor((x-cx+16)/5)%2
        px(img,x,y,(gore==0) and C.red or C.cream)
      end
    end
  end
  line(img,cx-18,14,cx-14,17,C.shade); line(img,cx+18,14,cx+14,17,C.shade)
  line(img,cx-15,13,cx-13,16,C.light); line(img,cx+15,13,cx+13,16,C.gold)
  line(img,cx,4,cx,16,C.light)
  -- suspension lines converge on a small harness above the troop
  line(img,cx-15,15,13,28,C.rope); line(img,cx+15,15,19,28,C.rope)
  line(img,cx-8,15,14,28,C.gold); line(img,cx+8,15,18,28,C.gold)
  line(img,13,28,19,28,C.metal); px(img,15,27,C.light); px(img,17,27,C.light)
  -- subtle gust marks make the canopy visibly flutter in the loop
  if f==2 then px(img,2,10,C.light); px(img,29,8,C.gold) elseif f==4 then px(img,3,8,C.gold); px(img,28,11,C.light) end
  app.activeSprite.frames[f].duration=115
  spr:newCel(spr.layers[1],f,img,Point(0,0))
end
local tag=spr:newTag(1,N); tag.name="fall"
spr:saveAs(out)
