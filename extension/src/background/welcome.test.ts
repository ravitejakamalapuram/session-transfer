import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openWelcomeOnInstall } from './welcome';

function stubChrome(): string[] {
  const opened: string[] = [];
  (globalThis as any).chrome = {
    runtime: { getURL: (p: string) => `chrome-extension://id/${p}` },
    tabs: { create: async ({ url }: { url: string }) => { opened.push(url); } },
  };
  return opened;
}

test('opens the welcome page on first install', () => {
  const opened = stubChrome();
  openWelcomeOnInstall({ reason: 'install' } as chrome.runtime.InstalledDetails);
  assert.deepEqual(opened, ['chrome-extension://id/welcome.html']);
});

test('does not open it on update or Chrome update', () => {
  const opened = stubChrome();
  openWelcomeOnInstall({ reason: 'update', previousVersion: '1.3.0' } as chrome.runtime.InstalledDetails);
  openWelcomeOnInstall({ reason: 'chrome_update' } as chrome.runtime.InstalledDetails);
  assert.deepEqual(opened, []);
});
