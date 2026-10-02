// Acceptance tests for: Playwright storageState export, extra cookie domains (sign-in on a sibling
// site), partitioned cookies, and that the extension still works without the `tabs` permission.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { test, expect, Page } from './fixtures';

const FAST = 'ls=3&ss=3&idb=5&cache=2';
const uniq = () => `v-${Math.random().toString(36).slice(2)}`;

async function mark(site: Page, value: string) {
  await site.evaluate((v) => {
    localStorage.setItem('marker', v);
    document.cookie = `marker=${v}; path=/; max-age=3600`;
  }, value);
}
async function openMore(popup: Page) {
  await popup.getByTestId('more-options').locator('summary').click();
}
async function exportAndCopy(popup: Page): Promise<string> {
  await popup.getByTestId('transfer-session-button').click();
  await expect(popup.getByTestId('transfer-done-button')).toBeVisible({ timeout: 30_000 });
  await popup.getByTestId('copy-package-button').click();
  return popup.evaluate(() => navigator.clipboard.readText());
}
async function importReplace(popup: Page, text: string) {
  await popup.getByTestId('receive-session-button').click();
  await popup.getByTestId('package-textarea').fill(text);
  await popup.getByTestId('inspect-button').click();
  await popup.getByTestId('import-session-button').click();
  await popup.getByTestId('conflict-replace').click();
  await popup.getByTestId('conflict-continue-button').click();
  await expect(popup.getByTestId('verification-status')).toBeVisible({ timeout: 30_000 });
}

test('A. "Export for Playwright" saves a storageState file that a fresh Playwright context can use', async ({ h }) => {
  const a = await h.openPopup(FAST);
  const value = uniq();
  await mark(a.site, value);
  await openMore(a.popup);
  const [download] = await Promise.all([
    a.popup.waitForEvent('download'),
    a.popup.getByTestId('export-state-button').click(),
  ]);
  expect(download.suggestedFilename()).toBe('storageState-127.0.0.1.json');
  const state = JSON.parse(fs.readFileSync((await download.path())!, 'utf8'));
  expect(state.cookies.find((c: any) => c.name === 'marker')).toMatchObject({ value, path: '/', sameSite: expect.stringMatching(/Lax|None|Strict/) });
  expect(state.origins[0].origin).toBe(h.fixture.origin);
  expect(state.origins[0].localStorage).toContainEqual({ name: 'marker', value });
  await expect(a.popup.getByTestId('export-note')).toContainText(/Saved storageState-127\.0\.0\.1\.json: \d+ cookies/);
  await expect(a.popup.getByTestId('export-note')).toContainText('treat it like a password');

  // The real test: Playwright itself loads the file and is logged in.
  const browser = await chromium.launch({ channel: 'chromium', headless: true });
  try {
    const ctx = await browser.newContext({ storageState: (await download.path())! });
    const page = await ctx.newPage();
    await page.goto(`${h.fixture.origin}/?ls=0&ss=0&idb=0&cache=0`);
    expect(await page.evaluate(() => localStorage.getItem('marker'))).toBe(value);
    expect((await ctx.cookies()).find((c) => c.name === 'marker')?.value).toBe(value);
  } finally {
    await browser.close();
  }
});

test('B. extra cookie domains: a sign-in cookie on another host is transferred', async ({ h, b }) => {
  const a = await h.openPopup(FAST);
  const sso = uniq();
  // The page is on 127.0.0.1; the "sign-in site" is localhost.
  await h.context.addCookies([{ name: 'sso', value: sso, domain: 'localhost', path: '/' }]);
  await openMore(a.popup);
  await a.popup.getByTestId('extra-domains-input').fill('localhost');
  const text = await exportAndCopy(a.popup);
  expect(Buffer.from(JSON.parse(text).ciphertext, 'base64').toString()).toContain('"name":"sso"');

  const r = await b.openPopup(FAST);
  await importReplace(r.popup, text);
  await expect(r.popup.getByTestId('verification-status')).toContainText('Passed');
  await expect
    .poll(async () => (await b.context.cookies('http://localhost/')).find((c) => c.name === 'sso')?.value, { timeout: 15_000 })
    .toBe(sso);
});

test('C. without extra domains the other host is NOT included', async ({ h }) => {
  const a = await h.openPopup(FAST);
  await h.context.addCookies([{ name: 'sso', value: 'x', domain: 'localhost', path: '/' }]);
  const text = await exportAndCopy(a.popup);
  expect(Buffer.from(JSON.parse(text).ciphertext, 'base64').toString()).not.toContain('"name":"sso"');
});

test('D. a value that is not a plain host name is refused and nothing is exported', async ({ h }) => {
  const a = await h.openPopup(FAST);
  await openMore(a.popup);
  await a.popup.getByTestId('extra-domains-input').fill('https://evil.test/path, ok.test');
  await expect(a.popup.getByTestId('extra-domains-error')).toContainText('https://evil.test/path');
  await expect(a.popup.getByTestId('transfer-session-button')).toBeDisabled();
  await expect(a.popup.getByTestId('export-state-button')).toBeDisabled();
});

test('E. a partitioned (CHIPS) cookie is transferred with its partition', async ({ h, b }) => {
  const a = await h.openPopup(FAST);
  const url = `${h.fixture.origin}/`;
  await h.sw.evaluate(async (u) => {
    await chrome.cookies.set({ url: u, name: 'part', value: 'p1', secure: true, partitionKey: { topLevelSite: 'http://example.test' } } as any);
  }, url);
  const text = await exportAndCopy(a.popup);
  expect(Buffer.from(JSON.parse(text).ciphertext, 'base64').toString()).toContain('http://example.test');

  const r = await b.openPopup(FAST);
  await importReplace(r.popup, text);
  await expect(r.popup.getByTestId('verification-status')).toContainText('Passed');
  const got = await b.sw.evaluate(async (u) => {
    const all = await chrome.cookies.getAll({ url: u, partitionKey: {} } as any);
    return all.filter((c: any) => c.name === 'part').map((c: any) => ({ v: c.value, top: c.partitionKey?.topLevelSite }));
  }, url);
  expect(got).toEqual([{ v: 'p1', top: 'http://example.test' }]);
});

test('F. the manifest no longer asks for the "tabs" permission, and transfers still work', async ({ h }) => {
  const a = await h.openPopup(FAST);
  const manifest = await a.popup.evaluate(() => chrome.runtime.getManifest());
  expect(manifest.permissions).not.toContain('tabs');
  expect(manifest.permissions).toEqual(expect.arrayContaining(['cookies', 'scripting', 'storage']));
  await expect(a.popup.getByTestId('origin-host')).toContainText('127.0.0.1'); // active tab URL still readable without `tabs`
});
