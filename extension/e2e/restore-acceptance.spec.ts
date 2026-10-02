// Acceptance tests for the 1.3.0 behaviour: plain-by-default packages, honest verification,
// safe Replace/Merge, IndexedDB robustness, no backups. `h` sends, `b` receives (separate profiles).
import { test, expect, Page } from './fixtures';

const READY = 'transfer-done-button';
const FAST = 'ls=3&ss=3&idb=5&cache=2';
const SETTING = 'settings.requireTransferCode';
const uniq = () => `marker-${Math.random().toString(36).slice(2)}`;

async function mark(site: Page, value: string) {
  await site.evaluate((v) => {
    localStorage.setItem('marker', v);
    document.cookie = `marker=${v}; path=/; max-age=3600`;
  }, value);
}
const ls = (site: Page, key: string) => site.evaluate((k) => localStorage.getItem(k), key);
const cookie = async (b: { context: import('@playwright/test').BrowserContext }, origin: string, name: string) =>
  (await b.context.cookies(origin)).find((c) => c.name === name)?.value ?? null;

async function exportAndCopy(popup: Page): Promise<string> {
  await popup.getByTestId('transfer-session-button').click();
  await expect(popup.getByTestId(READY)).toBeVisible({ timeout: 30_000 });
  await popup.getByTestId('copy-package-button').click();
  return popup.evaluate(() => navigator.clipboard.readText());
}
async function receive(popup: Page, text: string) {
  await popup.getByTestId('receive-session-button').click();
  await popup.getByTestId('package-textarea').fill(text);
  await popup.getByTestId('inspect-button').click();
  await expect(popup.getByTestId('import-session-button')).toBeVisible({ timeout: 30_000 });
}
/** Import and pick a conflict strategy (the fixture always seeds the destination). */
async function importWith(popup: Page, strategy: 'replace' | 'merge') {
  await popup.getByTestId('import-session-button').click();
  await popup.getByTestId(`conflict-${strategy}`).click();
  await popup.getByTestId('conflict-continue-button').click();
  await expect(popup.getByTestId('verification-status')).toBeVisible({ timeout: 30_000 });
}

test('A. default package is plain: no encryption, readable payload, no code, full round trip, verification passes', async ({ h, b }) => {
  const a = await h.openPopup(FAST);
  const value = uniq();
  await mark(a.site, value);
  const text = await exportAndCopy(a.popup);
  const pkg = JSON.parse(text);
  expect(pkg).toMatchObject({ version: 2, keyMode: 'none', alg: 'none' });
  expect(Buffer.from(pkg.ciphertext, 'base64').toString()).toContain(value); // plain, as documented

  const r = await b.openPopup(FAST);
  await receive(r.popup, text);
  await expect(r.popup.getByTestId('code-input')).toHaveCount(0);
  await importWith(r.popup, 'replace');
  await expect(r.popup.getByTestId('verification-status')).toContainText('Passed');
  await expect.poll(() => ls(r.site, 'marker'), { timeout: 15_000 }).toBe(value);
  expect(await cookie(b, h.fixture.origin, 'marker')).toBe(value);
});

test('B. the toggle is "Encrypt with a transfer code"; ON hides the payload and shows the code', async ({ h, b }) => {
  const a = await h.openPopup(FAST);
  const toggle = a.popup.getByTestId('require-code-checkbox');
  await expect(a.popup.getByTestId('require-code-toggle')).toContainText('Encrypt with a transfer code');
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  expect((await a.popup.evaluate((k) => chrome.storage.local.get(k), SETTING))[SETTING]).toBe(true);

  const value = uniq();
  await mark(a.site, value);
  const text = await exportAndCopy(a.popup);
  const pkg = JSON.parse(text);
  expect(pkg).toMatchObject({ keyMode: 'code', alg: 'AES-256-GCM', iterations: 600000 });
  expect(text).not.toContain(value);
  const code = (await a.popup.getByTestId('transfer-code').innerText()).trim();
  expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

  const r = await b.openPopup(FAST);
  await r.popup.getByTestId('receive-session-button').click();
  await r.popup.getByTestId('package-textarea').fill(text);
  await r.popup.getByTestId('inspect-button').click();
  await r.popup.getByTestId('code-input').fill(code);
  await r.popup.getByTestId('inspect-button').click();
  await expect(r.popup.getByTestId('import-session-button')).toBeVisible({ timeout: 30_000 });
  await importWith(r.popup, 'replace');
  await expect.poll(() => ls(r.site, 'marker'), { timeout: 15_000 }).toBe(value);
});

