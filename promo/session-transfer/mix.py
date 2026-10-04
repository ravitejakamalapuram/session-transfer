"""Audio: cut the narration at its silences, slow ~7%, place each chunk on its shot, duck the score under the voice,
add the sub-bass hits, normalise to ~-15 LUFS -> build/mix.wav. Fails loudly if ffmpeg fails."""
import os, subprocess, sys
from plan import PLACED, TEMPO, DUR

HERE = os.path.dirname(os.path.abspath(__file__)); B = os.path.join(HERE, 'build')
fc, labels = '', []
for li, ln in enumerate(PLACED):
    for ci, c in enumerate(ln['chunks']):
        a, b = c['src']; k = f'v{li}_{ci}'; ms = int(round(c['at'] * 1000))
        fc += (f"[1:a]atrim={a}:{b},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,"
               f"afade=t=in:d=0.04,afade=t=out:st={round(b - a - 0.06, 3)}:d=0.06,atempo={TEMPO},adelay={ms}|{ms}[{k}];")
        labels.append(k)
fc += ''.join(f'[{k}]' for k in labels) + f"amix=inputs={len(labels)}:normalize=0,highpass=f=75,equalizer=f=180:t=q:w=1:g=2,"
fc += "acompressor=threshold=0.12:ratio=3:attack=5:release=120,aecho=0.85:0.9:45|95:0.16|0.09,volume=2.2,asplit[vo][vosc];"
fc += "[0:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.9[mus];[mus][vosc]sidechaincompress=threshold=0.04:ratio=5:attack=25:release=450[duck];"
fc += f"[2:a]volume=1.0[hit];[duck][vo][hit]amix=inputs=3:normalize=0,afade=t=out:st={DUR - 1.4}:d=1.4,loudnorm=I=-15:TP=-1.5:LRA=11[out]"
cmd = ['ffmpeg', '-v', 'error', '-y', '-i', os.path.join(HERE, 'src/score.mp3'), '-i', os.path.join(HERE, 'src/vo.mp3'),
       '-i', os.path.join(B, 'hits.wav'), '-filter_complex', fc, '-map', '[out]', '-ar', '48000', '-t', str(DUR), os.path.join(B, 'mix.wav')]
if subprocess.run(cmd).returncode != 0: sys.exit('audio mix failed')
print('wrote build/mix.wav')
