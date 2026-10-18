"""
Generates the Steamworks store / library images from the game's own art
(public/backgrounds/title-screen.jpeg holds the painted logo).

    python scripts/steam-art.py          -> steam/store-assets/*.png|jpg|ico

Sizes follow the Steamworks "Graphical Assets" rules. Capsules show only the
game art and logo: no review quotes, awards, discount text or extra marketing
copy (Valve rejects those). The library logo is a transparent PNG; the library
hero has no logo or text. Screenshots (min 1920x1080, at least 5) must be real
gameplay captures, so they are not generated here.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'steam' / 'store-assets'
OUT.mkdir(parents=True, exist_ok=True)

title = Image.open(ROOT / 'public/backgrounds/title-screen.jpeg').convert('RGB')  # 2752x1536
W, H = title.size
# Painted logo plaque (horns, crest, "IsoChronicle" and its subtitle); ends above the tagline
LOGO_BOX = (int(W * 0.245), int(H * 0.150), int(W * 0.755), int(H * 0.470))
logo = title.crop(LOGO_BOX)

# Background without any text: the lava valley below the tagline, with the sky strip on top
def scene_without_logo() -> Image.Image:
    lava = title.crop((0, int(H * 0.56), W, H))
    sky = title.crop((0, 0, W, int(H * 0.14)))
    img = Image.new('RGB', (W, sky.height + lava.height))
    img.paste(sky, (0, 0))
    img.paste(lava, (0, sky.height))
    # Blend the seam
    seam = img.crop((0, sky.height - 40, W, sky.height + 40)).filter(ImageFilter.GaussianBlur(18))
    img.paste(seam, (0, sky.height - 40))
    return img

def fit_cover(img: Image.Image, size, focus_y=0.5) -> Image.Image:
    """Scale to cover `size`, then crop around a vertical focus point."""
    tw, th = size
    s = max(tw / img.width, th / img.height)
    r = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    x = (r.width - tw) // 2
    y = min(max(0, round(r.height * focus_y - th / 2)), r.height - th)
    return r.crop((x, y, x + tw, y + th))

def logo_on(bg: Image.Image, width_frac: float, center_y: float) -> Image.Image:
    out = bg.copy()
    lw = round(out.width * width_frac)
    lh = round(logo.height * lw / logo.width)
    if lh > out.height * 0.9:
        lh = round(out.height * 0.9)
        lw = round(logo.width * lh / logo.height)
    l = logo.resize((lw, lh), Image.LANCZOS)
    # Soft-edge mask so the crop's rectangle doesn't show
    mask = Image.new('L', l.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, lw - 1, lh - 1), radius=max(4, lh // 10), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(max(2, lh // 40)))
    out.paste(l, ((out.width - lw) // 2, round(out.height * center_y - lh / 2)), mask)
    return out

bare = scene_without_logo()

def save(img: Image.Image, name: str):
    path = OUT / name
    img.save(path, quality=92) if name.endswith('.jpg') else img.save(path)
    print(f'{path.relative_to(ROOT)}  {img.size[0]}x{img.size[1]}')

# Store capsules
save(logo_on(fit_cover(bare, (920, 430), 0.45), 0.86, 0.5), 'header_capsule_920x430.png')
save(logo_on(fit_cover(bare, (462, 174), 0.45), 0.92, 0.5), 'small_capsule_462x174.png')
save(logo_on(fit_cover(bare, (1232, 706), 0.5), 0.72, 0.42), 'main_capsule_1232x706.png')
save(logo_on(fit_cover(bare, (748, 896), 0.5), 0.94, 0.3), 'vertical_capsule_748x896.png')
save(fit_cover(bare, (1438, 810), 0.55).filter(ImageFilter.GaussianBlur(1.5)), 'page_background_1438x810.png')

# Library
save(logo_on(fit_cover(bare, (600, 900), 0.5), 0.94, 0.25), 'library_capsule_600x900.png')
save(logo_on(fit_cover(bare, (920, 430), 0.45), 0.86, 0.5), 'library_header_920x430.png')
save(fit_cover(bare, (3840, 1240), 0.62), 'library_hero_3840x1240.png')

# Library logo: transparent PNG, logo plaque only
canvas = Image.new('RGBA', (1280, 720), (0, 0, 0, 0))
lw = 1240
lh = round(logo.height * lw / logo.width)
l = logo.resize((lw, lh), Image.LANCZOS).convert('RGBA')
mask = Image.new('L', l.size, 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, lw - 1, lh - 1), radius=lh // 10, fill=255)
l.putalpha(mask.filter(ImageFilter.GaussianBlur(3)))
canvas.paste(l, ((1280 - lw) // 2, (720 - lh) // 2), l)
save(canvas, 'library_logo_1280x720.png')

# Icons: the Support Slime portrait (the game's mascot), square
crest = Image.open(ROOT / 'public/portraits/slime.png').convert('RGB')
crest = fit_cover(crest, (256, 256), 0.5)
save(crest, 'app-icon-256.png')
save(crest.resize((184, 184), Image.LANCZOS), 'community_icon_184x184.jpg')
crest.save(OUT / 'client_icon.ico', sizes=[(16, 16), (32, 32), (48, 48), (256, 256)])
print('steam/store-assets/client_icon.ico  16/32/48/256')
