// APP-326: a package over the 64 MiB port limit must reach the Import screen on the receiver.
import { test, expect } from './fixtures';

test.setTimeout(300_000);

test('large (>64 MiB) .stpkg file loads in the receiver and reaches Import', async ({ h, b }) => {
  const a = await h.openPopup('ls=31&ss=26&idb=300&idbkb=120&cache=15&cachekb=100');
  await a.popup.getByTestId('transfer-session-button').click();
  await expect(a.popup.getByTestId('transfer-done-button')).toBeVisible({ timeout: 120_000 });
  const [download] = await Promise.all([
    a.popup.waitForEvent('download'),
    a.popup.getByTestId('download-package-button').click(),
  ]);
  const file = await download.path();
  expect((await import('node:fs')).statSync(file).size).toBeGreaterThan(64 * 1024 * 1024);

  await b.openPopup('ls=3&ss=3&idb=5&cache=2');
  const tab = await b.context.newPage();
  await tab.goto(`chrome-extension://${b.extId}/index.html#receive`);
  await tab.getByTestId('package-file-input').setInputFiles(file);
  await expect(tab.getByTestId('package-loaded-large')).toBeVisible({ timeout: 60_000 });
  await tab.getByTestId('inspect-button').click();
  await expect(tab.getByTestId('import-session-button')).toBeVisible({ timeout: 120_000 });
});
