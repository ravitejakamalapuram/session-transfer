import { OpRequest, OpResponse, PORT_NAME } from '../core/messages';

/**
 * Opens a fresh port to the service worker, sends one request, and streams every
 * response to `onMessage`. Returns a disconnect function.
 */
export function runOp(request: OpRequest, onMessage: (msg: OpResponse) => void): () => void {
  const port = chrome.runtime.connect({ name: PORT_NAME });
  port.onMessage.addListener((msg: OpResponse) => onMessage(msg));
  port.onDisconnect.addListener(() => {
    if (chrome.runtime.lastError) {
      onMessage({ type: 'error', message: 'Background worker disconnected.' });
    }
  });
  port.postMessage(request);
  return () => {
    try {
      port.disconnect();
    } catch {
      /* noop */
    }
  };
}
