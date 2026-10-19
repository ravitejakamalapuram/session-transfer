import { useEffect, useRef, useState } from 'react';

// After a verified restore, ask once ever for a store review. Only a local flag in
// chrome.storage.local records that it was asked: no tracking, no network.
const ASKED_KEY = 'reviewAsk.asked';

type LocalArea = Pick<chrome.storage.StorageArea, 'get' | 'set'>;
const local = (): LocalArea => chrome.storage.local;

type Lock = <T>(fn: () => Promise<T>) => Promise<T>;
// A Web Lock spans every page of the extension, so two restore screens cannot both claim it.
const webLock: Lock = <T,>(fn: () => Promise<T>) => {
  const locks = globalThis.navigator?.locks;
  return locks ? (locks.request(ASKED_KEY, fn) as Promise<T>) : fn();
};

/** True the first time only: marks the ask as used before answering, so it never shows twice. */
export async function claimReviewAsk(area: LocalArea = local(), lock: Lock = webLock): Promise<boolean> {
  try {
    return await lock(async () => {
      if ((await area.get(ASKED_KEY))[ASKED_KEY] === true) return false;
      await area.set({ [ASKED_KEY]: true });
      return true;
    });
  } catch {
    return false;
  }
}

export function ReviewAsk({ url, area }: { url: string; area?: LocalArea }) {
  const [show, setShow] = useState(false);
  // StrictMode runs this effect twice in development; reuse the first claim so the second
  // setup does not see the flag it just set and hide the prompt.
  const claim = useRef<{ area?: LocalArea; result: Promise<boolean> }>();
  useEffect(() => {
    let live = true;
    if (!claim.current || claim.current.area !== area) claim.current = { area, result: claimReviewAsk(area) };
    claim.current.result.then((v) => live && setShow(v));
    return () => {
      live = false;
    };
  }, [area]);
  if (!show) return null;
  return (
    <div className="callout info" data-testid="review-ask">
      Did it work? A short review helps other testers find Session Transfer.{' '}
      <a
        className="link-btn"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="review-ask-rate"
        onClick={() => setShow(false)}
      >
        Rate it
      </a>{' '}
      ·{' '}
      <button className="link-btn" data-testid="review-ask-dismiss" onClick={() => setShow(false)}>
        Not now
      </button>
    </div>
  );
}