test('C. Replace removes stale destination data and keeps the imported data', async ({ h, b }) => {
  const a = await h.openPopup(FAST);
  const value = uniq();
  await mark(a.site, value);
  const text = await exportAndCopy(a.popup);

  const r = await b.openPopup(FAST);
  await r.site.evaluate(() => { localStorage.setItem('stale', 'old'); sessionStorage.setItem('stale', 'old'); });
  await receive(r.popup, text);
  await importWith(r.popup, 'replace');
  await expect.poll(() => ls(r.site, 'marker'), { timeout: 15_000 }).toBe(value);
  expect(await ls(r.site, 'stale')).toBeNull();
  expect(await r.site.evaluate(() => sessionStorage.getItem('stale'))).toBeNull();
});

test('D. Merge keeps destination-only data and the report is not inflated by it', async ({ h, b }) => {
  const a = await h.openPopup(FAST);
  const value = uniq();
  await mark(a.site, value);
  const text = await exportAndCopy(a.popup); // sender localStorage: ls0..2 + marker = 4 keys

  const r = await b.openPopup(FAST);
  await r.site.evaluate(() => { localStorage.setItem('dest-only', 'keep'); localStorage.setItem('extra2', 'keep'); });
  await receive(r.popup, text);
  await importWith(r.popup, 'merge');
  await expect.poll(() => ls(r.site, 'marker'), { timeout: 15_000 }).toBe(value);
  expect(await ls(r.site, 'dest-only')).toBe('keep');
  // 4 sent, 4 matched. The two extra destination keys must not push "actual" above "expected".
  await expect(r.popup.getByTestId('verify-localStorage')).toContainText('4 / 4');
  await expect(r.popup.getByTestId('verification-status')).toContainText('Passed');
});

test('E. a circular IndexedDB record no longer aborts the capture; all databases arrive', async ({ h, b }) => {
  const a = await h.openPopup(FAST);
  await a.site.evaluate(async () => {
    await new Promise<void>((res, rej) => {
      const open = indexedDB.open('cyclic', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('rows', { keyPath: 'id' });
      open.onsuccess = () => {
        const tx = open.result.transaction('rows', 'readwrite');
        const o: any = { id: 1 };
        o.self = o; // structured clone allows cycles
        tx.objectStore('rows').put(o);
        tx.oncomplete = () => { open.result.close(); res(); };
        tx.onerror = () => rej(tx.error);
      };
    });
  });
  const text = await exportAndCopy(a.popup);

  const r = await b.openPopup(FAST);
  await receive(r.popup, text);
  await importWith(r.popup, 'replace');
  await expect(r.popup.getByTestId('verify-indexedDB')).toContainText('2 / 2'); // fixture + cyclic
  const names = await r.site.evaluate(async () => (await indexedDB.databases()).map((d) => d.name).sort());
  expect(names).toEqual(['cyclic', 'fixture']);
});

test('F. a Secure cookie on a localhost origin is restored', async ({ h, b }) => {
  const a = await h.openPopup(FAST);
  await h.context.addCookies([{ name: 'sec', value: 'secure-val', url: h.fixture.origin, secure: true }]);
  const text = await exportAndCopy(a.popup);

  const r = await b.openPopup(FAST);
  await receive(r.popup, text);
  await importWith(r.popup, 'replace');
  await expect.poll(() => cookie(b, h.fixture.origin, 'sec'), { timeout: 15_000 }).toBe('secure-val');
});

test('G. no backup option anywhere: Replace has no backup toggle and the report never mentions a backup', async ({ h, b }) => {
  const a = await h.openPopup(FAST);
  const text = await exportAndCopy(a.popup);
  const r = await b.openPopup(FAST);
  await receive(r.popup, text);
  await r.popup.getByTestId('import-session-button').click();
  await r.popup.getByTestId('conflict-replace').click();
  await expect(r.popup.getByTestId('backup-toggle')).toHaveCount(0);
  await expect(r.popup.getByTestId('conflict-continue-button')).toHaveText('Continue');
  await r.popup.getByTestId('conflict-continue-button').click();
  await expect(r.popup.getByTestId('verification-status')).not.toContainText('backed up');
});

test('H. a tampered plain package is still refused when its origin is changed', async ({ h, b }) => {
  const a = await h.openPopup(FAST);
  const pkg = JSON.parse(await exportAndCopy(a.popup));
  pkg.origin = 'https://evil.test';
  const r = await b.openPopup(FAST);
  await r.popup.getByTestId('receive-session-button').click();
  await r.popup.getByTestId('package-textarea').fill(JSON.stringify(pkg));
  await r.popup.getByTestId('inspect-button').click();
  await expect(r.popup.getByTestId('error-message')).toContainText('Origin integrity');
  expect(await ls(r.site, 'marker')).toBeNull();
});
