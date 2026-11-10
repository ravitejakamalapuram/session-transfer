// Client for the signalling Worker (signal/). It carries only the room id and the two SDPs;
// the live code's secret is never passed in, so it cannot end up in a request.

/**
 * The deployed Worker (signal-deploy workflow). Clearing it hides "Send to another computer".
 * e2e builds point it at a local server.
 */
export const SIGNAL_URL: string = import.meta.env?.VITE_SIGNAL_URL || 'https://session-transfer-signal.echokit-rk.workers.dev';

export type Fetch = typeof fetch;

const POLL_MS = 1500;

export class SignalError extends Error {}

export class SignalClient {
  constructor(
    private readonly roomId: string,
    private readonly base: string = SIGNAL_URL,
    private readonly fetcher: Fetch = (...a) => fetch(...a),
  ) {}

  private url(kind: 'offer' | 'answer') {
    return `${this.base}/room/${this.roomId}/${kind}`;
  }

  async put(kind: 'offer' | 'answer', sdp: string): Promise<void> {
    const res = await this.fetcher(this.url(kind), { method: 'PUT', headers: { 'content-type': 'text/plain' }, body: sdp });
    if (res.status === 429) throw new SignalError('Too many transfers from this network. Try again in a few minutes.');
    if (res.status === 409) throw new SignalError('This code was already used. Start a new transfer.');
    if (!res.ok) throw new SignalError(`The signalling server refused the request (${res.status}).`);
  }

  /** Polls until the SDP is there or `deadline` (epoch ms) passes; null on timeout. */
  async wait(kind: 'offer' | 'answer', deadline: number, signal?: AbortSignal, pollMs = POLL_MS): Promise<string | null> {
    while (Date.now() < deadline) {
      if (signal?.aborted) return null;
      const res = await this.fetcher(this.url(kind), { method: 'GET', signal });
      if (res.ok) return res.text();
      if (res.status !== 404) throw new SignalError(`The signalling server refused the request (${res.status}).`);
      await new Promise((r) => setTimeout(r, pollMs));
    }
    return null;
  }
}
