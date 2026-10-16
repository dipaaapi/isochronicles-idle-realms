-- Animated pixel-art troop transport passing overhead during invasion waves.
local W, H, N = 48, 32, 6
local out = app.params["out"] or "troop-transport.aseprite"
local function rgba(r,g,b,a) return app.pixelColor.rgba(r,g,b,a or 255) end
local C = {
  shadow=rgba(8,14,20), body=rgba(56,68,69), light=rgba(105,119,109), hi=rgba(170,178,153),
  dark=rgba(30,39,42), glass=rgba(75,145,166), glassHi=rgba(161,221,224), red=rgba(233,72,65),
  gold=rgba(236,178,70), exhaust=rgba(222,157,82,175),
}
local spr = Sprite(W,H,ColorMode.RGB); spr.filename=out; spr.layers[1].name="armoured-transport"
for _=2,N do spr:newEmptyFrame() end
local function px(img,x,y,c) if x>=0 and y>=0 and x<W and y<H then img:drawPixel(math.floor(x),math.floor(y),c) end end
local function line(img,x1,y1,x2,y2,c)
  local n=math.max(math.abs(x2-x1),math.abs(y2-y1))
  for i=0,n do local t=n==0 and 0 or i/n; px(img,x1+(x2-x1)*t,y1+(y2-y1)*t,c) end
end
local function rect(img,x1,y1,x2,y2,c)
  for y=y1,y2 do for x=x1,x2 do px(img,x,y,c) end end
end
for f=1,N do
  local img=Image(W,H,ColorMode.RGB)
  local prop=(f%2==0) and 8 or 9
  -- exhaust and rear warning light flicker frame-to-frame
  rect(img,2,15,8,17,C.dark); px(img,2,16,(f%3==0) and C.gold or C.exhaust)
  -- raised tail, wing and armoured fuselage
  line(img,10,15,14,9,C.dark); line(img,13,15,16,10,C.light); line(img,10,15,16,15,C.hi)
  -- wide wing and tailplane, shaded to read as a low-angle aerial view
  line(img,16,16,24,26,C.dark); line(img,19,15,26,24,C.light); line(img,24,26,39,18,C.dark)
  line(img,19,14,34,17,C.hi); line(img,34,17,41,17,C.light)
  line(img,15,15,11,8,C.dark); line(img,16,14,13,8,C.light); line(img,11,8,18,10,C.hi)
  -- cargo plane body and nose, with cockpit glazing
  rect(img,9,14,37,17,C.shadow); rect(img,10,14,36,16,C.body); line(img,12,14,34,14,C.light)
  line(img,11,17,36,17,C.dark); line(img,12,13,32,13,C.hi)
  line(img,36,14,42,15,C.hi); line(img,42,15,45,17,C.body); line(img,45,17,42,19,C.dark)
  rect(img,13,12,17,13,C.dark); rect(img,14,12,16,12,C.glass); px(img,14,12,C.glassHi)
  rect(img,21,13,32,14,C.dark); rect(img,23,13,30,13,C.light)
  -- opened rear ramp and tiny paratrooper silhouettes in the lit bay
  line(img,8,16,5,21,C.dark); line(img,7,17,4,21,C.hi); px(img,6,14,C.gold)
  px(img,9,13,C.red); px(img,35,13,C.gold)
  for y=14,16 do px(img,19,y,C.hi) end
  -- rotating propeller at the nose, alternately cross-shaped and vertical
  if f%2==0 then line(img,45,12,45,21,C.hi); line(img,43,16,47,16,C.light)
  else line(img,43,14,47,19,C.hi); line(img,44,19,47,14,C.light) end
  -- low cockpit highlight and panel rivets
  px(img,18,14,C.gold); px(img,33,15,C.hi); px(img,27,15,C.dark)
  app.activeSprite.frames[f].duration=100
  spr:newCel(spr.layers[1],f,img,Point(0,0))
end
local tag=spr:newTag(1,N); tag.name="fly"
spr:saveAs(out)
