// Renders the film's typographic/vector layers with Chromium from a real file:// page (fonts load; text is shaped by the browser):
//   build/subs/sub_N.png  subtitle for each narration line (transparent, sits in the lower letterbox bar)
//   build/gfx/s2_NNNN.png the login-wall shot (opaque), build/gfx/ov_NNNN.png overlays for the other shots (transparent)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const B = path.join(__dirname, 'build');
// optional range for quick iteration: node gfx.cjs T0 T1 (seconds) re-renders only those frames
const RANGE = process.argv.length > 3 ? [+process.argv[2], +process.argv[3]] : null;
for (const d of RANGE ? ['subs'] : ['subs', 'gfx']) { fs.rmSync(path.join(B, d), { recursive: true, force: true }); fs.mkdirSync(path.join(B, d), { recursive: true }); }
fs.mkdirSync(path.join(B, 'gfx'), { recursive: true });
const P = JSON.parse(execFileSync('python3', ['plan.py'], { cwd: __dirname }).toString());
fs.writeFileSync(path.join(B, 'plan.json'), JSON.stringify(P));
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: P.W, height: P.H } });
  page.on('pageerror', e => { console.error('pageerror', e.message); process.exitCode = 1; });
  await page.goto('file://' + path.join(__dirname, 'gfx.html'));
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(p => Object.assign(P, p), P);
  for (const [k, ln] of P.LINES.entries()) {
    await page.evaluate(t => window.drawSub(t), ln.text);
    await page.screenshot({ path: path.join(B, 'subs', `sub_${k}.png`), omitBackground: true, clip: { x: 0, y: 0, width: P.W, height: P.BAR } });
  }
  let n = 0;
  for (let i = 0; i < P.DUR * P.FPS; i++) {
    const t = i / P.FPS;
    if (RANGE && (t < RANGE[0] || t >= RANGE[1])) continue;
    for (const kind of ['s2', 'ov']) {
      if (await page.evaluate(([t, kind]) => window.draw(t, kind), [t, kind])) {
        await page.screenshot({ path: path.join(B, 'gfx', `${kind}_${String(i).padStart(4, '0')}.png`), omitBackground: true }); n++;
      }
    }
  }
  await browser.close();
  console.log('gfx frames', n);
})().catch(e => { console.error(e); process.exit(1); });
