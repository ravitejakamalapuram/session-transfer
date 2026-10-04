// Regenerates the Chrome Web Store screenshots from the real popup:
//   STORE_ASSETS=1 npx playwright test e2e/store-shots.spec.ts
// Skipped in normal runs. Output: extension/store-assets/screenshot-{home,transfer,receive,restored}.png
// (1280x800, no alpha, as the store requires). The listing text comes from chrome-store/store.config.json.
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, Harness } from './fixtures';

test.skip(!process.env.STORE_ASSETS, 'set STORE_ASSETS=1 to regenerate the store screenshots');

const OUT = path.resolve(import.meta.dirname, '../store-assets');
const ICON = fs.readFileSync(path.resolve(import.meta.dirname, '../icons/icon128.png')).toString('base64');
const SITE = 'https://app.example.com'; // fixed host so the pictures do not change from run to run
const SEED = 'ls=18&ss=4&idb=120&cache=6';

// Plain mode only: the transfer code is random, so it would change every run.
const SHOTS = {
  home: { eyebrow: 'STEP 1 · PICK A SITE', title: 'Open the site.<br>Press <em>Transfer</em>.', text: 'See what will move before anything leaves the browser: cookies, localStorage, sessionStorage, IndexedDB and Cache Storage.' },
  transfer: { eyebrow: 'STEP 2 · COPY THE PACKAGE', title: 'Copy it.<br>Lock it if you <em>want</em>.', text: 'Plain by default, so treat it like a password. Turn on "Encrypt with a transfer code" for AES-256-GCM. Packages older than 5 minutes are refused.' },
  receive: { eyebrow: 'STEP 3 · ON THE OTHER BROWSER', title: 'Paste it.<br>Check <em>what moves</em>.', text: 'A package can only be restored into its own website. You see the counts, then choose Replace, Merge or Cancel.' },
  restored: { eyebrow: 'DONE · CHECKED', title: 'Restored.<br><em>Then checked.</em>', text: 'After restoring, the extension reads the values back and reports what matched and what did not.' },
} as const;

/** Serve the local fixture under a fixed https host, cookies included. */
async function underFixedHost(real: string, h: Harness) {
  await h.context.route(`${SITE}/**`, async (route) => {
    const u = new URL(route.request().url());
    const res = await fetch(real + u.pathname + u.search);
    const headers: Record<string, string> = { 'content-type': res.headers.get('content-type') ?? 'text/html' };
    const cookies = res.headers.getSetCookie();
    if (cookies.length) headers['set-cookie'] = cookies.join('\n');
    await route.fulfill({ status: res.status, headers, body: Buffer.from(await res.arrayBuffer()) });
  });
}

/** Hide what changes per run (version footer, times, countdowns) and keep it hidden across re-renders. */
async function steady(popup: Page) {
  await popup.addStyleTag({ content: '.footer .lock:last-child{display:none} *{animation:none!important;transition:none!important}' });
  await popup.evaluate(() => {
    const fix = () => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const t = n.nodeValue ?? '';
        const f = t
          .replace(/\d\d?:\d\d ?[AP]M/g, '10:05 AM')
          .replace(/(^|[^\d:])\d:\d\d(?![\d:])/g, (_m, p) => p + '5:00')
          .replace(/expires in [\dms ]+/g, 'expires in 5m')
          .replace(/Created [^·]*·/, 'Created just now ·');
        if (f !== t) n.nodeValue = f;
      }
    };
    const mo = new MutationObserver(() => { mo.disconnect(); fix(); mo.observe(document.body, { subtree: true, childList: true, characterData: true }); });
    fix();
    mo.observe(document.body, { subtree: true, childList: true, characterData: true });
  });
}

async function frame(page: Page, name: keyof typeof SHOTS, popupPng: Buffer) {
  const s = SHOTS[name];
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{width:1280px;height:800px;overflow:hidden;background:#080b11;color:#f3f4f6;font-family:"Liberation Sans",system-ui,sans-serif}
    .stage{width:1280px;height:800px;position:relative;background:radial-gradient(900px 420px at 78% -5%,rgba(16,185,129,.13),transparent 60%),radial-gradient(700px 380px at -5% 108%,rgba(34,211,238,.09),transparent 55%),#080b11}
    .brand{position:absolute;top:46px;left:64px;display:flex;align-items:center;gap:12px;font:800 19px ui-monospace,"Liberation Mono",monospace}
    .brand img{width:34px;height:34px;border-radius:9px}
    .cap{position:absolute;left:64px;top:200px;width:480px}
    .eyebrow{font:700 12px ui-monospace,"Liberation Mono",monospace;letter-spacing:.18em;color:#10b981}
    h1{font:800 42px/1.12 ui-monospace,"Liberation Mono",monospace;margin-top:14px;letter-spacing:-.5px}
    h1 em{font-style:normal;color:#10b981}
    p{margin-top:18px;font-size:16px;line-height:1.6;color:#9ca3af}
    .shot{position:absolute;right:96px;top:50%;transform:translateY(-50%);border-radius:14px;border:1px solid rgba(16,185,129,.5);box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 50px rgba(16,185,129,.12);max-height:700px}
  </style><div class="stage">
    <div class="brand"><img src="data:image/png;base64,${ICON}">Session Transfer</div>
    <div class="cap"><div class="eyebrow">${s.eyebrow}</div><h1>${s.title}</h1><p>${s.text}</p></div>
    <img class="shot" src="data:image/png;base64,${popupPng.toString('base64')}">
  </div>`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  await page.screenshot({ path: path.join(OUT, `screenshot-${name}.png`), omitBackground: false });
}

test('regenerate the four store screenshots from the real popup', async ({ h, b }) => {
  test.setTimeout(180_000);
  await underFixedHost(h.fixture.origin, h);
  await underFixedHost(h.fixture.origin, b);
  h.fixture.origin = SITE; // h and b share this object; openPopup reads it

  const stage = await h.context.newPage();
  const png = {} as Record<keyof typeof SHOTS, Buffer>;
  const shoot = async (popup: Page) => popup.locator('#root').screenshot({ animations: 'disabled' });

  const a = await h.openPopup(SEED);
  await steady(a.popup);
  await expect(a.popup.getByTestId('origin-card')).toBeVisible();
  png.home = await shoot(a.popup);

  await a.popup.getByTestId('transfer-session-button').click();
  await expect(a.popup.getByTestId('transfer-done-button')).toBeVisible({ timeout: 30_000 });
  await a.popup.getByTestId('copy-package-button').click();
  const text = await a.popup.evaluate(() => navigator.clipboard.readText());
  png.transfer = await shoot(a.popup);

  const r = await b.openPopup(SEED);
  await steady(r.popup);
  await r.popup.getByTestId('receive-session-button').click();
  await r.popup.getByTestId('package-textarea').fill(text);
  await r.popup.getByTestId('inspect-button').click();
  await expect(r.popup.getByTestId('import-session-button')).toBeVisible({ timeout: 30_000 });
  png.receive = await shoot(r.popup);

  await r.popup.getByTestId('import-session-button').click();
  await r.popup.getByTestId('conflict-replace').click();
  await r.popup.getByTestId('conflict-continue-button').click();
  await expect(r.popup.getByTestId('verification-status')).toContainText('Passed', { timeout: 30_000 });
  png.restored = await shoot(r.popup);

  for (const name of Object.keys(SHOTS) as (keyof typeof SHOTS)[]) await frame(stage, name, png[name]);
});
