import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildStorageState, parseExtraDomains, toPlaywrightCookie } from './storage-state';
import { CapturedCookie } from './types';

const cookie = (over: Partial<CapturedCookie> = {}): CapturedCookie => ({
  name: 'sid', value: 'v', domain: '.example.com', path: '/', secure: true, httpOnly: true,
  sameSite: 'lax', expirationDate: 1_900_000_000.7, hostOnly: false, session: false, ...over,
});

describe('storageState export', () => {
  it('maps a cookie to the Playwright shape', () => {
    assert.deepEqual(toPlaywrightCookie(cookie()), {
      name: 'sid', value: 'v', domain: '.example.com', path: '/', expires: 1_900_000_000,
      httpOnly: true, secure: true, sameSite: 'Lax',
    });
  });
  it('maps sameSite values and session cookies', () => {
    assert.equal(toPlaywrightCookie(cookie({ sameSite: 'no_restriction' })).sameSite, 'None');
    assert.equal(toPlaywrightCookie(cookie({ sameSite: 'strict' })).sameSite, 'Strict');
    assert.equal(toPlaywrightCookie(cookie({ sameSite: 'unspecified' })).sameSite, 'Lax');
    assert.equal(toPlaywrightCookie(cookie({ session: true, expirationDate: undefined })).expires, -1);
  });
  it('builds origins from localStorage and leaves out partitioned cookies, counting them', () => {
    const { state, skippedPartitioned } = buildStorageState(
      'https://example.com',
      [cookie(), cookie({ name: 'p', partitionKey: { topLevelSite: 'https://other.test' } })],
      [['token', 'abc']],
    );
    assert.equal(state.cookies.length, 1);
    assert.equal(skippedPartitioned, 1);
    assert.deepEqual(state.origins, [{ origin: 'https://example.com', localStorage: [{ name: 'token', value: 'abc' }] }]);
  });
  it('has no origins entry when there is no localStorage', () => {
    assert.deepEqual(buildStorageState('https://example.com', [], []).state.origins, []);
  });
});

describe('parseExtraDomains', () => {
  it('accepts plain host names, lowercases, drops a leading dot and duplicates', () => {
    assert.deepEqual(parseExtraDomains('Accounts.Example.com, .login.example.org  accounts.example.com'), {
      domains: ['accounts.example.com', 'login.example.org'], invalid: [],
    });
  });
  it('rejects schemes, paths, ports, wildcards and junk instead of using them', () => {
    const { domains, invalid } = parseExtraDomains('https://a.test, b.test/x, c.test:8080, *.d.test, -bad.test, ok.test');
    assert.deepEqual(domains, ['ok.test']);
    assert.equal(invalid.length, 5);
  });
  it('limits the number of domains', () => {
    const { domains, invalid } = parseExtraDomains('a.t b.t c.t d.t e.t f.t');
    assert.equal(domains.length, 5);
    assert.match(invalid[0], /limit 5/);
  });
  it('empty input is empty', () => {
    assert.deepEqual(parseExtraDomains('  '), { domains: [], invalid: [] });
  });
});
