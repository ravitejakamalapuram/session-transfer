// Live transfer beta: two browser profiles move a session over WebRTC, paired by a local copy
// of the signalling Worker. `h` sends, `b` receives.
import { test, expect } from './fixtures';
import { startSignal } from './signal-server';

test('live transfer moves the session; the server never sees the secret or the package', async ({ h, b }) => {
  const signal = await startSignal();
  try {
    const a = await h.openPopup('ls=3&ss=3&idb=5&cache=2');
    const marker = `marker-${Math.random().toString(36).slice(2)}`;
    await a.site.evaluate((v) => localStorage.setItem('marker', v), marker);

    await a.popup.getByTestId('more-options').locator('summary').click();
    await a.popup.getByTestId('live-send-button').click();
    const codeEl = a.popup.getByTestId('live-code');
    await expect(codeEl).toHaveText(/^[a-z2-7]{6}(-[A-Z2-9]{4}){7}$/, { timeout: 30_000 });
    const liveCode = (await codeEl.textContent())!;
    await expect(a.popup.getByTestId('live-status')).toContainText('Waiting', { timeout: 15_000 });

    const r = await b.openPopup('ls=0&ss=0&idb=0&cache=0');
    await r.popup.getByTestId('receive-session-button').click();
    await r.popup.getByTestId('live-receive').locator('summary').click();
    await r.popup.getByTestId('live-code-input').fill(liveCode);
    await r.popup.getByTestId('live-connect-button').click();
    await expect(r.popup.getByTestId('import-session-button')).toBeVisible({ timeout: 60_000 });
    await expect(a.popup.getByTestId('live-done-button')).toBeVisible({ timeout: 15_000 });

    await r.popup.getByTestId('import-session-button').click();
    const conflict = r.popup.getByTestId('conflict-replace');
    const done = r.popup.getByTestId('verification-status');
    await expect(conflict.or(done)).toBeVisible({ timeout: 30_000 });
    if (await conflict.isVisible()) {
      await conflict.click();
      await r.popup.getByTestId('conflict-continue-button').click();
    }
    await expect(done).toBeVisible({ timeout: 30_000 });
    expect(await r.site.evaluate(() => localStorage.getItem('marker'))).toBe(marker);

    const secret = liveCode.slice(7);
    const seen = signal.requests.join('\n');
    expect(seen).not.toContain(secret);
    expect(seen).not.toContain(secret.replace(/-/g, ''));
    expect(seen).not.toContain(marker);
    expect(signal.requests.filter((x) => x.startsWith('PUT')).length).toBe(2);
  } finally {
    await signal.close();
  }
});
