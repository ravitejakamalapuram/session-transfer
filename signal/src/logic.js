// Pure signalling logic. No Cloudflare imports, so `node --test` can load it.
// Never log anything here: no URL, roomId, IP or body may reach console output.

export const ROOM_ID_RE = /^[a-z2-7]{6,8}$/;
export const MAX_BODY_BYTES = 16 * 1024;
export const ROOM_TTL_MS = 5 * 60 * 1000;
export const RATE_LIMIT = 30;
export const RATE_WINDOW_MS = 10 * 60 * 1000;

const SLOTS = new Set(['offer', 'answer']);
const BODY_TYPES = new Set(['text/plain', 'application/json']);
// Chrome extension ids are 32 letters a-p.
const EXTENSION_ORIGIN_RE = /^chrome-extension:\/\/[a-p]{32}$/;

/** Returns { roomId, slot } or { status } for a path that is not a room slot. */
export function parseRoute(pathname) {
  const m = /^\/room\/([^/]+)\/([^/]+)$/.exec(pathname);
  if (!m || !SLOTS.has(m[2])) return { status: 404 };
  if (!ROOM_ID_RE.test(m[1])) return { status: 400 };
  return { roomId: m[1], slot: m[2] };
}

/** CORS headers reflecting a chrome-extension:// origin; empty for any other origin. */
export function corsHeaders(origin) {
  if (typeof origin !== 'string' || !EXTENSION_ORIGIN_RE.test(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
  };
}

export function mediaType(contentType) {
  return (contentType ?? '').split(';')[0].trim().toLowerCase();
}

/**
 * Room state machine. state is null or { createdAt, offer, answer }, where offer/answer are
 * null or { body, type }. Returns the response plus the next state (null = delete the room).
 * The same state object is returned when nothing changed.
 */
export function roomStep(state, { method, slot, body, type }, now) {
  if (state && now >= state.createdAt + ROOM_TTL_MS) state = null;
  if (method === 'GET') {
    const value = state?.[slot];
    if (!value) return { status: 404, state };
    return { status: 200, body: value.body, type: value.type, state: slot === 'answer' ? null : state };
  }
  if (slot === 'offer') {
    if (state) return { status: 409, state };
    return { status: 201, state: { createdAt: now, offer: { body, type }, answer: null } };
  }
  if (!state || state.answer) return { status: 409, state }; // no offer yet, or answer already set
  return { status: 201, state: { ...state, answer: { body, type } } };
}

/** Fixed-window counter. state is null or { windowStart, count }. */
export function rateStep(state, now) {
  if (!state || now >= state.windowStart + RATE_WINDOW_MS) state = { windowStart: now, count: 0 };
  const retryAfter = Math.ceil((state.windowStart + RATE_WINDOW_MS - now) / 1000);
  if (state.count >= RATE_LIMIT) return { allowed: false, retryAfter, state };
  return { allowed: true, retryAfter, state: { ...state, count: state.count + 1 } };
}

// The two cores below take a Durable Object storage-like object:
// get, put, deleteAll, setAlarm, deleteAlarm.

export class RoomCore {
  constructor(storage, now = Date.now) {
    this.storage = storage;
    this.now = now;
  }

  async handle(op) {
    const before = (await this.storage.get('room')) ?? null;
    const { state, ...res } = roomStep(before, op, this.now());
    if (state !== before) {
      if (state) {
        await this.storage.put('room', state);
        if (state.createdAt !== before?.createdAt) await this.storage.setAlarm(state.createdAt + ROOM_TTL_MS);
      } else {
        await this.storage.deleteAlarm();
        await this.storage.deleteAll();
      }
    }
    return res;
  }

  async alarm() {
    await this.storage.deleteAll();
  }
}

export class RateCore {
  constructor(storage, now = Date.now) {
    this.storage = storage;
    this.now = now;
  }

  async hit() {
    const before = (await this.storage.get('rate')) ?? null;
    const { state, allowed, retryAfter } = rateStep(before, this.now());
    if (state !== before) {
      await this.storage.put('rate', state);
      if (state.windowStart !== before?.windowStart) await this.storage.setAlarm(state.windowStart + RATE_WINDOW_MS);
    }
    return { allowed, retryAfter };
  }

  // Drop the counter when the window ends so no per-IP record outlives it.
  async alarm() {
    await this.storage.deleteAll();
  }
}

async function readCapped(request, max) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** Worker fetch handler. env.ROOMS and env.RATE_LIMITER are Durable Object namespaces. */
export async function handleFetch(request, env) {
  const cors = corsHeaders(request.headers.get('Origin'));
  const reply = (status, body = null, extra = {}) =>
    new Response(body, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Origin', ...cors, ...extra } });

  try {
    const route = parseRoute(new URL(request.url).pathname);
    if (route.status) return reply(route.status);
    if (request.method === 'OPTIONS') return reply(204);
    if (request.method !== 'GET' && request.method !== 'PUT') return reply(405, null, { Allow: 'GET, PUT, OPTIONS' });

    const room = () => env.ROOMS.get(env.ROOMS.idFromName(route.roomId));
    if (request.method === 'GET') {
      const r = await room().handle({ method: 'GET', slot: route.slot });
      return r.status === 200 ? reply(200, r.body, { 'Content-Type': r.type }) : reply(r.status);
    }

    const type = mediaType(request.headers.get('Content-Type'));
    if (!BODY_TYPES.has(type)) return reply(415);
    if (Number(request.headers.get('Content-Length')) > MAX_BODY_BYTES) return reply(413);
    const body = await readCapped(request, MAX_BODY_BYTES);
    if (body === null) return reply(413);
    if (body === '') return reply(400);

    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const limit = await env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName(ip)).hit();
    if (!limit.allowed) return reply(429, null, { 'Retry-After': String(limit.retryAfter) });

    const r = await room().handle({ method: 'PUT', slot: route.slot, body, type });
    return reply(r.status);
  } catch {
    return reply(500); // deliberately not logged
  }
}
