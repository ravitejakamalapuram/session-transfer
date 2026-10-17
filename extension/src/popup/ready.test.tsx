import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  clearReadyResult,
  Collected,
  collectionWarning,
  countdown,
  loadReadyResult,
  needsDoneGuard,
  Ready,
  ReadyResult,
  Saved,
  saveReadyResult,
} from './ready';
import { TransferComponentResult } from '../core/types';
import popupSource from './App.tsx?raw';
import readySource from './ready.tsx?raw';

/** In-memory stand-in for chrome.storage.session. */
function fakeSession() {
  const data: Record<string, unknown> = {};
  return {
    data,
    get: async (key: string) => (key in data ? { [key]: data[key] } : {}),
    set: async (items: Record<string, unknown>) => void Object.assign(data, items),
    remove: async (key: string) => void delete data[key],
  } as unknown as chrome.storage.StorageArea & { data: Record<string, unknown> };
}

const NOW = 1_800_000_000_000;

function collected(expiresAt = Date.now() + 5 * 60_000, code: string | null = 'ABC7-K9P2-WXYZ'): Collected {
  return {
    pkg: {
      origin: 'https://github.com',
      expiresAt,
      createdAt: NOW,
      ciphertext: 'CIPHERTEXT',
    } as unknown as Collected['pkg'],
    code,
    results: [{ component: 'cookies', status: 'success', itemCount: 3 }],
    unsupported: [],
    sizeBytes: 43_008,
  };
}

const noop = () => undefined;

function renderReady(saved: Saved, opts: { guard?: boolean; expiresAt?: number; code?: string | null } = {}) {
  return renderToStaticMarkup(
    <Ready
      collected={collected(opts.expiresAt, opts.code)}
      saved={saved}
      guard={opts.guard ?? false}
      showDetails={false}
      setShowDetails={noop}
      copied={null}
      onCopyCode={noop}
      onCopyPackage={noop}
      onDownload={noop}
      onDone={noop}
      onGoBack={noop}
      onLeave={noop}
      onExpired={noop}
    />,
  );
}

describe('Ready screen states', () => {
  it('nothing saved: both steps shown, numbered, unchecked, with the BOTH warning and a countdown', () => {
    const html = renderReady({ package: false, code: false });
    assert.ok(html.includes('① Session package'));
    assert.ok(html.includes('② Transfer code'));
    assert.ok(html.indexOf('① Session package') < html.indexOf('② Transfer code'));
    assert.ok(html.includes('ABC7-K9P2-WXYZ'));
    assert.match(html, /You need <b>BOTH<\/b>.*Neither works alone/);
    assert.match(html, /Expires in [45]:\d\d/);
    assert.ok(html.includes('not saved'));
    assert.ok(html.includes('not copied'));
    assert.ok(!html.includes('✓ saved'));
    assert.ok(!html.includes('✓ copied'));
  });

  it('package saved: step ① is checked, step ② is not', () => {
    const html = renderReady({ package: true, code: false });
    assert.ok(html.includes('✓ saved'));
    assert.ok(html.includes('not copied'));
    assert.ok(html.includes('class="step done" data-testid="step-package"'));
    assert.ok(html.includes('class="step " data-testid="step-code"'));
  });

  it('both saved: both steps checked', () => {
    const html = renderReady({ package: true, code: true });
    assert.ok(html.includes('✓ saved'));
    assert.ok(html.includes('✓ copied'));
    assert.ok(html.includes('class="step done" data-testid="step-code"'));
  });

  it('has no control that copies the package and the code together (two-channel)', () => {
    const html = renderReady({ package: false, code: false });
    const testids = [...html.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1]);
    const buttons = testids.filter((t) => t.endsWith('-button'));
    assert.deepEqual(
      buttons.sort(),
      ['copy-code-button', 'copy-package-button', 'download-package-button', 'transfer-done-button'].sort(),
    );
  });

  it('shows Expired and disables the actions once the package has expired', () => {
    const html = renderReady({ package: false, code: false }, { expiresAt: Date.now() - 1 });
    assert.ok(html.includes('Expired. Start a new transfer.'));
    assert.match(html, /disabled="" data-testid="copy-code-button"/);
  });
});

describe('Ready screen, default mode (key inside the package, no code)', () => {
  const html = (saved: Saved = { package: false, code: false }) => renderReady(saved, { code: null });

  it('is one step: Copy and Download file, no code, no BOTH warning', () => {
    const h = html();
    assert.ok(h.includes('Session ready'));
    assert.ok(!h.includes('transfer-code'));
    assert.ok(!h.includes('Transfer code'));
    assert.ok(!h.includes('BOTH'));
    const buttons = [...h.matchAll(/data-testid="([^"]+-button)"/g)].map((m) => m[1]).sort();
    assert.deepEqual(buttons, ['copy-package-button', 'download-package-button', 'transfer-done-button']);
  });

  it('always shows the holder warning with an expiry time', () => {
    const h = html();
    assert.match(h, /data-testid="embedded-warning"/);
    assert.match(h, /Anyone with this text can restore your session until \d\d?:\d\d/);
    assert.ok(h.includes('Delete the downloaded file after you import it.'));
  });

  it('Done says it clears the clipboard only after something was copied', () => {
    assert.ok(html().includes('>Done<'));
    assert.ok(html({ package: true, code: false, copied: true }).includes('Done (clears clipboard)'));
  });

  it('code mode still shows the two-step screen', () => {
    const h = renderReady({ package: false, code: false });
    assert.ok(h.includes('② Transfer code'));
    assert.ok(!h.includes('embedded-warning'));
  });
});

