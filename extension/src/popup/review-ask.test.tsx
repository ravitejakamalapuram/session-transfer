import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { claimReviewAsk } from './review-ask';
import popupSource from './App.tsx?raw';

/** In-memory stand-in for chrome.storage.local. */
function fakeLocal() {
  const data: Record<string, unknown> = {};
  return {
    data,
    get: async (key: string) => (key in data ? { [key]: data[key] } : {}),
    set: async (items: Record<string, unknown>) => void Object.assign(data, items),
  } as unknown as chrome.storage.StorageArea & { data: Record<string, unknown> };
}

describe('review ask', () => {
  it('is granted once, then never again', async () => {
    const area = fakeLocal();
    assert.equal(await claimReviewAsk(area), true);
    assert.equal(await claimReviewAsk(area), false);
    assert.equal(await claimReviewAsk(area), false);
  });

  it('only one of two concurrent claims wins', async () => {
    const area = fakeLocal();
    let tail = Promise.resolve();
    const lock = <T,>(fn: () => Promise<T>) => {
      const run = tail.then(fn);
      tail = run.then(() => undefined, () => undefined);
      return run;
    };
    const wins = await Promise.all([claimReviewAsk(area, lock), claimReviewAsk(area, lock)]);
    assert.deepEqual(wins.sort(), [false, true]);
  });

  it('stays hidden when storage fails', async () => {
    const broken = { get: async () => { throw new Error('no storage'); }, set: async () => undefined };
    assert.equal(await claimReviewAsk(broken as unknown as chrome.storage.StorageArea), false);
  });

  it('is shown only after a passed verification', () => {
    assert.match(popupSource, /\{report\.passed && <ReviewAsk url=\{FEEDBACK_URL\} \/>\}/);
  });
});
