// QA-only (APP-320): real two-profile round trip. NOT committed.
import { test, expect, chromium, BrowserContext, Page } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { startFixture } from './fixture-server';

const EXT = path.resolve(import.meta.dirname, '../dist');
const EV = process.env.EV_DIR!;
const SMALL = 'ls=31&ss=26&idb=283&cache=15';
const LARGE = 'ls=31&ss=26&idb=300&idbkb=200&cache=15&cachekb=100';
const EMPTY = 'ls=0&ss=0&idb=0&cache=0';

async function profile(tag: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `st-qa-${tag}-`));
  const ctx = await chromium.launchPersistentContext(dir, {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
  return { ctx, extId: new URL(sw.url()).host, dir };
}
async function siteAndPopup(ctx: BrowserContext, extId: string, url: string, hash = '') {
  const site = await ctx.newPage();
  await site.goto(url);
  await site.waitForFunction(() => document.title === 'ready', null, { timeout: 120_000 });
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${extId}/index.html${hash}`);
  await site.bringToFront();
  await popup.reload();
  return { site, popup };
}
async function sendAndDownload(popup: Page, tag: string, timeout: number) {
  await popup.getByRole('button', { name: /Transfer Session/ }).click();
  await expect(popup.getByText('Ready to transfer', { exact: true })).toBeVisible({ timeout });
  const code = (await popup.getByTestId('transfer-code').innerText()).trim();
  const expiry = await popup.getByTestId('expiry-countdown').innerText();
  await popup.screenshot({ path: path.join(EV, `${tag}-A-ready.png`) });
  const [dl] = await Promise.all([popup.waitForEvent('download'), popup.getByTestId('download-package-button').click()]);
  const file = path.join(EV, `${tag}.stpkg`);
  await dl.saveAs(file);
  return { code, expiry, file, size: fs.statSync(file).size };
}
async function receive(ctx: BrowserContext, extId: string, origin: string, tag: string, file: string, code: string) {
  const { site, popup } = await siteAndPopup(ctx, extId, `${origin}/?${EMPTY}`, '#receive');
  await popup.getByTestId('package-file-input').setInputFiles(file);
  await popup.getByTestId('code-input').fill(code);
  await popup.getByTestId('inspect-button').click();
  return { site, popup };
}
async function counts(p: Page) {
  return p.evaluate(async () => {
    const idb = await new Promise<number>((res) => {
      const r = indexedDB.open('fixture');
      r.onsuccess = () => { const db = r.result; if (!db.objectStoreNames.contains('rows')) { db.close(); return res(0); }
        const c = db.transaction('rows').objectStore('rows').count(); c.onsuccess = () => { db.close(); res(c.result); }; };
      r.onerror = () => res(-1);
    });
    const keys = await caches.keys(); let cache = 0;
    if (keys.includes('fixture-cache')) cache = (await (await caches.open('fixture-cache')).keys()).length;
    return { ls: Object.keys(localStorage).filter(k => /^ls\d+$/.test(k)).length, ss: Object.keys(sessionStorage).filter(k => /^ss\d+$/.test(k)).length, idb, cache, cookies: document.cookie.split(';').filter(c => c.trim()).length };
  });
}

for (const [tag, q, tmo] of [['small', SMALL, 60_000], ['large', LARGE, 200_000]] as const) {
  test(`round trip ${tag} (download -> import)`, async () => {
    test.setTimeout(600_000);
    const fx = await startFixture();
    const A = await profile('A'), B = await profile('B');
    try {
      const { popup } = await siteAndPopup(A.ctx, A.extId, `${fx.origin}/?${q}`);
      const sent = await sendAndDownload(popup, tag, tmo);
      console.log(`[${tag}] file bytes=${sent.size} code=${sent.code} ${sent.expiry}`);
      const { popup: rp, site } = await receive(B.ctx, B.extId, fx.origin, tag, sent.file, sent.code);
      await expect(rp.getByTestId('inspect-origin')).toBeVisible({ timeout: 120_000 });
      await rp.screenshot({ path: path.join(EV, `${tag}-B-inspect.png`) });
      console.log(`[${tag}] inspect: ` + (await rp.getByTestId('inspect-counts').innerText()).replace(/\n/g, ' '));
      await rp.getByTestId('import-session-button').click();
      // optional conflict/mismatch prompts
      const done = rp.getByTestId('verification-status');
      for (let i = 0; i < 60 && !(await done.isVisible()); i++) {
        if (await rp.getByTestId('conflict-options').isVisible()) { await rp.getByRole('button', { name: /Continue|Import|Replace/ }).first().click(); }
        else if (await rp.getByTestId('mismatch-continue').isVisible()) await rp.getByTestId('mismatch-continue').click();
        await rp.waitForTimeout(2000);
      }
      await expect(done).toBeVisible({ timeout: 10_000 });
      await rp.screenshot({ path: path.join(EV, `${tag}-B-restored.png`) });
      console.log(`[${tag}] verification: ${await done.innerText()}`);
      await site.reload(); await site.waitForFunction(() => document.title === 'ready').catch(() => {});
      console.log(`[${tag}] B counts after restore: ` + JSON.stringify(await counts(site)));
      // note: page's own seed script (on reload) is run with EMPTY so counts reflect restored data
    } finally { await A.ctx.close(); await B.ctx.close(); await fx.close(); }
  });
}

test('wrong code refused', async () => {
  const fx = await startFixture(); const A = await profile('A'), B = await profile('B');
  try {
    const { popup } = await siteAndPopup(A.ctx, A.extId, `${fx.origin}/?${SMALL}`);
    const sent = await sendAndDownload(popup, 'wrong', 60_000);
    const wrong = 'ABC7-K9P2-WXYZ';
    const { popup: rp } = await receive(B.ctx, B.extId, fx.origin, 'wrong', sent.file, wrong);
    await expect(rp.getByTestId('error-message')).toBeVisible({ timeout: 30_000 });
    console.log('[wrong] error: ' + (await rp.getByTestId('error-message').innerText()));
    await rp.screenshot({ path: path.join(EV, 'wrong-code-B.png') });
  } finally { await A.ctx.close(); await B.ctx.close(); await fx.close(); }
});

test('copy/paste path', async () => {
  const fx = await startFixture(); const A = await profile('A'), B = await profile('B');
  try {
    await A.ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `chrome-extension://${A.extId}` });
    const { popup } = await siteAndPopup(A.ctx, A.extId, `${fx.origin}/?${SMALL}`);
    await popup.getByRole('button', { name: /Transfer Session/ }).click();
    await expect(popup.getByText('Ready to transfer', { exact: true })).toBeVisible({ timeout: 60_000 });
    await popup.getByTestId('copy-package-button').click();
    const pkg = await popup.evaluate(() => navigator.clipboard.readText());
    await popup.getByTestId('copy-code-button').click();
    const code = await popup.evaluate(() => navigator.clipboard.readText());
    console.log(`[paste] pkg len=${pkg.length} code=${code} status=${await popup.getByTestId('package-status').innerText()}/${await popup.getByTestId('code-status').innerText()}`);
    const { popup: rp, site } = await siteAndPopup(B.ctx, B.extId, `${fx.origin}/?${EMPTY}`, '#receive');
    await rp.getByTestId('package-textarea').fill(pkg);
    await rp.getByTestId('code-input').fill(code);
    await rp.getByTestId('inspect-button').click();
    await expect(rp.getByTestId('inspect-origin')).toBeVisible({ timeout: 30_000 });
    await rp.getByTestId('import-session-button').click();
    const done = rp.getByTestId('verification-status');
    for (let i = 0; i < 30 && !(await done.isVisible()); i++) {
      if (await rp.getByTestId('conflict-options').isVisible()) await rp.getByRole('button', { name: /Continue|Import|Replace/ }).first().click();
      await rp.waitForTimeout(1000);
    }
    await expect(done).toBeVisible();
    await rp.screenshot({ path: path.join(EV, 'paste-B-restored.png') });
    console.log('[paste] verification: ' + (await done.innerText()));
    await site.reload(); await site.waitForTimeout(3000);
    console.log('[paste] B counts: ' + JSON.stringify(await counts(site)));
  } finally { await A.ctx.close(); await B.ctx.close(); await fx.close(); }
});

test('expired package refused (5 min TTL)', async () => {
  test.setTimeout(420_000);
  const fx = await startFixture(); const A = await profile('A'), B = await profile('B');
  try {
    const { popup } = await siteAndPopup(A.ctx, A.extId, `${fx.origin}/?${SMALL}`);
    const sent = await sendAndDownload(popup, 'expired', 60_000);
    await popup.waitForTimeout(5 * 60_000 + 5_000);
    await expect(popup.getByTestId('expiry-countdown')).toContainText('Expired');
    await popup.screenshot({ path: path.join(EV, 'expired-A.png') });
    const { popup: rp } = await receive(B.ctx, B.extId, fx.origin, 'expired', sent.file, sent.code);
    await expect(rp.getByTestId('error-message')).toBeVisible({ timeout: 30_000 });
    console.log('[expired] error: ' + (await rp.getByTestId('error-message').innerText()));
    await rp.screenshot({ path: path.join(EV, 'expired-B.png') });
  } finally { await A.ctx.close(); await B.ctx.close(); await fx.close(); }
});
