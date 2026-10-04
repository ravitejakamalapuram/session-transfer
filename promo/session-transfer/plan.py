"""Single source of truth for the teaser's timeline: shots, narration chunks, subtitles, sound hits.
`python3 plan.py` prints plan.json for gfx.cjs; render.py, mix.py and hits.py import it."""
import json

W, H, FPS, DUR, BAR = 1920, 1080, 24, 46.0, 138
TEMPO = 0.93  # narration is slowed ~7%

# shot -> (start, end) in film seconds; neighbours crossfade around the boundary
SHOTS = {'s1': (0, 5.5), 's2': (5.5, 12.2), 's3': (12.2, 18.4), 's4': (18.4, 32.9), 's5': (32.9, 41.4), 's6': (41.4, 46.0)}
XFADE = {'s2': 0.6, 's3': 0.25, 's4': 0.7, 's5': 0.5, 's6': 0.8}  # fade-in length at each shot's start

# Light flashes + sub-bass hits: (time, strength). Aligned with the score's swells (see README).
HITS = [(13.0, 0.55), (20.0, 0.35), (33.25, 0.7), (41.5, 0.3)]

# narration: text, anchor (film second where the line starts), chunks (source start, source end, gap before in film s).
# Source times are mid-silence cut points found with ffmpeg silencedetect on src/vo.mp3.
LINES = [
    dict(text='Your session lives in one browser.', anchor=0.8, chunks=[(0.00, 2.40, 0)]),
    dict(text='Move to another, and you start over. Sign in. Clear MFA. Again.', anchor=5.5,
         chunks=[(3.60, 4.72, 0), (5.48, 6.58, 0.45), (7.22, 8.03, 0.30), (8.58, 9.72, 0.28), (10.15, 10.85, 0.28)]),
    dict(text='Session Transfer moves the session itself.', anchor=13.05, chunks=[(11.80, 14.47, 0)]),
    dict(text='Cookies, storage, IndexedDB, cache. Packed once, bound to one site.', anchor=18.9,
         chunks=[(14.82, 18.20, 0), (18.64, 21.15, 0.30)]),
    dict(text='Plain by default. Add a transfer code to lock it. Packages older than five minutes are refused.', anchor=26.0,
         chunks=[(21.67, 22.78, 0), (23.08, 25.02, 0.25), (25.55, 28.30, 0.30)]),
    dict(text='Export. Paste. Restore. Then checked, right in the popup.', anchor=33.3,
         chunks=[(28.88, 29.60, 0), (29.90, 31.40, 0.25), (31.90, 33.90, 0.30)]),
    dict(text='Session Transfer. Local. No servers.', anchor=41.2,
         chunks=[(34.62, 35.90, 0), (36.32, 36.93, 0.25), (37.30, 38.27, 0.25)]),
]

def place():
    """Fill in film-time start/end for every chunk and each line."""
    out = []
    for ln in LINES:
        t = ln['anchor']; ch = []
        for (a, b, gap) in ln['chunks']:
            t += gap; d = (b - a) / TEMPO
            ch.append(dict(src=(a, b), at=round(t, 3), end=round(t + d, 3))); t += d
        out.append(dict(text=ln['text'], start=ch[0]['at'], end=ch[-1]['end'], chunks=ch))
    return out

PLACED = place()

def plan():
    return dict(W=W, H=H, FPS=FPS, DUR=DUR, BAR=BAR, SHOTS=SHOTS, HITS=HITS, LINES=PLACED)

if __name__ == '__main__':
    print(json.dumps(plan(), indent=1))
