"""Session Transfer: a 46-second cinematic teaser, drawn in code.

Three AI stills (laptops, glass panes, capsule) get slow virtual-camera moves, dust, light flashes and bloom; the login wall,
the capsule's data chips, the 5:00 clock and the end card are HTML graphics rendered by gfx.cjs; the payoff shot is the REAL
popup, screenshotted from the built extension by capture_ui.spec.ts and animated here.

usage: python3 render.py [start_frame end_frame out.mp4]   (no args = render all, 4 workers)
       python3 render.py still SECONDS                    (one frame -> build/still_SECONDS.jpg)
Pipeline pieces: plan.py (timeline), gfx.cjs (graphics), hits.py + mix.py (audio), build.sh (everything).
"""
import json, math, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__)); B = os.path.join(HERE, 'build'); S = os.path.join(HERE, 'src')
from plan import W, H, FPS, DUR, BAR, SHOTS, XFADE, HITS, PLACED
NFRAMES = int(DUR * FPS)

# ---------- helpers ----------
def load(p, mode='RGB'):
    """Open an image at p and convert it to the requested Pillow color mode."""
    return Image.open(p).convert(mode)
def f32(im):
    """Convert an 8-bit image to a float32 array with values in [0, 1]."""
    return np.asarray(im, dtype=np.float32) / 255.0
def clamp01(x):
    """Clamp a scalar to the inclusive interval [0, 1]."""
    return min(1.0, max(0.0, x))
def ramp(t, a, b):
    """Map t from [a, b] to [0, 1], using a step at a when b <= a."""
    return clamp01((t - a) / (b - a)) if b > a else float(t >= a)
def smooth(x):
    """Apply cubic smoothstep to x after clamping it to [0, 1]."""
    x = clamp01(x); return x * x * (3 - 2 * x)
def ease_io(x):
    """Apply cosine ease-in/ease-out to x clamped to [0, 1]."""
    x = clamp01(x); return 0.5 - 0.5 * math.cos(math.pi * x)
def lerp(a, b, x):
    """Linearly interpolate from a to b using the unclamped factor x."""
    return a + (b - a) * x
def window(t, a, b, fi=0.6, fo=0.6):
    """Return a smooth fade envelope over [a, b] with fade lengths fi and fo."""
    return smooth(ramp(t, a, a + fi)) * (1 - smooth(ramp(t, b - fo, b)))

def cam_origin(img, s, cx, cy):
    """Return (k, x0, y0): source pixels per output pixel and the source-space top-left of the camera view."""
    sw, sh = img.size
    k = (sw / W) / s; hx, hy = k * W / 2, k * H / 2
    return k, min(max(cx * sw, hx), sw - hx) - hx, min(max(cy * sh, hy), sh - hy) - hy
def camera(img, s, cx, cy):
    """Virtual camera on a still: zoom s (1 = fill frame width), centre (cx, cy) normalised."""
    k, x0, y0 = cam_origin(img, s, cx, cy)
    return img.transform((W, H), Image.AFFINE, (k, 0, x0, 0, k, y0), resample=Image.BICUBIC)
def to_screen(img, s, cx, cy, nx, ny):
    """Screen position of normalised image point (nx, ny) under camera(img, s, cx, cy)."""
    k, x0, y0 = cam_origin(img, s, cx, cy)
    return (nx * img.size[0] - x0) / k, (ny * img.size[1] - y0) / k

def over(base, rgba, opacity=1.0, x=0, y=0):
    """Alpha-composite an RGBA float layer onto base at (x, y), clipped."""
    if opacity <= 0.001: return
    h, w = rgba.shape[:2]
    x0, y0, x1, y1 = max(x, 0), max(y, 0), min(x + w, W), min(y + h, H)
    if x1 <= x0 or y1 <= y0: return
    l = rgba[y0 - y:y1 - y, x0 - x:x1 - x]
    a = l[..., 3:4] * opacity
    base[y0:y1, x0:x1] = base[y0:y1, x0:x1] * (1 - a) + l[..., :3] * a

