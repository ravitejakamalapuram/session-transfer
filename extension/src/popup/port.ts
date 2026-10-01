import { CIPHERTEXT_CHUNK_CHARS, OpRequest, OpResponse, PORT_NAME } from '../core/messages';

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
  try {
    if ((request.type === 'inspect' || request.type === 'restore') && request.packageText.length > CIPHERTEXT_CHUNK_CHARS) {
      for (let i = 0; i < request.packageText.length; i += CIPHERTEXT_CHUNK_CHARS) {
        port.postMessage({ type: 'packageChunk', data: request.packageText.slice(i, i + CIPHERTEXT_CHUNK_CHARS) });
      }
      port.postMessage({ ...request, packageText: '' });
    } else {
      port.postMessage(request);
    }
  } catch (e) {
    onMessage({ type: 'error', message: `Could not send the package to the background worker: ${(e as Error).message}` });
  }
  return () => {
    try {
      port.disconnect();
    } catch {
      /* noop */
    }
  };
}
