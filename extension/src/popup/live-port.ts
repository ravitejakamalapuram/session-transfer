import { LIVE_PORT_NAME, LiveRequest, LiveResponse } from '../core/messages';

const OFFSCREEN_URL = 'offscreen.html';

async function ensureOffscreen(): Promise<void> {
  const url = chrome.runtime.getURL(OFFSCREEN_URL);
  const existing = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT], documentUrls: [url] });
  if (existing.length) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.WEB_RTC],
    justification: 'Holds the WebRTC connection for live transfer while the popup is closed.',
  });
}

/**
 * Starts a live send or receive in the offscreen document. Returns a disconnect function; pass
 * `cancel` to also stop the transfer (otherwise a send keeps going after the popup closes).
 * `shouldStart` is checked after the offscreen document is ready, so a cancelled attempt never connects.
 */
export async function runLive(
  request: LiveRequest,
  onMessage: (msg: LiveResponse) => void,
  shouldStart: () => boolean = () => true,
): Promise<(cancel?: boolean) => void> {
  await ensureOffscreen();
  if (!shouldStart()) return () => undefined;
  const port = chrome.runtime.connect({ name: LIVE_PORT_NAME });
  port.onMessage.addListener(onMessage);
  port.postMessage(request);
  let connected = true;
  return (cancel = false) => {
    if (!connected) return;
    connected = false;
    port.onMessage.removeListener(onMessage);
    if (!cancel) return port.disconnect();
    // Disconnect only once the offscreen document confirms, so the cancel cannot be lost.
    port.onMessage.addListener((m: LiveResponse) => m.type === 'cancelled' && port.disconnect());
    port.postMessage({ type: 'cancel' } satisfies LiveRequest);
  };
}
