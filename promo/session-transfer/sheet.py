"""Contact sheet of key moments (build/sheet_N.jpg) so layout problems show up before the full render.
usage: python3 sheet.py T1 T2 ...   (seconds)"""
import os, sys
from PIL import Image, ImageDraw
import render
ts = [float(a) for a in sys.argv[1:]]; cols = 3; tw, th = 960, 540
rows = (len(ts) + cols - 1) // cols; sheet = Image.new('RGB', (cols * tw, rows * th))
for k, t in enumerate(ts):
    im = Image.fromarray(render.frame(int(t * render.FPS))).resize((tw, th), Image.LANCZOS)
    ImageDraw.Draw(im).text((8, 4), f'{t:.1f}s', fill=(255, 255, 0))
    sheet.paste(im, ((k % cols) * tw, (k // cols) * th))
out = os.path.join(render.B, 'sheet.jpg'); sheet.save(out, quality=86); print(out)
