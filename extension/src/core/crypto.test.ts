// Unit tests for the package crypto (APP-317 plan §6). Run with `npm test` (node --test).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkPackage,
  decryptPayload,
  encryptPayload,
  MAX_PACKAGE_LIFETIME_MS,
  packageNeedsCode,
} from './crypto';
import { EncryptedPackage, SessionPayload } from './types';
import v1 from './fixtures/v1-package.json';

const TTL = 5 * 60 * 1000;
const T0 = 1_800_000_000_000;

const payload = (origin = 'https://example.test'): SessionPayload => ({
  format: 'browser-session-transfer',
  version: 2,
  createdAt: T0,
  source: { browser: 'Chrome', origin, userAgent: 'test', title: 't', url: `${origin}/` },
  state: { cookies: [], localStorage: [['token', 'secret-value']], sessionStorage: [], indexedDB: [], cacheStorage: [] },
  results: [],
  unsupported: [],
});

const rejects = (p: Promise<unknown>, re: RegExp) => assert.rejects(p, (e: Error) => re.test(e.message));
const clone = (p: EncryptedPackage): EncryptedPackage => JSON.parse(JSON.stringify(p));

describe('plain mode (default, no encryption)', () => {
  it('round-trips with no code, no key and no encryption', async () => {
    const { pkg, code } = await encryptPayload(payload(), TTL, 'none', T0);
    assert.equal(code, null);
    assert.equal(pkg.keyMode, 'none');
    assert.equal(pkg.alg, 'none');
    assert.equal(packageNeedsCode(pkg), false);
    assert.equal(pkg.key, undefined);
    const out = await decryptPayload(pkg, null, { now: T0 + 1000 });
    assert.equal(out.state.localStorage[0][1], 'secret-value');
  });

  it('is the default mode', async () => {
    const { pkg } = await encryptPayload(payload(), TTL, undefined, T0);
    assert.equal(pkg.keyMode, 'none');
  });

  it('refuses a payload whose origin differs from the package origin, and garbage', async () => {
    const { pkg } = await encryptPayload(payload(), TTL, 'none', T0);
    const bad = clone(pkg); bad.origin = 'https://evil.test';
    await rejects(decryptPayload(bad, null, { now: T0 + 1000 }), /Origin integrity/);
    const junk = clone(pkg); junk.ciphertext = Buffer.from('not json').toString('base64');
    await rejects(decryptPayload(junk, null, { now: T0 + 1000 }), /incomplete or damaged/);
  });
});

describe('code mode limits', () => {
  it('refuses an absurd PBKDF2 iteration count (denial of service)', async () => {
    const { pkg, code } = await encryptPayload(payload(), TTL, 'code', T0);
    const bad = clone(pkg); bad.iterations = 1_000_000_000;
    await rejects(decryptPayload(bad, code, { now: T0 + 1000 }), /incomplete or damaged/);
  });
});

describe('embedded mode (read-only legacy, v1.2.x packages)', () => {
  it('round-trips with no code and returns code = null', async () => {
    const { pkg, code } = await encryptPayload(payload(), TTL, 'embedded', T0);
    assert.equal(code, null);
    assert.equal(pkg.version, 2);
    assert.equal(pkg.keyMode, 'embedded');
    assert.equal(packageNeedsCode(pkg), false);
    assert.ok(pkg.key && Buffer.from(pkg.key, 'base64').length === 32);
    assert.equal(pkg.salt, undefined);
    assert.ok(!JSON.stringify(pkg).includes('secret-value'), 'no plaintext in the package');
    const out = await decryptPayload(pkg, null, { now: T0 + 1000 });
    assert.equal(out.state.localStorage[0][1], 'secret-value');
  });

  it('uses a fresh random key per export', async () => {
    const a = await encryptPayload(payload(), TTL, 'embedded', T0);
    const b = await encryptPayload(payload(), TTL, 'embedded', T0);
    assert.notEqual(a.pkg.key, b.pkg.key);
  });

  it('refuses a missing, short or non-base64 key', async () => {
    const { pkg } = await encryptPayload(payload(), TTL, 'embedded', T0);
    for (const key of [undefined, '', Buffer.alloc(16).toString('base64'), '!!!not base64!!!']) {
      const bad = clone(pkg);
      bad.key = key;
      await rejects(decryptPayload(bad, null, { now: T0 + 1000 }), /incomplete or damaged/);
    }
  });

  it('detects a changed origin, expiry or mode (header is AAD)', async () => {
    const { pkg } = await encryptPayload(payload(), TTL, 'embedded', T0);
    const origin = clone(pkg); origin.origin = 'https://evil.test';
    const expiry = clone(pkg); expiry.expiresAt += 20_000;
    const mode = clone(pkg); mode.keyMode = 'code';
    await rejects(decryptPayload(origin, null, { now: T0 + 1000 }), /damaged or was changed/);
    await rejects(decryptPayload(expiry, null, { now: T0 + 1000 }), /damaged or was changed/);
    await rejects(decryptPayload(mode, 'ABCD-EFGH-JKMN', { now: T0 + 1000 }), /incomplete|damaged|Incorrect/);
  });
});