# ---------- assets ----------
LAP, PAN, CAP = (load(os.path.join(S, n)) for n in ('laptops.jpg', 'panes.jpg', 'capsule.jpg'))
UI = json.load(open(os.path.join(S, 'ui.json')))
def popup(name):
    """The real popup screenshot with rounded corners and an emerald hairline, as an RGBA Pillow image."""
    im = load(os.path.join(S, f'ui_{name}.png'), 'RGBA'); m = Image.new('L', im.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, im.size[0] - 1, im.size[1] - 1], 34, fill=255); im.putalpha(m)
    ImageDraw.Draw(im).rounded_rectangle([0, 0, im.size[0] - 1, im.size[1] - 1], 34, outline=(16, 185, 129, 150), width=3)
    return im
POP = {k: popup(k) for k in ('ready', 'receive', 'restored')}
SUBS = [f32(load(os.path.join(B, 'subs', f'sub_{k}.png'), 'RGBA')) for k in range(len(PLACED))]

yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
VIGNETTE = (1 - 0.45 * (((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H / 2) / (H * 0.78)) ** 2)).clip(0.32, 1)[..., None]
rng = np.random.default_rng(7)
GRAIN = [rng.normal(0, 1, (H // 2, W // 2)).astype(np.float32) for _ in range(6)]
EMERALD, CYAN = (0.063, 0.725, 0.506), (0.133, 0.827, 0.933)

def radial(cx, cy, r, color, power=2.0):
    """Return a full-frame RGB glow centered at (cx, cy) with radius r in pixels."""
    g = np.exp(-(((xx - cx) ** 2 + (yy - cy) ** 2) / (r * r)) ** (power / 2))
    return g[..., None] * np.array(color, np.float32)
def shell(cx, cy, r, w, color):
    """A thin expanding ring of light (a shock ripple) of radius r and thickness w."""
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    return (np.exp(-((d - r) / w) ** 2))[..., None] * np.array(color, np.float32)
def flare(cx, cy, k):
    """Anamorphic light flash: hot core + long horizontal streak, emerald-white."""
    if k <= 0.002: return 0
    core = np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * 260 ** 2))
    streak = np.exp(-((yy - cy) / 9) ** 2) * np.exp(-np.abs(xx - cx) / 700)
    wash = np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * 900 ** 2))
    return (core[..., None] * np.array([0.75, 1.0, 0.9]) + streak[..., None] * np.array([0.45, 1.0, 0.78]) * 1.4
            + wash[..., None] * np.array([0.12, 0.6, 0.45]) * 0.6) * k

def sprite(r):
    """Return a float32 Gaussian particle mask with standard deviation r pixels."""
    n = int(r * 4) | 1; c = n // 2
    g = np.exp(-(((np.arange(n) - c)[:, None]) ** 2 + ((np.arange(n) - c)[None, :]) ** 2) / (2 * r * r))
    return g.astype(np.float32)
SPRITES = [sprite(r) for r in (1.2, 2.0, 3.2, 6.0, 10.0)]
def add_sprite(buf, x, y, si, col, k):
    """Add the tinted SPRITES[si] to buf in place at (x, y), clipped to the frame."""
    sp = SPRITES[si]; n = sp.shape[0]; x0, y0 = int(x) - n // 2, int(y) - n // 2
    xa, ya, xb, yb = max(x0, 0), max(y0, 0), min(x0 + n, W), min(y0 + n, H)
    if xb <= xa or yb <= ya: return
    buf[ya:yb, xa:xb] += sp[ya - y0:yb - y0, xa - x0:xb - x0, None] * (np.array(col, np.float32) * k)

prng = np.random.default_rng(11)
MOTES = [dict(x=prng.uniform(0, W), y=prng.uniform(0, H), vx=prng.uniform(-12, 12), vy=prng.uniform(-22, -4),
              ph=prng.uniform(0, 7), si=int(prng.integers(1, 5)), k=prng.uniform(0.05, 0.22)) for _ in range(54)]
def motes(buf, t, k, col=(0.45, 1.0, 0.8)):
    """Add drifting, twinkling dust motes to buf at time t in seconds, tinted by col."""
    for m in MOTES:
        x = (m['x'] + m['vx'] * t) % W; y = (m['y'] + m['vy'] * t) % H
        add_sprite(buf, x, y, m['si'], col, m['k'] * (0.65 + 0.35 * math.sin(1.7 * t + m['ph'])) * k)

