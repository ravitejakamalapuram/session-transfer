// Send flow (popup -> service worker -> "Ready"). Regression coverage for APP-315 Problem 1:
// the popup stuck forever on "Collecting session..." with no error.
import { test, expect, Page } from './fixtures';

// Counts from the founder's screenshot: cookies 9, LS 31, SS 26, IDB 283, Cache 15.
const FOUNDER = 'ls=31&ss=26&idb=283&cache=15';
// ~84 MB payload (300 x 200 KB IndexedDB records + 15 x 100 KB cache entries). The encrypted
// package is ~112 MB of base64, above the 64 MiB chrome.runtime.Port message limit.
const LARGE = 'ls=31&ss=26&idb=300&idbkb=200&cache=15&cachekb=100';

const READY = (p: Page) => p.getByText('Ready to transfer', { exact: true });
const ERROR = (p: Page) => p.getByTestId('error-message');

async function send(p: Page) {
  await p.getByRole('button', { name: /Transfer Session/ }).click();
}

test('founder-sized session (small) reaches Ready', async ({ h }, info) => {
  const { popup } = await h.openPopup(FOUNDER);
  await send(popup);
  await expect(READY(popup)).toBeVisible({ timeout: 30_000 });
  await popup.screenshot({ path: info.outputPath('small-ready.png') });
});

test('multi-MB session reaches Ready', async ({ h }, info) => {
  const { popup } = await h.openPopup('ls=31&ss=26&idb=250&idbkb=40&cache=10&cachekb=10');
  await send(popup);
  await expect(READY(popup)).toBeVisible({ timeout: 60_000 });
  await popup.screenshot({ path: info.outputPath('multimb-ready.png') });
});

// REPRODUCTION (fails on main): a very large session must end in Ready (download) or in a
// visible error. Today it spins on "Collecting session..." forever: the service worker's
// port.postMessage('collected') throws "Message exceeded maximum allowed size of 64MiB" and
// send() swallows it. See APP-316 for the evidence.
test('very large session never spins forever: Ready or a visible error', async ({ h }, info) => {
  test.setTimeout(240_000);
  const { popup, popupLogs } = await h.openPopup(LARGE);
  await send(popup);
  try {
    await expect(READY(popup).or(ERROR(popup))).toBeVisible({ timeout: 120_000 });
  } finally {
    await popup.screenshot({ path: info.outputPath('large-end-state.png') });
    await info.attach('popup-console.txt', { body: popupLogs.join('\n') || '(empty)' });
    await info.attach('service-worker-console.txt', { body: h.swLogs.join('\n') || '(empty)' });
  }
});
