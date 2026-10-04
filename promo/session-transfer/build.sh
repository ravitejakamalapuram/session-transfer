#!/usr/bin/env bash
# Rebuilds session-transfer-teaser.mp4 (1080p) and the 720p preview from src/.
# Needs: node + Playwright (Chromium; `npm i -g playwright`), python3 with numpy + pillow, ffmpeg. About 10 minutes on 4 cores.
# src/ already holds the AI stills, narration, score and the real-popup screenshots (src/ui_*.png + ui.json).
# To re-shoot the popup from the current extension code, delete src/ui.json first (needs `npm ci` in ../../extension).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p build
[ -f src/ui.json ] || ./shot_ui.sh
node gfx.cjs                      # subtitles + graphics frames (Chromium, real file:// page)
python3 hits.py && python3 mix.py # sub-bass hits, narration cut at silences, ducked score, -15 LUFS
python3 render.py                 # 4 parallel workers; exits non-zero if any fails
ffmpeg -v error -y -f concat -safe 0 -i build/parts.txt -i build/mix.wav -map 0:v -map 1:a -c:v libx264 -preset slow -crf 22 \
  -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart -t 46 session-transfer-teaser.mp4
ffmpeg -v error -y -i session-transfer-teaser.mp4 -vf scale=1280:-2 -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -movflags +faststart session-transfer-teaser-720p.mp4
echo "wrote $(pwd)/session-transfer-teaser.mp4 and session-transfer-teaser-720p.mp4"
