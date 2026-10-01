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

// APP-315 reproduction: the encrypted package of a very large session is above the 64 MiB
// port message limit. It used to spin on "Collecting session..." forever; it must now reach
// Ready (the package is streamed in chunks).
test('very large session reaches Ready', async ({ h }, info) => {
  test.setTimeout(240_000);
  const { popup, popupLogs } = await h.openPopup(LARGE);
  await send(popup);
  try {
    await expect(READY(popup)).toBeVisible({ timeout: 150_000 });
    await expect(popup.getByTestId('download-package-button')).toBeVisible();
  } finally {
    await popup.screenshot({ path: info.outputPath('large-end-state.png') });
    await info.attach('popup-console.txt', { body: popupLogs.join('\n') || '(empty)' });
    await info.attach('service-worker-console.txt', { body: h.swLogs.join('\n') || '(empty)' });
  }
});

test('progress shows on the same screen as the button (no separate Collecting screen)', async ({ h }) => {
  const { popup } = await h.openPopup('ls=31&ss=26&idb=250&idbkb=40&cache=10&cachekb=10');
  await send(popup);
  await expect(popup.getByTestId('transfer-session-button')).toBeDisabled();
  await expect(popup.getByTestId('transfer-session-button')).toContainText('Collecting session');
  await expect(popup.getByTestId('collect-progress')).toBeVisible();
  await expect(popup.getByTestId('origin-card')).toBeVisible(); // still the Home screen
  await expect(READY(popup)).toBeVisible({ timeout: 60_000 });
});

// Fault injection happens in the popup page only (no test hooks in product code): the first
// collect port either answers with an error or never answers; the retry uses the real worker.
async function breakFirstCollect(popup: Page, mode: 'error' | 'silent') {
  await popup.addInitScript((m) => {
    const real = chrome.runtime.connect.bind(chrome.runtime);
    let broken = false;
    // Scale the first 3-minute collect timeout down to 1 s (the retry keeps the real one).
    const st = window.setTimeout.bind(window);
    let scaled = false;
    (window as any).setTimeout = (fn: TimerHandler, ms?: number, ...a: unknown[]) => {
      const short = !scaled && ms != null && ms >= 60_000;
      if (short) scaled = true;
      return st(fn, short ? 1000 : ms, ...a);
    };
    (chrome.runtime as any).connect = (info: chrome.runtime.ConnectInfo) => {
      const port = real(info);
      const post = port.postMessage.bind(port);
      port.postMessage = (msg: any) => {
        if (msg?.type === 'collect' && !broken) {
          broken = true;
          if (m === 'error') {
            setTimeout(() => (port as any).onMessage.dispatch({ type: 'error', message: 'Injected failure.' }), 50);
          }
          return; // never forwarded to the worker
        }
        post(msg);
      };
      return port;
    };
  }, mode);
}

for (const mode of ['error', 'silent'] as const) {
  test(`${mode === 'error' ? 'an error' : 'a timeout'} shows a message and Retry reaches Ready`, async ({ h }) => {
    const { popup, site } = await h.openPopup(FOUNDER);
    await breakFirstCollect(popup, mode);
    await site.bringToFront();
    await popup.reload();
    await send(popup);
    await expect(ERROR(popup)).toBeVisible({ timeout: 15_000 });
    if (mode === 'error') await expect(ERROR(popup)).toContainText('Injected failure.');
    else await expect(ERROR(popup)).toContainText('took too long');
    await popup.getByTestId('error-retry').click();
    await expect(READY(popup)).toBeVisible({ timeout: 30_000 });
  });
}
