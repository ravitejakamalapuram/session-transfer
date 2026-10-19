// Unit tests for the live transfer core. Run with `npm test` (node --test).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateTransferCode } from './crypto';
import {
  formatLiveCode,
  generateRoomId,
  LIVE_CHUNK_CHARS,
  LIVE_CODE_GROUPS,
  LiveChannel,
  LiveSession,
  MISMATCH_MESSAGE,
  parseLiveCode,
  receivePackage,
  sdpFingerprints,
  sendPackage,
} from './live';

const OFFER = 'v=0\r\na=fingerprint:sha-256 AA:BB\r\na=setup:actpass\r\n';
const ANSWER = 'v=0\r\na=fingerprint:sha-256 CC:DD\r\na=setup:active\r\n';
const MITM = 'v=0\r\na=fingerprint:sha-256 EE:FF\r\n';

/** Two connected in-memory channels; `tamper` rewrites frames from a to b. */
function pair(tamper?: (f: string) => string): [LiveChannel, LiveChannel] {
  const make = () => {
    const queue: string[] = [];
    const waiters: ((s: string) => void)[] = [];
    return {
      push: (s: string) => (waiters.length ? waiters.shift()!(s) : queue.push(s)),
      next: () => (queue.length ? Promise.resolve(queue.shift()!) : new Promise<string>((r) => waiters.push(r))),
    };
  };
  const a = make();
  const b = make();
  return [
    { send: (s) => b.push(tamper ? tamper(s) : s), next: a.next },
    { send: (s) => a.push(s), next: b.next },
  ];
}

const secret = generateTransferCode(LIVE_CODE_GROUPS);
const roomId = 'abc234';
const session = (role: LiveSession['role'], over: Partial<LiveSession> = {}): LiveSession => ({
  role,
  roomId,
  secret,
  offerSdp: OFFER,
  answerSdp: ANSWER,
  ...over,
});

describe('live code', () => {
  it('round-trips and keeps the room id apart from the secret', () => {
    const room = generateRoomId();
    assert.match(room, /^[a-z2-7]{6}$/);
    const parsed = parseLiveCode(`  ${formatLiveCode(room, secret)}\n`);
    assert.deepEqual(parsed, { roomId: room, secret });
    assert.ok(!secret.toLowerCase().includes(room));
  });

  it('rejects malformed codes, including a plain 3-group transfer code', () => {
    assert.equal(parseLiveCode(generateTransferCode()), null);
    assert.equal(parseLiveCode(`ABC234-${secret}`), null);
    assert.equal(parseLiveCode(`abc234-${secret.slice(0, -1)}`), null);
    assert.equal(parseLiveCode(`abc234-${secret}-ABCD`), null);
    assert.equal(parseLiveCode('{"format":"x"}'), null);
  });

  it('reads fingerprints regardless of line order and fails without one', () => {
    assert.equal(sdpFingerprints('a=fingerprint:sha-256 BB\na=fingerprint:sha-256 AA'), 'sha-256 aa,sha-256 bb');
    assert.throws(() => sdpFingerprints('v=0'));
  });
});

describe('live transfer', () => {
  it('moves a multi-chunk package intact', async () => {
    const text = 'x'.repeat(LIVE_CHUNK_CHARS * 2 + 17);
    const [a, b] = pair();
    const seen: number[] = [];
    const [, got] = await Promise.all([sendPackage(a, session('sender'), text, (n) => seen.push(n)), receivePackage(b, session('receiver'))]);
    assert.equal(got, text);
    assert.deepEqual(seen, [LIVE_CHUNK_CHARS, LIVE_CHUNK_CHARS * 2, text.length]);
  });

  it('aborts before any package bytes when the fingerprints differ (middleman)', async () => {
    const frames: string[] = [];
    const [a, b] = pair((f) => (frames.push(f), f));
    const results = await Promise.allSettled([
      sendPackage(a, session('sender'), 'SECRET-PAYLOAD'),
      receivePackage(b, session('receiver', { offerSdp: MITM })),
    ]);
    assert.equal(results[1].status, 'rejected');
    assert.equal((results[1] as PromiseRejectedResult).reason.message, MISMATCH_MESSAGE);
    assert.equal(results[0].status, 'rejected');
    assert.ok(frames.every((f) => !f.includes('SECRET-PAYLOAD')));
  });

  it('aborts when the receiver has a different secret', async () => {
    const [a, b] = pair();
    const results = await Promise.allSettled([
      sendPackage(a, session('sender'), 'p'),
      receivePackage(b, session('receiver', { secret: generateTransferCode(LIVE_CODE_GROUPS) })),
    ]);
    assert.ok(results.every((r) => r.status === 'rejected'));
  });

  it('binds the role, so a tag cannot be reflected back', async () => {
    const [a, b] = pair();
    const r = await Promise.allSettled([sendPackage(a, session('sender'), 'p'), receivePackage(b, session('sender'))]);
    assert.ok(r.every((x) => x.status === 'rejected'));
  });

  it('rejects a cut-short or oversized stream', async () => {
    const [a, b] = pair((f) => (JSON.parse(f).t === 'meta' ? JSON.stringify({ t: 'meta', chars: 999 }) : f));
    const r = await Promise.allSettled([sendPackage(a, session('sender'), 'short'), receivePackage(b, session('receiver'))]);
    assert.equal(r[1].status, 'rejected');
  });
});
