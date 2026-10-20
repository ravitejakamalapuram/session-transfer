// Runs the real signalling Worker logic (signal/src/logic.js) on a local port, with in-memory
// stand-ins for its Durable Objects, so the live transfer e2e needs no Cloudflare account.
import http from 'node:http';
// @ts-expect-error plain JS module without types
import { handleFetch, RoomCore, RateCore } from '../../signal/src/logic.js';

export const SIGNAL_PORT = 8787; // matches VITE_SIGNAL_URL in the test:e2e script

function storage() {
  const map = new Map<string, unknown>();
  return {
    get: async (k: string) => structuredClone(map.get(k)),
    put: async (k: string, v: unknown) => void map.set(k, structuredClone(v)),
    deleteAll: async () => map.clear(),
    setAlarm: async () => undefined,
    deleteAlarm: async () => undefined,
  };
}

function namespace(Core: new (s: ReturnType<typeof storage>, now: () => number) => unknown) {
  const objects = new Map<string, unknown>();
  return {
    idFromName: (n: string) => n,
    get: (id: string) => objects.get(id) ?? objects.set(id, new Core(storage(), Date.now)).get(id),
  };
}

export async function startSignal(): Promise<{ requests: string[]; close(): Promise<void> }> {
  const env = { ROOMS: namespace(RoomCore), RATE_LIMITER: namespace(RateCore) };
  const requests: string[] = [];
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks).toString();
    requests.push(`${req.method} ${req.url} ${body}`);
    const headers = new Headers({ 'CF-Connecting-IP': '127.0.0.1' });
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const out: Response = await handleFetch(
      new Request(`http://127.0.0.1:${SIGNAL_PORT}${req.url}`, { method: req.method, headers, body: body || undefined }),
      env,
    );
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(await out.text());
  });
  await new Promise<void>((r) => server.listen(SIGNAL_PORT, '127.0.0.1', r));
  return { requests, close: () => new Promise((r) => server.close(() => r())) };
}