# ---------- shots (each returns an RGB float frame) ----------
LAP_SCREEN = (0.378, 0.52)
def shot_laptops(t):
    """Two laptops: one signed in, one waiting. Slow push-in toward the glowing screen."""
    u = ease_io(ramp(t, 0, 6.4)); s, cx, cy = lerp(1.0, 1.32, u), lerp(0.5, 0.43, u), lerp(0.5, 0.52, u)
    f = f32(camera(LAP, s, cx, cy))
    sx, sy = to_screen(LAP, s, cx, cy, *LAP_SCREEN)
    f += radial(sx, sy, 520 * s, (0.02, 0.22, 0.14)) * (0.8 + 0.2 * math.sin(2.1 * t) * math.sin(0.7 * t + 1))
    buf = np.zeros_like(f); motes(buf, t, 0.9); f += buf
    return f

def _ribbon():
    """Ribbon centre line of the panes still, found from its emerald pixels, as (x, y) arrays in normalised coordinates."""
    a = np.asarray(PAN.resize((640, 360)), dtype=np.float32) / 255
    g = np.clip(a[..., 1] - 0.6 * (a[..., 0] + a[..., 2]), 0, 1) * a[..., 1]
    xs, ys = [], []
    for x in range(140, 520, 6):
        c = g[:, x]
        if c.sum() > 0.08: xs.append(x / 640); ys.append(float((c * np.arange(360)).sum() / c.sum()) / 360)
    ys = np.convolve(np.pad(ys, 3, mode='edge'), np.ones(7) / 7, 'valid')
    return np.array(xs), ys
RIB_X, RIB_Y = _ribbon()

def shot_panes(t):
    """Two glass panes joined by a ribbon of light; particles stream along the ribbon's real centre line."""
    u = ease_io(ramp(t, 12.0, 18.8)); s, cx, cy = lerp(1.0, 1.12, u), lerp(0.5, 0.53, u), lerp(0.57, 0.6, u)
    f = f32(camera(PAN, s, cx, cy))
    buf = np.zeros_like(f); k = ramp(t, 12.8, 13.8)
    for j in range(46):
        ph = (t * 0.42 + j / 46) % 1; nx = lerp(RIB_X[0], RIB_X[-1], ph); ny = float(np.interp(nx, RIB_X, RIB_Y)) + 0.012 * math.sin(7 * ph + j)
        x, y = to_screen(PAN, s, cx, cy, nx, ny); fade = math.sin(math.pi * ph)
        add_sprite(buf, x, y, 2 + (j % 2), (0.55, 1.0, 0.85), 0.9 * fade * k)
    ph = (t * 0.6) % 1; nx = lerp(RIB_X[0], RIB_X[-1], ph); x, y = to_screen(PAN, s, cx, cy, nx, float(np.interp(nx, RIB_X, RIB_Y)))
    add_sprite(buf, x, y, 4, (0.6, 1.0, 0.9), 1.4 * k)
    motes(buf, t, 0.8); f += buf
    return f

CAPS = (0.498, 0.50)
def shot_capsule(t):
    """The sealed capsule, kept at frame centre so the HTML overlay lines up; glow, ripples, tint to cyan once a code is set."""
    u = ease_io(ramp(t, 18.0, 33.4)); s = lerp(1.0, 1.3, u)
    f = f32(camera(CAP, s, *CAPS)) * 0.9
    seal = PLACED[3]['chunks'][1]['at'] + 0.65; code_on = PLACED[4]['chunks'][1]['at'] + 0.5
    tint = smooth(ramp(t, code_on, code_on + 0.8)); col = np.array(EMERALD) * (1 - tint) + np.array(CYAN) * tint
    pulse = 0.55 + 0.2 * math.sin(2.6 * t) + 0.9 * math.exp(-max(0, t - seal) * 2.2) * (t > seal)
    f += radial(W / 2, H / 2, 330, col * 0.55) * pulse
    for t0 in (20.0, seal):
        a = t - t0
        if 0 <= a < 2.2: f += shell(W / 2, H / 2, 140 + 620 * (1 - math.exp(-a * 1.7)), 14 + 10 * a, col * 0.9) * (1 - a / 2.2) ** 2 * 0.7
    buf = np.zeros_like(f); motes(buf, t, 0.8, tuple(col * 1.2)); f += buf
    return f

