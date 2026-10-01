import { test as base, chromium, BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { startFixture, Fixture } from './fixture-server';

const EXT = path.resolve(import.meta.dirname, '../dist');

export interface Harness {
  context: BrowserContext;
  extId: string;
  sw: Worker;
  swLogs: string[];
  fixture: Fixture;
  /** Opens the fixture page (seeded) and returns a popup page that sees it as the active tab. */
  openPopup(query?: string): Promise<{ site: Page; popup: Page; popupLogs: string[] }>;
}

/** Launches Chromium with the built extension in a fresh profile, against the given fixture site. */
async function launch(fixture: Fixture): Promise<{ h: Harness; dispose(): Promise<void> }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-e2e-'));
  const context = await chromium.launchPersistentContext(dir, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const swLogs: string[] = [];
  sw.on('console', (m) => swLogs.push(`[sw] ${m.type()}: ${m.text()}`));
  const extId = new URL(sw.url()).host;
  // Copy / "Done clears the clipboard" use navigator.clipboard from the popup page.
  await context.grantPermissions(['clipboard-read', 'clipboard-write']); // extension origins cannot be named here
  const h: Harness = {
    context, extId, sw, swLogs, fixture,
    async openPopup(query = '') {
      const site = await context.newPage();
      await site.goto(`${fixture.origin}/?${query}`);
      await site.waitForFunction(() => document.title === 'ready', null, { timeout: 120_000 });
      const popup = await context.newPage();
      const popupLogs: string[] = [];
      popup.on('console', (m) => popupLogs.push(`[popup] ${m.type()}: ${m.text()}`));
      popup.on('pageerror', (e) => popupLogs.push(`[popup] pageerror: ${e.message}`));
      await popup.goto(`chrome-extension://${extId}/index.html`);
      // The popup page is itself a tab here; make the site the active tab and reload so detect sees it.
      await site.bringToFront();
      await popup.reload();
      return { site, popup, popupLogs };
    },
  };
  return {
    h,
    dispose: async () => {
      await context.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

export const test = base.extend<{ h: Harness; b: Harness }>({
  h: async ({}, use) => {
    const fixture = await startFixture();
    const { h, dispose } = await launch(fixture);
    await use(h);
    await dispose();
    await fixture.close();
  },
  // A second browser profile (separate user-data dir) on the same fixture origin: the receiver.
  b: async ({ h }, use) => {
    const { h: b, dispose } = await launch(h.fixture);
    await use(b);
    await dispose();
  },
});
export { expect } from '@playwright/test';