describe('code mode', () => {
  it('round-trips with the generated code and has no key in the package', async () => {
    const { pkg, code } = await encryptPayload(payload(), TTL, 'code', T0);
    assert.match(code!, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.equal(pkg.keyMode, 'code');
    assert.equal(pkg.key, undefined);
    assert.equal(packageNeedsCode(pkg), true);
    const out = await decryptPayload(pkg, code, { now: T0 + 1000 });
    assert.equal(out.state.localStorage[0][1], 'secret-value');
    // user typing: lower case, no hyphens
    await decryptPayload(pkg, code!.toLowerCase().replace(/-/g, ''), { now: T0 + 1000 });
  });

  it('wrong or missing code fails and writes nothing', async () => {
    const { pkg } = await encryptPayload(payload(), TTL, 'code', T0);
    await rejects(decryptPayload(pkg, 'AAAA-AAAA-AAAA', { now: T0 + 1000 }), /Incorrect code/);
    await rejects(decryptPayload(pkg, '', { now: T0 + 1000 }), /Enter the transfer code/);
    await rejects(decryptPayload(pkg, null, { now: T0 + 1000 }), /Enter the transfer code/);
  });

  it('a tampered expiresAt, origin or keyMode breaks decryption', async () => {
    const { pkg, code } = await encryptPayload(payload(), TTL, 'code', T0);
    const expiry = clone(pkg); expiry.expiresAt += 20_000;
    const origin = clone(pkg); origin.origin = 'https://evil.test';
    const mode = clone(pkg); mode.keyMode = 'embedded';
    await rejects(decryptPayload(expiry, code, { now: T0 + 1000 }), /Incorrect code/);
    await rejects(decryptPayload(origin, code, { now: T0 + 1000 }), /Incorrect code/);
    await rejects(decryptPayload(mode, code, { now: T0 + 1000 }), /incomplete or damaged/);
  });
});

describe('expiry, lifetime and version (checked before any decrypt)', () => {
  for (const mode of ['none', 'embedded', 'code'] as const) {
    it(`${mode}: refused after expiresAt, accepted right before`, async () => {
      const { pkg, code } = await encryptPayload(payload(), TTL, mode, T0);
      await decryptPayload(pkg, code, { now: T0 + TTL });
      await rejects(decryptPayload(pkg, code, { now: T0 + TTL + 1 }), /expired/);
    });

    if (mode !== 'none') it(`${mode}: expired is reported even when the package is also tampered`, async () => {
      const { pkg } = await encryptPayload(payload(), TTL, mode, T0);
      const bad = clone(pkg); bad.origin = 'https://evil.test'; bad.ciphertext = 'AAAA';
      await rejects(decryptPayload(bad, 'WRONG-CODE-0000', { now: T0 + TTL + 1 }), /expired/);
    });

    it(`${mode}: a lifetime above 5 min 30 s is refused`, async () => {
      const { pkg, code } = await encryptPayload(payload(), MAX_PACKAGE_LIFETIME_MS + 1, mode, T0);
      await rejects(decryptPayload(pkg, code, { now: T0 + 1000 }), /lifetime/);
      const ok = await encryptPayload(payload(), MAX_PACKAGE_LIFETIME_MS, mode, T0);
      await decryptPayload(ok.pkg, ok.code, { now: T0 + 1000 });
    });
  }

  it('a backup lifetime (30 min) is allowed only when the caller passes it', async () => {
    const { pkg, code } = await encryptPayload(payload(), 30 * 60_000, 'code', T0);
    await rejects(decryptPayload(pkg, code, { now: T0 + 1000 }), /lifetime/);
    await decryptPayload(pkg, code, { now: T0 + 1000, maxLifetimeMs: 30 * 60_000 });
  });

  it('version 3 is refused with the update message; bad format is refused first', async () => {
    const { pkg } = await encryptPayload(payload(), TTL, 'embedded', T0);
    const v3 = clone(pkg); v3.version = 3;
    await rejects(decryptPayload(v3, null, { now: T0 }), /newer version of Session Transfer. Update the extension/);
    const other = clone(v3); (other as any).format = 'something-else';
    await rejects(decryptPayload(other, null, { now: T0 }), /Unrecognized package format/);
    assert.throws(() => checkPackage({ ...pkg, version: 0 }, T0), /incomplete or damaged/);
  });
});

describe('version 1 packages stay readable', () => {
  const pkg = v1.pkg as unknown as EncryptedPackage;

  it('the committed v1 fixture decrypts with its code', async () => {
    assert.equal(pkg.version, 1);
    assert.equal(packageNeedsCode(pkg), true);
    const out = await decryptPayload(pkg, v1.code, { now: pkg.createdAt + 60_000 });
    assert.equal(out.state.cookies[0].value, 'fake-v1-cookie');
    assert.equal(out.state.localStorage[0][1], 'fake-v1-ls');
  });

  it('v1 still needs the code, and is refused once expired', async () => {
    await rejects(decryptPayload(pkg, null, { now: pkg.createdAt + 60_000 }), /Enter the transfer code/);
    await rejects(decryptPayload(pkg, v1.code, { now: pkg.expiresAt + 1 }), /expired/);
  });
});
