#!/usr/bin/env python3
"""Bangun ikon app Duitku dari file logo (assets/logo-src.jpg).

Sumber: tile navy + garis emas dengan sudut membulat di atas latar putih.
Keluarannya ikon kotak penuh (background navy) supaya iOS/Android yang
membulatkan sendiri — gak ada sudut putih nyangkut di dalam mask.

Pakai: python3 tools/build_icons.py
"""
import os
from collections import Counter

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'logo-src.jpg')
OUT = os.path.join(ROOT, 'icons')

WHITE_CUT = 240      # piksel di atas ini dianggap latar putih (dibuang)
EDGE_CUT = 200       # batas mask saat menempel tile ke kanvas navy


def navy_color(tile):
    """Warna latar tile: sampel pita tipis di tepi atas & bawah (hindari sudut)."""
    tw, th = tile.size
    xs = range(int(tw * 0.3), int(tw * 0.7))
    px = [tile.getpixel((x, y)) for y in (3, 4, 5, th - 5, th - 4) for x in xs]
    return Counter(px).most_common(1)[0][0]


def square_tile(src):
    """Potong tile dari latar putih, lalu tempel ke kanvas navy persegi."""
    flat = src.convert('RGB')
    bbox = flat.convert('L').point(lambda v: 0 if v > WHITE_CUT else 255).getbbox()
    if not bbox:
        raise SystemExit('tile tidak ketemu di ' + SRC)
    tile = flat.crop(bbox)
    navy = navy_color(tile)
    # mask: semua yang bukan putih (garis emas + badan tile navy)
    alpha = tile.convert('L').point(lambda v: 255 if v <= EDGE_CUT else 0)
    side = max(tile.size)
    canvas = Image.new('RGB', (side, side), navy)
    canvas.paste(tile, ((side - tile.width) // 2, (side - tile.height) // 2), alpha)
    return canvas, navy


def main():
    if not os.path.exists(SRC):
        raise SystemExit('sumber logo hilang: ' + SRC)
    os.makedirs(OUT, exist_ok=True)
    art, navy = square_tile(Image.open(SRC))
    print('tile :', art.size, '| navy #%02x%02x%02x' % navy)

    for size in (512, 192, 180):
        art.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, f'duitku-gold-{size}.png'))

    # maskable: konten 72% di tengah, sisa bleed navy (aman dari mask bulat/Android)
    mask_size = 512
    inner = int(mask_size * 0.72)
    canvas = Image.new('RGB', (mask_size, mask_size), navy)
    off = (mask_size - inner) // 2
    canvas.paste(art.resize((inner, inner), Image.LANCZOS), (off, off))
    canvas.save(os.path.join(OUT, 'duitku-gold-maskable-512.png'))

    for f in sorted(os.listdir(OUT)):
        print('  ', f, os.path.getsize(os.path.join(OUT, f)), 'bytes')


if __name__ == '__main__':
    main()
