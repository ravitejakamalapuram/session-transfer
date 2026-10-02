// Optional transfer code (APP-315 Problem 2 / APP-317 plan §6). Two separate browser profiles:
// `h` sends, `b` receives. The fixture site is the same origin for both.
import { test, expect, Page } from './fixtures';

const SETTING = 'settings.requireTransferCode';
const READY = 'transfer-done-button'; // present on both Ready screens
const FAST = 'ls=3&ss=3&idb=5&cache=2';
const MARKER = () => `marker-${Math.random().toString(36).slice(2)}`;

/** Puts a unique value in the sender's localStorage and a cookie, to prove it arrives. */
async function mark(site: Page, value: string) {
  await site.evaluate((v) => {
    localStorage.setItem('marker', v);
    document.cookie = `marker=${v}; path=/; max-age=3600`;
  }, value);
}
const lsMarker = (site: Page) => site.evaluate(() => localStorage.getItem('marker'));
const cookieMarker = async (b: { context: import('@playwright/test').BrowserContext }, origin: string) =>
  (await b.context.cookies(origin)).find((c) => c.name === 'marker')?.value ?? null;

async function exportSession(popup: Page) {
  await popup.getByTestId('transfer-session-button').click();
  await expect(popup.getByTestId(READY)).toBeVisible({ timeout: 30_000 });
}
const clipboard = (popup: Page) => popup.evaluate(() => navigator.clipboard.readText());

/** Receiver: Receive Session -> paste -> Continue. */
async function pasteAndContinue(popup: Page, text: string) {
  await popup.getByTestId('receive-session-button').click();
  await popup.getByTestId('package-textarea').fill(text);
  await popup.getByTestId('inspect-button').click();
}
/** Import; if the destination already has data, replace it (the fixture always seeds some). */
async function importIt(popup: Page) {
  await popup.getByTestId('import-session-button').click();
  const conflict = popup.getByTestId('conflict-replace');
  const done = popup.getByTestId('verification-status');
  await expect(conflict.or(done)).toBeVisible({ timeout: 30_000 });
  if (await conflict.isVisible()) {
    await conflict.click();
    await popup.getByTestId('conflict-continue-button').click();
  }
  await expect(done).toBeVisible({ timeout: 30_000 });
}

test('1. setting is OFF by default; export is one step with the warning and no code', async ({ h }) => {
  const { popup } = await h.openPopup(FAST);
  await expect(popup.getByTestId('require-code-checkbox')).not.toBeChecked();
  expect(await popup.evaluate((k) => chrome.storage.local.get(k), SETTING)).toEqual({});
  await exportSession(popup);
  await expect(popup.getByTestId('embedded-warning')).toContainText(/Anyone with this text can restore your session until \d\d?:\d\d/);
  await expect(popup.getByTestId('transfer-code')).toHaveCount(0);
  await expect(popup.getByTestId('copy-package-button')).toBeVisible();
  await expect(popup.getByTestId('download-package-button')).toBeVisible();
});

test('2. code OFF: copy text -> receiver sees no code field -> session restored', async ({ h, b }) => {
  const a = await h.openPopup(FAST);
  const value = MARKER();
  await mark(a.site, value);
  await exportSession(a.popup);
  await a.popup.getByTestId('copy-package-button').click();
  const text = await clipboard(a.popup);
  expect(JSON.parse(text)).toMatchObject({ version: 2, keyMode: 'none' });

  const r = await b.openPopup(FAST);
  // verifier: the receiver does NOT have the sender's data before the import
  expect(await lsMarker(r.site)).toBeNull();
  expect(await cookieMarker(b, h.fixture.origin)).toBeNull();

  await pasteAndContinue(r.popup, text);
  await expect(r.popup.getByTestId('import-session-button')).toBeVisible({ timeout: 30_000 });
  await expect(r.popup.getByTestId('code-input')).toHaveCount(0);
  await importIt(r.popup);
  await expect.poll(() => lsMarker(r.site), { timeout: 15_000 }).toBe(value);
  expect(await cookieMarker(b, h.fixture.origin)).toBe(value);
});

test('3. code OFF: download file -> load the file in the receiver -> session restored', async ({ h, b }) => {
  const a = await h.openPopup(FAST);
  const value = MARKER();
  await mark(a.site, value);
  await exportSession(a.popup);
  const [download] = await Promise.all([
    a.popup.waitForEvent('download'),
    a.popup.getByTestId('download-package-button').click(),
  ]);
  const file = await download.path();
  expect(download.suggestedFilename()).toMatch(/\.stpkg$/);

  const r = await b.openPopup(FAST);
  expect(await lsMarker(r.site)).toBeNull();
  // File loading happens in a full tab (the popup closes when the file picker opens).
  const tab = await b.context.newPage();
  await tab.goto(`chrome-extension://${b.extId}/index.html#receive`);
  await tab.getByTestId('package-file-input').setInputFiles(file);
  await expect(tab.getByTestId('package-textarea')).not.toBeEmpty();
  await r.site.bringToFront();
  await tab.getByTestId('inspect-button').click();
  await expect(tab.getByTestId('import-session-button')).toBeVisible({ timeout: 30_000 });
  await expect(tab.getByTestId('code-input')).toHaveCount(0);
  await importIt(tab);
  await expect.poll(() => lsMarker(r.site), { timeout: 15_000 }).toBe(value);
});