describe('Done guard', () => {
  it('guards Done until the package is saved, whether or not the code was copied', () => {
    assert.equal(needsDoneGuard({ package: false, code: false }), true);
    assert.equal(needsDoneGuard({ package: false, code: true }), true);
    assert.equal(needsDoneGuard({ package: true, code: false }), false);
    assert.equal(needsDoneGuard({ package: true, code: true }), false);
  });

  it('renders Go back and Leave instead of Done while the guard is open', () => {
    const html = renderReady({ package: false, code: true }, { guard: true });
    assert.ok(html.includes("You haven&#x27;t saved the package"));
    assert.ok(html.includes('data-testid="done-guard-back"'));
    assert.ok(html.includes('data-testid="done-guard-leave"'));
    assert.ok(!html.includes('data-testid="transfer-done-button"'));
  });
});

describe('Ready result kept across popup close (chrome.storage.session)', () => {
  const result = (expiresAt: number): ReadyResult => ({
    collected: collected(expiresAt),
    saved: { package: true, code: false },
  });

  it('reopen within the expiry window returns the same code and saved state', async () => {
    const area = fakeSession();
    await saveReadyResult(result(NOW + 5 * 60_000), area);
    const reopened = await loadReadyResult(area, NOW + 4 * 60_000);
    assert.equal(reopened?.collected.code, 'ABC7-K9P2-WXYZ');
    assert.deepEqual(reopened?.saved, { package: true, code: false });
  });

  it('after expiry the stored result is gone, not just hidden', async () => {
    const area = fakeSession();
    await saveReadyResult(result(NOW + 5 * 60_000), area);
    assert.equal(await loadReadyResult(area, NOW + 5 * 60_000), null);
    assert.ok(!('readyResult' in area.data));
  });

  it('after Done the stored result is gone', async () => {
    const area = fakeSession();
    await saveReadyResult(result(NOW + 5 * 60_000), area);
    await clearReadyResult(area);
    assert.ok(!('readyResult' in area.data));
    assert.equal(await loadReadyResult(area, NOW), null);
  });
});

describe('collection warning', () => {
  const ok = (component: TransferComponentResult['component'], itemCount = 0): TransferComponentResult => ({ component, status: 'success', itemCount });

  it('no warning when every area was read and something was found', () => {
    assert.equal(collectionWarning([ok('cookies', 4), ok('localStorage'), { component: 'cacheStorage', status: 'unsupported' }]), null);
  });

  it('names failed and partial areas', () => {
    const w = collectionWarning([
      { component: 'cookies', status: 'failed', itemCount: 0 },
      ok('localStorage', 2),
      { component: 'indexedDB', status: 'partial', itemCount: 5 },
    ]);
    assert.equal(w, "Couldn't read Cookies. Only part of IndexedDB was copied. The session may not work fully on the other browser.");
  });

  it('says so when nothing was found', () => {
    assert.match(collectionWarning([ok('cookies'), ok('localStorage')])!, /Nothing was found/);
  });

  it('Ready shows the warning icon and text instead of the green check', () => {
    const c = collected();
    c.results = [{ component: 'cookies', status: 'failed', itemCount: 0 }];
    const html = renderToStaticMarkup(
      <Ready collected={c} saved={{ package: false, code: false }} guard={false} showDetails={false} setShowDetails={noop} copied={null}
        onCopyCode={noop} onCopyPackage={noop} onDownload={noop} onDone={noop} onGoBack={noop} onLeave={noop} onExpired={noop} />,
    );
    assert.ok(html.includes('big-check warn'));
    assert.ok(html.includes("Couldn&#x27;t read Cookies."));
    assert.ok(!renderReady({ package: false, code: false }).includes('collect-warning'));
  });
});

describe('countdown', () => {
  it('formats m:ss and never goes negative', () => {
    assert.equal(countdown(300_000), '5:00');
    assert.equal(countdown(61_500), '1:02');
    assert.equal(countdown(9_000), '0:09');
    assert.equal(countdown(-5), '0:00');
  });
});

describe('popup copy', () => {
  // docs/product-facts.yaml transfer_code: nothing marks a code as used, so it is not "one-time".
  it('never calls the transfer code "one-time"', () => {
    assert.doesNotMatch(popupSource + readySource, /one-time/i);
  });
});
