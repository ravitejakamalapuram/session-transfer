# Session Transfer: cinematic teaser

`session-transfer-teaser-720p.mp4` is a 46-second promo for the extension, English narration with English subtitles, 2.39:1.
Two laptops (one signed in) → the login wall you hit in a new browser → the title over two glass panes joined by light →
a sealed package with the five kinds of state, the optional transfer code and the 5-minute expiry → the **real popup**
(Export, Paste, Restore, "Verification: Passed") → end card.

Nothing here ships: `release.yaml` packages only `extension/dist`.

## What is real, what is generated

- `src/ui_*.png`, `src/ui.json`: screenshots of the real built popup, shot by `capture_ui.spec.ts` against a fixed
  `app.example.com`. The numbers in the film's capsule (9 cookies, 18 localStorage, 4 sessionStorage, 1 IndexedDB, 1 cache,
  52.7 KB, 5:00) are what that popup showed.
- `src/laptops.jpg`, `panes.jpg`, `capsule.jpg`: three stills from Seedream 5 Lite (ElevenLabs), 212 credits each.
- `src/vo.mp3`: one narration take (`eleven_v3`, voice "Warm, Grounded Storyteller", 499 credits).
- `src/score.mp3`: one 46 s score (`eleven_music_v2_5`, 900 credits).
- Everything that moves is code: camera moves, dust, flashes, bloom, grain, vignette (`render.py`); the login wall, chips,
  clock, step rail, title and end card are HTML rendered by Chromium (`gfx.html`, `gfx.cjs`).

## Claims on screen (checked against `product-facts.yaml`)

"Plain by default" and "Transfer code on · AES-256-GCM" (encryption is opt-in), "older than five minutes are refused",
"No servers" (the store tile's own line), the popup's own passkey/WebAuthn note. Not used: "free", "one-time code",
"self-destructs", "you'll be logged in", any Web Store availability claim.

## Rebuild

`./build.sh` makes `session-transfer-teaser.mp4` (1080p, not committed) and the 720p preview. It needs Node with `playwright`
resolvable (`npm i -g playwright`), Python with numpy and pillow, and ffmpeg; about 10 minutes on 4 cores.
To re-shoot the popup, delete `src/ui.json` and run `npm ci` in `../../extension` first (`shot_ui.sh` builds the extension and
runs the capture). Timing lives in `plan.py` (shots, narration chunks cut at silences, flash/hit times); change it there.

| file | job |
|------|-----|
| `plan.py` | timeline: shots, narration chunks, flash and sub-bass times |
| `capture_ui.spec.ts`, `shot_ui.sh`, `playwright.config.cjs` | real-popup screenshots + element boxes |
| `gfx.html`, `gfx.cjs` | HTML graphics and subtitles → PNG frames |
| `render.py` | stills + graphics + real UI → frames (4 workers) |
| `hits.py`, `mix.py` | sub-bass hits; narration cut, slowed 7%, ducked score, -15 LUFS |
| `sheet.py` | contact sheet of key moments for layout checks (`python3 sheet.py 13.1 20.5 ...`) |