_bg5 = camera(PAN, 1.5, 0.5, 0.5).filter(ImageFilter.GaussianBlur(30))
BG5 = f32(_bg5) * 0.32
POP_X, POP_SC = 1150, 0.8
def _highlight(im, boxes, strengths, color=(16, 185, 129)):
    """Return a copy of the popup image with glowing outline boxes drawn at the given strengths."""
    if not any(strengths): return im
    layer = Image.new('RGBA', im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    for (x, y, w, h), k in zip(boxes, strengths):
        if k <= 0.01: continue
        p = 7
        d.rounded_rectangle([x - p, y - p, x + w + p, y + h + p], 22, fill=color + (int(34 * k),), outline=color + (int(255 * k),), width=4)
    glow = layer.filter(ImageFilter.GaussianBlur(10))
    out = im.copy(); out.alpha_composite(glow); out.alpha_composite(layer); out.putalpha(im.getchannel('A'))
    return out

def _place(f, im, top_src, k, dy_extra=0.0):
    """Draw a popup image so that source row `top_src` sits at the top of the visible band."""
    w, h = int(im.width * POP_SC), int(im.height * POP_SC)
    spr = f32(im.resize((w, h), Image.LANCZOS))
    y = int(BAR + 16 - top_src * POP_SC + dy_extra); x = POP_X - w // 2
    glow = radial(POP_X, y + h * 0.5, 620, (0.02, 0.2, 0.14)) * k
    f += glow
    over(f, spr, k, x, y)

def shot_ui(t):
    """The real popup: Export (ready) -> Paste (receive) -> Restore (restored) with the same facts outlined that the capsule showed."""
    L = PLACED[5]['chunks']
    f = BG5.copy()
    t_rec, t_res = L[1]['at'] - 0.12, L[1]['at'] + 0.85   # paste screen on "Paste", restored on "Restore"
    pop_in = smooth(ramp(t, 33.1, 33.7)); drift = (t - 33) * 5
    rb, vb = UI['readyBoxes'], UI['restoredBoxes']
    a_ready = pop_in * (1 - smooth(ramp(t, t_rec, t_rec + 0.28)))
    if a_ready > 0.003:
        hs = [window(t, L[0]['at'] + 0.1, t_rec + 0.1, 0.3, 0.2), window(t, L[0]['at'] + 0.55, t_rec + 0.1, 0.3, 0.2)]
        _place(f, _highlight(POP['ready'], [rb['size'][0], rb['expiry'][0]], hs), drift * 0.6, a_ready, -drift)
    a_rec = smooth(ramp(t, t_rec, t_rec + 0.28)) * (1 - smooth(ramp(t, t_res, t_res + 0.28)))
    if a_rec > 0.003:
        hs = [window(t, t_rec + 0.15, t_res + 0.1, 0.25, 0.2)]
        _place(f, _highlight(POP['receive'], [UI['receiveBoxes']['origin'][0]], hs), 0, a_rec, -(t - t_rec) * 5)
    a_res = smooth(ramp(t, t_res, t_res + 0.28))
    if a_res > 0.003:
        pan = 330 * ease_io(ramp(t, t_res + 0.7, 38.6))
        rows = [window(t, t_res + 0.2 + 0.22 * i, 41.2, 0.2, 0.4) * (0.55 if t > t_res + 1.6 else 1) for i in range(5)]
        st = window(t, L[2]['at'] + 0.55, 41.2, 0.3, 0.4)
        _place(f, _highlight(POP['restored'], vb['rows'] + vb['status'], rows + [st]), pan, a_res)
    buf = np.zeros_like(f); motes(buf, t, 0.5); f += buf
    return f

def shot_end(t):
    """End card backdrop: the panes still, easing out, behind the HTML end card."""
    u = ease_io(ramp(t, 41.0, 46)); s = lerp(1.25, 1.02, u)
    f = f32(camera(PAN, s, 0.5, 0.5).filter(ImageFilter.GaussianBlur(7))) * 0.36
    f += radial(W / 2, 470, 760, (0.02, 0.2, 0.14)) * 0.7
    buf = np.zeros_like(f); motes(buf, t, 0.8); f += buf
    return f

# ---------- the film ----------
ORDER = [('s1', shot_laptops), ('s2', None), ('s3', shot_panes), ('s4', shot_capsule), ('s5', shot_ui), ('s6', shot_end)]
def fade_in(name, t):
    """Opacity of shot `name` as it crossfades over the previous one."""
    a = SHOTS[name][0]; d = XFADE.get(name, 0)
    return 1.0 if d == 0 else smooth(ramp(t, a - d / 2, a + d / 2))

def gfx(kind, i):
    """Load build/gfx/<kind>_<frame>.png as RGBA floats, or None when this frame has no such graphics."""
    p = os.path.join(B, 'gfx', f'{kind}_{i:04d}.png')
    return f32(load(p, 'RGBA')) if os.path.exists(p) else None

def frame(i):
    """Return frame i as a uint8 RGB array."""
    t = i / FPS
    f = np.zeros((H, W, 3), np.float32)
    for n, (name, fn) in enumerate(ORDER):
        a = fade_in(name, t)
        if a <= 0.001: continue
        if n + 1 < len(ORDER) and fade_in(ORDER[n + 1][0], t) >= 0.999: continue
        if name == 's2':
            g = gfx('s2', i)
            if g is None: continue
            layer = g[..., :3] * g[..., 3:4]
        else:
            layer = fn(t)
        f = f * (1 - a) + layer * a
    ov = gfx('ov', i)
    if ov is not None: over(f, ov, 1.0)
    for th, k in HITS:  # light flashes on the swells
        e = ramp(t, th - 0.10, th) * math.exp(-max(0, t - th) * 3.4) if t >= th - 0.10 else 0
        f += flare(W / 2, H / 2, e * k * 1.5)
    # bloom
    sm = Image.fromarray((np.clip(f - 0.42, 0, 1) * 255).astype(np.uint8)).resize((W // 4, H // 4), Image.BILINEAR).filter(ImageFilter.GaussianBlur(9))
    f += f32(sm.resize((W, H), Image.BILINEAR)) * 0.75
    # grade: soft shoulder, slightly cool shadows
    f = f / (1 + 0.2 * f); f = f * 1.1
    lum = f.mean(axis=2, keepdims=True)
    f += (lum - 0.3) * np.array([-0.02, 0.0, 0.03], np.float32)
    f *= VIGNETTE
    g = GRAIN[i % 6]; g = np.repeat(np.repeat(np.roll(g, (i * 37) % 300, axis=(i % 2)), 2, 0), 2, 1)[..., None]
    f += g * 0.022 * (0.5 + 0.5 * np.sqrt(np.clip(lum, 0, 1)))
    f *= smooth(ramp(t, 0, 1.0)) * (1 - smooth(ramp(t, DUR - 0.9, DUR)))   # fade from / to black
    f[:BAR] = 0; f[H - BAR:] = 0                                              # 2.39:1 letterbox
    for k, ln in enumerate(PLACED):
        sk = window(t, ln['start'] - 0.1, ln['end'] + 0.45, 0.25, 0.35)
        if sk > 0: over(f, SUBS[k], sk * 0.95, 0, H - BAR)
    return (np.clip(f, 0, 1) * 255 + 0.5).astype(np.uint8)

def render(a, b, out):
    """Encode frames [a, b) to out with ffmpeg, exiting non-zero on any failure."""
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
                          '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', out], stdin=subprocess.PIPE)
    try:
        for i in range(a, b): p.stdin.write(frame(i).tobytes())
    finally:
        p.stdin.close()
    if p.wait() != 0: sys.exit('ffmpeg failed for frames %d-%d' % (a, b))

if __name__ == '__main__':
    if len(sys.argv) == 4:
        render(int(sys.argv[1]), int(sys.argv[2]), sys.argv[3])
    elif len(sys.argv) == 3 and sys.argv[1] == 'still':
        Image.fromarray(frame(int(float(sys.argv[2]) * FPS))).save(os.path.join(B, 'still_%s.jpg' % sys.argv[2]), quality=88)
    else:
        n = 4; step = math.ceil(NFRAMES / n)
        procs = [subprocess.Popen([sys.executable, __file__, str(k * step), str(min(NFRAMES, (k + 1) * step)), os.path.join(B, f'part{k}.mp4')]) for k in range(n)]
        if any(p.wait() != 0 for p in procs): sys.exit('a render worker failed')
        with open(os.path.join(B, 'parts.txt'), 'w') as fh: fh.writelines(f"file 'part{k}.mp4'\n" for k in range(n))
        print('rendered', NFRAMES, 'frames')