test('4. code ON: setting persists, two-step screen, code asked, wrong code writes nothing, right code restores', async ({ h, b }) => {
  const a = await h.openPopup(FAST);
  await a.popup.getByTestId('require-code-checkbox').check();
  await a.site.bringToFront();
  await a.popup.reload();
  await expect(a.popup.getByTestId('require-code-checkbox')).toBeChecked(); // survives reopening
  expect(await a.popup.evaluate((k) => chrome.storage.local.get(k), SETTING)).toEqual({ [SETTING]: true });

  const value = MARKER();
  await mark(a.site, value);
  await exportSession(a.popup);
  await expect(a.popup.getByTestId('need-both')).toBeVisible();
  const code = (await a.popup.getByTestId('transfer-code').innerText()).trim();
  expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await a.popup.getByTestId('copy-package-button').click();
  const text = await clipboard(a.popup);
  expect(JSON.parse(text)).toMatchObject({ version: 2, keyMode: 'code' });
  expect(JSON.parse(text).key).toBeUndefined();

  const r = await b.openPopup(FAST);
  expect(await lsMarker(r.site)).toBeNull();
  await pasteAndContinue(r.popup, text);
  await expect(r.popup.getByTestId('code-input')).toBeVisible({ timeout: 30_000 }); // code asked
  await expect(r.popup.getByTestId('import-session-button')).toHaveCount(0);

  await r.popup.getByTestId('code-input').fill('AAAA-AAAA-AAAA');
  await r.popup.getByTestId('inspect-button').click();
  await expect(r.popup.getByTestId('error-message')).toContainText('Incorrect code');
  expect(await lsMarker(r.site)).toBeNull();
  expect(await cookieMarker(b, h.fixture.origin)).toBeNull();

  await r.popup.getByTestId('error-back').click();
  await pasteAndContinue(r.popup, text);
  await r.popup.getByTestId('code-input').fill(code);
  await r.popup.getByTestId('inspect-button').click();
  await expect(r.popup.getByTestId('import-session-button')).toBeVisible({ timeout: 30_000 });
  await importIt(r.popup);
  await expect.poll(() => lsMarker(r.site), { timeout: 15_000 }).toBe(value);
  expect(await cookieMarker(b, h.fixture.origin)).toBe(value);
});

for (const requireCode of [false, true]) {
  test(`5. an expired package is refused with a clear message and nothing is written (code ${requireCode ? 'ON' : 'OFF'})`, async ({ h, b }) => {
    const a = await h.openPopup(FAST);
    if (requireCode) {
      await a.popup.getByTestId('require-code-checkbox').check();
      await a.site.bringToFront();
      await a.popup.reload();
    }
    await mark(a.site, MARKER());
    await exportSession(a.popup);
    await a.popup.getByTestId('copy-package-button').click();
    const pkg = JSON.parse(await clipboard(a.popup));
    expect(pkg.keyMode).toBe(requireCode ? 'code' : 'none');
    // A real package, moved into the past (expiry is checked before anything is decrypted).
    pkg.createdAt -= 10 * 60_000;
    pkg.expiresAt -= 10 * 60_000;

    const r = await b.openPopup(FAST);
    await pasteAndContinue(r.popup, JSON.stringify(pkg));
    // refused at the first step, before a code is even asked for
    await expect(r.popup.getByTestId('error-message')).toContainText('This transfer has expired.');
    await expect(r.popup.getByTestId('code-input')).toHaveCount(0);
    expect(await lsMarker(r.site)).toBeNull();
    expect(await cookieMarker(b, h.fixture.origin)).toBeNull();
  });
}

test('6. Done clears the clipboard after a copy', async ({ h }) => {
  const a = await h.openPopup(FAST);
  await exportSession(a.popup);
  await expect(a.popup.getByTestId('transfer-done-button')).toHaveText('Done'); // nothing copied yet
  await a.popup.getByTestId('copy-package-button').click();
  expect((await clipboard(a.popup)).length).toBeGreaterThan(100); // verifier: it did hold the package
  await expect(a.popup.getByTestId('transfer-done-button')).toHaveText('Done (clears clipboard)');
  await a.popup.getByTestId('transfer-done-button').click();
  await expect(a.popup.getByTestId('transfer-session-button')).toBeVisible(); // back on Home
  expect(await clipboard(a.popup)).toBe('');
});
