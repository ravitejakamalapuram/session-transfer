// Unit tests for the signalling client. Run with `npm test` (node --test).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateTransferCode } from './crypto';
import { LIVE_CODE_GROUPS } from './live';
import { Fetch, SignalClient, SignalError } from './signal-client';

function fakeFetch(responses: Array<[number, string]>) {
  const calls: Array<{ url: string; method: string; body: string }> = [];
  const fn: Fetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET', body: String(init?.body ?? '') });
    const [status, body] = responses.shift() ?? [404, ''];
    return new Response(status === 404 || status === 409 || status === 429 ? null : body, { status });
  };
  return { fn, calls };
}

describe('signal client', () => {
  it('never sends the secret: only the room id and the SDP', async () => {
    const secret = generateTransferCode(LIVE_CODE_GROUPS);
    const { fn, calls } = fakeFetch([[201, ''], [404, ''], [200, 'answer-sdp']]);
    const c = new SignalClient('abc234', 'https://signal.test', fn);
    await c.put('offer', 'offer-sdp');
    assert.equal(await c.wait('answer', Date.now() + 5000, undefined, 1), 'answer-sdp');
    assert.deepEqual(
      calls.map((x) => `${x.method} ${x.url}`),
      ['PUT https://signal.test/room/abc234/offer', 'GET https://signal.test/room/abc234/answer', 'GET https://signal.test/room/abc234/answer'],
    );
    const norm = secret.replace(/-/g, '');
    for (const x of calls) assert.ok(!x.url.includes(norm) && !x.body.includes(secret) && !x.body.includes(norm));
  });

  it('returns null at the deadline and maps errors to readable messages', async () => {
    const c = new SignalClient('abc234', 'https://signal.test', fakeFetch([]).fn);
    assert.equal(await c.wait('offer', Date.now() + 5, undefined, 1), null);
    await assert.rejects(new SignalClient('abc234', '', fakeFetch([[409, '']]).fn).put('answer', 's'), SignalError);
    await assert.rejects(new SignalClient('abc234', '', fakeFetch([[429, '']]).fn).put('offer', 's'), /Too many/);
  });
});
