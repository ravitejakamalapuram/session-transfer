import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleFetch, parseRoute, corsHeaders, RoomCore, RateCore,
  MAX_BODY_BYTES, ROOM_TTL_MS, RATE_LIMIT, RATE_WINDOW_MS,
} from '../src/logic.js';

const EXT = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
const ROOM = 'abc234';

function fakeStorage() {
  const map = new Map();
  return {
    map,
    alarm: null,
    async get(k) { return structuredClone(map.get(k)); },
    async put(k, v) { map.set(k, structuredClone(v)); },
    async deleteAll() { map.clear(); },
    async setAlarm(t) { this.alarm = t; },
    async deleteAlarm() { this.alarm = null; },
  };
}

function fakeNamespace(Core, clock) {
  const objects = new Map();
  return {
    objects,
    idFromName: (name) => name,
    get(id) {
      if (!objects.has(id)) objects.set(id, new Core(fakeStorage(), () => clock.t));
      return objects.get(id);
    },
  };
}

function setup() {
  const clock = { t: 1_000_000 };
  const env = { ROOMS: fakeNamespace(RoomCore, clock), RATE_LIMITER: fakeNamespace(RateCore, clock) };
  const call = (method, path, { body, type = 'application/json', origin = EXT, ip = '192.0.2.1' } = {}) => {
    const headers = { 'CF-Connecting-IP': ip };
    if (origin) headers.Origin = origin;
    if (body !== undefined) headers['Content-Type'] = type;
    return handleFetch(new Request(`https://signal.test${path}`, { method, headers, body }), env);
  };
  return { clock, env, call };
}

test('bad roomId is rejected with 400', async () => {
  const { call } = setup();
  for (const id of ['abc', 'abcdefghi', 'ABC234', 'abc189', 'abc-23']) {
    assert.equal((await call('GET', `/room/${id}/offer`)).status, 400, id);
  }
  assert.deepEqual(parseRoute('/room/abc234/offer'), { roomId: 'abc234', slot: 'offer' });
  assert.equal(parseRoute('/room/abc234/other').status, 404);
  assert.equal(parseRoute('/').status, 404);
});

test('body over 16 KB is rejected with 413, at the cap is accepted', async () => {
  const { call } = setup();
  assert.equal((await call('PUT', `/room/${ROOM}/offer`, { body: 'x'.repeat(MAX_BODY_BYTES + 1) })).status, 413);
  assert.equal((await call('PUT', `/room/${ROOM}/offer`, { body: 'x'.repeat(MAX_BODY_BYTES) })).status, 201);
});

test('unsupported content type is rejected with 415', async () => {
  const { call } = setup();
  assert.equal((await call('PUT', `/room/${ROOM}/offer`, { body: 'x', type: 'text/html' })).status, 415);
  assert.equal((await call('PUT', `/room/${ROOM}/offer`, { body: 'x', type: 'text/plain; charset=utf-8' })).status, 201);
});

test('offer can be set once and read back', async () => {
  const { call } = setup();
  assert.equal((await call('GET', `/room/${ROOM}/offer`)).status, 404);
  assert.equal((await call('PUT', `/room/${ROOM}/offer`, { body: '{"sdp":1}' })).status, 201);
  assert.equal((await call('PUT', `/room/${ROOM}/offer`, { body: '{"sdp":2}' })).status, 409);
  const res = await call('GET', `/room/${ROOM}/offer`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'application/json');
  assert.equal(await res.text(), '{"sdp":1}');
});

test('answer before offer is rejected, answer can be set once', async () => {
  const { call } = setup();
  assert.equal((await call('PUT', `/room/${ROOM}/answer`, { body: 'a' })).status, 409);
  await call('PUT', `/room/${ROOM}/offer`, { body: 'o' });
  assert.equal((await call('GET', `/room/${ROOM}/answer`)).status, 404);
  assert.equal((await call('PUT', `/room/${ROOM}/answer`, { body: 'a' })).status, 201);
  assert.equal((await call('PUT', `/room/${ROOM}/answer`, { body: 'b' })).status, 409);
});

