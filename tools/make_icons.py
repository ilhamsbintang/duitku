#!/usr/bin/env python3
"""Generate ikon PWA Duitku (apple-touch 180, any 192/512, maskable 512)."""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'icons')
os.makedirs(OUT, exist_ok=True)

BG = (11, 59, 54)          # deep teal
FG = (245, 250, 249)       # near-white
ACCENT = (93, 202, 190)    # light teal

FONT_CANDIDATES = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
]


def load_font(size):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default(size)


def draw_mark(size, bg_inset_ratio=0.0, radius_ratio=0.22):
    """bg_inset_ratio > 0 -> background full bleed, mark lebih kecil (maskable)."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if bg_inset_ratio > 0:
        d.rectangle([0, 0, size - 1, size - 1], fill=BG)
    else:
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=BG)

    scale = 1.0 - bg_inset_ratio
    fs = int(size * 0.52 * scale)
    f = load_font(fs)
    text = 'Rp'
    # anchor "mm" = tengah metrik; digeser sedikit turun karena 'p' punya descender
    d.text((size / 2, size / 2 + size * 0.022 * scale), text, font=f,
           fill=FG, anchor='mm')
    return img


def main():
    draw_mark(180).save(os.path.join(OUT, 'icon-180.png'))
    draw_mark(192).save(os.path.join(OUT, 'icon-192.png'))
    draw_mark(512).save(os.path.join(OUT, 'icon-512.png'))
    draw_mark(512, bg_inset_ratio=0.30).save(os.path.join(OUT, 'icon-maskable-512.png'))
    draw_mark(64).save(os.path.join(OUT, 'favicon.png'))
    for f in sorted(os.listdir(OUT)):
        p = os.path.join(OUT, f)
        print(f, os.path.getsize(p), 'bytes')


if __name__ == '__main__':
    main()
