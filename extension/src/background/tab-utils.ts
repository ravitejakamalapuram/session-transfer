// Tab helpers: resolve the active tab and open/await the destination tab.

export function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.origin;
  } catch {
    return null;
  }
}

export async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function waitForComplete(tabId: number, timeoutMs = 20000): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === 'complete') finish();
    };
    chrome.tabs.onUpdated.addListener(listener);
    // Fallback in case the event was missed / page already loaded.
    chrome.tabs.get(tabId).then((t) => { if (t.status === 'complete') finish(); }).catch(() => finish());
    setTimeout(finish, timeoutMs);
  });
}

/**
 * Returns a tab that is on `origin`. Prefers an existing tab; otherwise opens
 * one. Always waits for load completion.
 */
export async function resolveDestinationTab(origin: string): Promise<chrome.tabs.Tab> {
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((t) => t.url && originOf(t.url) === origin);
  if (existing && existing.id != null) {
    await chrome.tabs.update(existing.id, { active: true });
    await waitForComplete(existing.id);
    return existing;
  }
  const created = await chrome.tabs.create({ url: origin + '/', active: true });
  if (created.id != null) await waitForComplete(created.id);
  return created;
}

export async function reloadTab(tabId: number): Promise<void> {
  await chrome.tabs.reload(tabId);
  await waitForComplete(tabId);
}
