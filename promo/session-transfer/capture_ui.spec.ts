// Shoots the REAL built popup (extension/dist) for the teaser: home, ready, restored.
// Run: ./shot_ui.sh   Output: src/ui_{home,ready,restored}.png (popup at 2.6x CSS zoom) and src/ui.json (live numbers).
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '../../extension/e2e/fixtures';
import { test, expect, Harness } from '../../extension/e2e/fixtures';

const OUT = path.resolve(import.meta.dirname, 'src');
const SITE = 'https://app.example.com';
const SEED = 'ls=18&ss=4&idb=120&cache=6';
const ZOOM = 2.6;

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

/** Freeze motion, pin the countdown to 5:00, zoom the popup so text stays crisp when the film pushes in. */
async function steady(popup: Page) {
  await popup.addStyleTag({ content: `.footer .lock:last-child{display:none} *{animation:none!important;transition:none!important} #root{zoom:${ZOOM}}` });
  await popup.evaluate(() => {
    const fix = () => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const t = n.nodeValue ?? '';
        const f = t.replace(/\d\d?:\d\d ?[AP]M/g, '10:05 AM').replace(/(^|[^\d:])\d:\d\d(?![\d:])/g, (_m, p) => p + '5:00').replace(/expires in [\dms ]+/g, 'expires in 5m');
        if (f !== t) n.nodeValue = f;
      }
    };
    const mo = new MutationObserver(() => { mo.disconnect(); fix(); mo.observe(document.body, { subtree: true, childList: true, characterData: true }); });
    fix();
    mo.observe(document.body, { subtree: true, childList: true, characterData: true });
  });
}

test('shoot the real popup for the teaser', async ({ h, b }) => {
  await underFixedHost(h.fixture.origin, h);
  await underFixedHost(h.fixture.origin, b);
  h.fixture.origin = SITE;
  const shoot = async (popup: Page, name: string) => {
    const el = popup.locator('#root');
    const box = await el.boundingBox();
    await el.screenshot({ path: path.join(OUT, `ui_${name}.png`), animations: 'disabled' });
    return box;
  };
  /** Boxes of elements, in pixels of the #root screenshot, so the film can outline them. */
  const boxes = async (popup: Page, sel: Record<string, string>) => {
    const root = (await popup.locator('#root').boundingBox())!;
    const out: Record<string, number[][]> = {};
    for (const [k, q] of Object.entries(sel)) {
      out[k] = [];
      for (const l of await popup.locator(q).all()) { const b = (await l.boundingBox())!; out[k].push([b.x - root.x, b.y - root.y, b.width, b.height].map(Math.round)); }
    }
    return out;
  };
  const txt = async (popup: Page, id: string) => (await popup.getByTestId(id).innerText()).replace(/\s+/g, ' ').trim();
  const info: Record<string, unknown> = { site: SITE };

  const a = await h.openPopup(SEED);
  await a.popup.setViewportSize({ width: 380 * 3, height: 1500 });
  await steady(a.popup);
  await expect(a.popup.getByTestId('origin-card')).toBeVisible();
  info.originCard = await txt(a.popup, 'origin-card');
  info.detectCounts = await txt(a.popup, 'detect-counts').catch(() => '');
  await shoot(a.popup, 'home');

  await a.popup.getByTestId('transfer-session-button').click();
  await expect(a.popup.getByTestId('transfer-done-button')).toBeVisible({ timeout: 30_000 });
  await a.popup.getByTestId('copy-package-button').click();
  const text = await a.popup.evaluate(() => navigator.clipboard.readText());
  info.ready = await a.popup.locator('#root').innerText();
  info.packageChars = text.length;
  await shoot(a.popup, 'ready');
  info.readyBoxes = await boxes(a.popup, { size: '.hint >> nth=0', expiry: '[data-testid=expiry-countdown]', copy: '[data-testid=copy-package-button]', badge: '[data-testid=session-badge]' });

  const r = await b.openPopup(SEED);
  await r.popup.setViewportSize({ width: 380 * 3, height: 1500 });
  await steady(r.popup);
  await r.popup.getByTestId('receive-session-button').click();
  await r.popup.getByTestId('package-textarea').fill(text);
  await r.popup.getByTestId('inspect-button').click();
  await expect(r.popup.getByTestId('import-session-button')).toBeVisible({ timeout: 30_000 });
  await shoot(r.popup, 'receive');
  info.receiveBoxes = await boxes(r.popup, { counts: '[data-testid=inspect-counts]', origin: '[data-testid=inspect-origin]', importBtn: '[data-testid=import-session-button]' });
  info.inspect = await r.popup.locator('#root').innerText();
  await r.popup.getByTestId('import-session-button').click();
  await r.popup.getByTestId('conflict-replace').click();
  await r.popup.getByTestId('conflict-continue-button').click();
  await expect(r.popup.getByTestId('verification-status')).toContainText('Passed', { timeout: 30_000 });
  info.restored = await r.popup.locator('#root').innerText();
  await shoot(r.popup, 'restored');
  info.restoredBoxes = await boxes(r.popup, { rows: '[data-testid^=verify-]', status: '[data-testid=verification-status]', report: '[data-testid=verification-report]' });
  fs.writeFileSync(path.join(OUT, 'ui.json'), JSON.stringify(info, null, 2));
});
