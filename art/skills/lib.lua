-- Shared pixel helpers for the battle-FX sheets (dofile'd from each effect script).
local L = {}
function L.rgba(r,g,b,a) return app.pixelColor.rgba(r,g,b,a or 255) end
function L.new(W,H,out,layer)
  local spr = Sprite(W,H,ColorMode.RGB); spr.filename = out; spr.layers[1].name = layer or "fx"
  L.W, L.H, L.spr = W, H, spr
  return spr
end
function L.px(img,x,y,c) x=math.floor(x+0.5); y=math.floor(y+0.5); if x>=0 and y>=0 and x<L.W and y<L.H then img:drawPixel(x,y,c) end end
function L.line(img,x1,y1,x2,y2,c)
  local n=math.max(math.abs(x2-x1),math.abs(y2-y1)); n=math.max(1,math.ceil(n))
  for i=0,n do local t=i/n; L.px(img,x1+(x2-x1)*t,y1+(y2-y1)*t,c) end
end
function L.rect(img,x1,y1,x2,y2,c) for y=y1,y2 do for x=x1,x2 do L.px(img,x,y,c) end end end
function L.disc(img,cx,cy,r,c) for y=math.floor(cy-r),math.ceil(cy+r) do for x=math.floor(cx-r),math.ceil(cx+r) do
  if (x-cx)^2+(y-cy)^2 <= r*r then L.px(img,x,y,c) end end end end
function L.ring(img,cx,cy,r,c) for a=0,47 do local t=a/48*math.pi*2; L.px(img,cx+math.cos(t)*r,cy+math.sin(t)*r,c) end end
-- Flame tongue: base (x,y) width w, height h, sway s
function L.flame(img,x,y,w,h,s,cols)
  for i=0,h do
    local t=i/h; local half=w*(1-t)^0.8*0.5*(1+0.25*math.sin(t*6))
    local cx=x+s*t*t
    for xx=math.floor(cx-half),math.ceil(cx+half) do
      local d=math.abs(xx-cx)/(half+0.01)
      local c = (d<0.35 and t<0.55) and cols[3] or ((d<0.7 and t<0.8) and cols[2] or cols[1])
      L.px(img,xx,y-i,c)
    end
  end
end
-- Frames are appended across tags; tag(name, count, ms, drawFn(img, i, n))
L.frame = 0
function L.tag(name,n,ms,fn)
  local first = L.frame + 1
  for i=1,n do
    if L.frame > 0 then L.spr:newEmptyFrame() end
    L.frame = L.frame + 1
    local img = Image(L.W,L.H,ColorMode.RGB)
    fn(img,i,n)
    L.spr.frames[L.frame].duration = ms
    L.spr:newCel(L.spr.layers[1],L.frame,img,Point(0,0))
  end
  L.tags = L.tags or {}
  table.insert(L.tags,{name,first,L.frame})
end
function L.save(out)
  for _,t in ipairs(L.tags) do local tg = L.spr:newTag(t[2],t[3]); tg.name = t[1] end
  L.spr:saveAs(out)
end
return L