test('reading the answer deletes the room', async () => {
  const { call, env } = setup();
  await call('PUT', `/room/${ROOM}/offer`, { body: 'o' });
  await call('PUT', `/room/${ROOM}/answer`, { body: 'a' });
  const res = await call('GET', `/room/${ROOM}/answer`);
  assert.equal(await res.text(), 'a');
  const storage = env.ROOMS.objects.get(ROOM).storage;
  assert.equal(storage.map.size, 0);
  assert.equal(storage.alarm, null);
  assert.equal((await call('GET', `/room/${ROOM}/offer`)).status, 404);
  assert.equal((await call('GET', `/room/${ROOM}/answer`)).status, 404);
});

test('room expires after 5 minutes, by alarm and by lazy check', async () => {
  const { call, env, clock } = setup();
  const created = clock.t;
  await call('PUT', `/room/${ROOM}/offer`, { body: 'o' });
  const core = env.ROOMS.objects.get(ROOM);
  assert.equal(core.storage.alarm, created + ROOM_TTL_MS);

  clock.t = created + ROOM_TTL_MS - 1;
  assert.equal((await call('GET', `/room/${ROOM}/offer`)).status, 200);
  clock.t = created + ROOM_TTL_MS;
  assert.equal((await call('GET', `/room/${ROOM}/offer`)).status, 404);
  assert.equal(core.storage.map.size, 0);

  await call('PUT', `/room/${ROOM}/offer`, { body: 'o2' });
  assert.equal(core.storage.alarm, clock.t + ROOM_TTL_MS);
  await core.alarm();
  assert.equal(core.storage.map.size, 0);
});

test('rate limit: 30 writes per IP per 10 minutes, then 429', async () => {
  const { call, clock, env } = setup();
  const ids = Array.from({ length: RATE_LIMIT + 1 }, (_, i) => 'rooms' + 'abcdefghijklmnopqrstuvwxyz234567'[i]);
  for (let i = 0; i < RATE_LIMIT; i++) {
    assert.equal((await call('PUT', `/room/${ids[i]}/offer`, { body: 'o' })).status, 201);
  }
  const blocked = await call('PUT', `/room/${ids[RATE_LIMIT]}/offer`, { body: 'o' });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('Retry-After'), String(RATE_WINDOW_MS / 1000));
  assert.equal(env.ROOMS.objects.has(ids[RATE_LIMIT]), false);

  assert.equal((await call('PUT', `/room/${ids[RATE_LIMIT]}/offer`, { body: 'o', ip: '192.0.2.2' })).status, 201);
  assert.equal((await call('GET', `/room/${ids[0]}/offer`)).status, 200, 'reads are not limited');

  clock.t += RATE_WINDOW_MS;
  assert.equal((await call('PUT', '/room/zzzzzz/offer', { body: 'o' })).status, 201);

  const limiter = env.RATE_LIMITER.objects.get('192.0.2.1');
  await limiter.alarm();
  assert.equal(limiter.storage.map.size, 0);
});

test('CORS headers are reflected only for chrome-extension origins', async () => {
  const { call } = setup();
  const ok = await call('OPTIONS', `/room/${ROOM}/offer`);
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), EXT);
  assert.match(ok.headers.get('Access-Control-Allow-Methods'), /PUT/);
  assert.equal(ok.headers.get('Vary'), 'Origin');

  for (const origin of ['https://evil.example', 'chrome-extension://short', 'null', '*', null]) {
    const res = await call('GET', `/room/${ROOM}/offer`, { origin });
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), null, String(origin));
  }
  assert.deepEqual(corsHeaders('moz-extension://abcdefghijklmnopabcdefghijklmnop'), {});
});

test('other methods get 405', async () => {
  const { call } = setup();
  assert.equal((await call('POST', `/room/${ROOM}/offer`, { body: 'x' })).status, 405);
  assert.equal((await call('DELETE', `/room/${ROOM}/offer`)).status, 405);
});
