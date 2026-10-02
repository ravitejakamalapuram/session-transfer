// Encryption layer. Uses only Web Crypto primitives:
//   - AES-256-GCM (authenticated encryption, package header bound via AAD)
//   - embedded mode (default): a random 32-byte key per export, carried inside the package
//   - code mode: PBKDF2-SHA256 derives the key from a separate human transfer code
//   - crypto.getRandomValues for key / salt / iv / transfer code / id
// No custom cryptography.

import { bytesToBase64, base64ToBytes, strToBytes, bytesToStr } from './encoding';
import {
  EncryptedPackage,
  KeyMode,
  LEGACY_PACKAGE_VERSION,
  PACKAGE_FORMAT,
  PACKAGE_VERSION,
  SessionPayload,
} from './types';

// Web Crypto's BufferSource typings tightened in TS 5.7 (ArrayBuffer vs
// ArrayBufferLike). Our byte arrays are always plain ArrayBuffer-backed.
const bs = (u: Uint8Array): BufferSource => u as unknown as BufferSource;

const PBKDF2_ITERATIONS = 600_000;
const KEY_BYTES = 32;
/** A package may not claim to live longer than a transfer does (5 min) plus 30 s clock skew. */
export const MAX_PACKAGE_LIFETIME_MS = 5 * 60 * 1000 + 30 * 1000;
// Unambiguous alphabet (no 0/O/1/I) for human-typed transfer codes.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_GROUPS = 3;
const CODE_GROUP_LEN = 4;

/** Generates a one-time transfer code like "ABC7-K9P2-WXYZ". Not stored on disk. */
export function generateTransferCode(): string {
  const total = CODE_GROUPS * CODE_GROUP_LEN;
  const rnd = new Uint32Array(total);
  crypto.getRandomValues(rnd);
  const chars = Array.from(rnd, (n) => CODE_ALPHABET[n % CODE_ALPHABET.length]);
  const groups: string[] = [];
  for (let i = 0; i < CODE_GROUPS; i++) {
    groups.push(chars.slice(i * CODE_GROUP_LEN, (i + 1) * CODE_GROUP_LEN).join(''));
  }
  return groups.join('-');
}

/** Normalizes user-entered codes (strips spaces/hyphens, uppercases). */
export function normalizeCode(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export function randomId(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export async function sha256Base64(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bs(data));
  return bytesToBase64(new Uint8Array(digest));
}

async function deriveKey(code: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    bs(strToBytes(normalizeCode(code))),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: bs(salt), iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface EncryptResult {
  pkg: EncryptedPackage;
  /** The separate transfer code (code mode); null when the key is embedded in the package. */
  code: string | null;
}

type PackageHeader = Pick<
  EncryptedPackage,
  'format' | 'version' | 'keyMode' | 'origin' | 'createdAt' | 'expiresAt' | 'transferId'
>;

/** Canonical JSON of the v2 header (fixed key order); this is the AES-GCM AAD. */
function headerAad(h: PackageHeader): Uint8Array {
  return strToBytes(
    JSON.stringify({
      format: h.format,
      version: h.version,
      keyMode: h.keyMode,
      origin: h.origin,
      createdAt: h.createdAt,
      expiresAt: h.expiresAt,
      transferId: h.transferId,
    }),
  );
}

/**
 * Encrypts a session payload. Encryption is always on.
 *  - 'embedded' (default): random 32-byte AES key, stored base64 in the package `key` field.
 *  - 'code': a generated one-time code -> PBKDF2 -> key; the code travels on a second channel.
 * The v2 header (incl. expiresAt, origin, keyMode) is AES-GCM AAD.
 */
export async function encryptPayload(
  payload: SessionPayload,
  ttlMs: number,
  keyMode: KeyMode = 'none',
  now: number = Date.now(),
): Promise<EncryptResult> {
  const json = JSON.stringify(payload);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const origin = payload.source.origin;

  const header: PackageHeader = {
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    keyMode,
    origin,
    createdAt: now,
    expiresAt: now + ttlMs,
    transferId: randomId(),
  };

  if (keyMode === 'none') {
    const plain: EncryptedPackage = {
      ...header,
      alg: 'none',
      iv: '',
      ciphertext: bytesToBase64(strToBytes(json)),
    };
    return { pkg: plain, code: null };
  }

  let key: CryptoKey;
  let code: string | null = null;
  const extra: Partial<EncryptedPackage> = {};
  if (keyMode === 'embedded') {
    const raw = crypto.getRandomValues(new Uint8Array(KEY_BYTES));
    key = await crypto.subtle.importKey('raw', bs(raw), 'AES-GCM', false, ['encrypt']);
    extra.key = bytesToBase64(raw);
  } else {
    code = generateTransferCode();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    key = await deriveKey(code, salt, PBKDF2_ITERATIONS);
    extra.kdf = 'PBKDF2-SHA256';
    extra.iterations = PBKDF2_ITERATIONS;
    extra.salt = bytesToBase64(salt);
  }

  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: bs(iv), additionalData: bs(headerAad(header)) },
    key,
    bs(strToBytes(json)),
  );

  const pkg: EncryptedPackage = {
    ...header,
    alg: 'AES-256-GCM',
    ...extra,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(cipherBuf)),
  };
  return { pkg, code };
}

export class DecryptError extends Error {}

/** True when the receiver must ask for a transfer code (v1 packages and v2 code mode). */
export function packageNeedsCode(pkg: EncryptedPackage): boolean {
  return pkg.version === LEGACY_PACKAGE_VERSION || pkg.keyMode === 'code';
}

/**
 * Structural checks that run BEFORE any decryption, for every version and mode:
 * format, version, expiry, lifetime. Throws DecryptError. Expiry is an extension-side
 * check (in embedded mode the key is inside the package).
 */
export function checkPackage(
  pkg: EncryptedPackage,
  now: number = Date.now(),
  maxLifetimeMs: number = MAX_PACKAGE_LIFETIME_MS,
): void {
  if (pkg.format !== PACKAGE_FORMAT) throw new DecryptError('Unrecognized package format.');
  if (typeof pkg.version !== 'number' || pkg.version < LEGACY_PACKAGE_VERSION) {
    throw new DecryptError('Package is incomplete or damaged.');
  }
  if (pkg.version > PACKAGE_VERSION) {
    throw new DecryptError(
      'This package was made by a newer version of Session Transfer. Update the extension and try again.',
    );
  }
  if (typeof pkg.expiresAt !== 'number' || typeof pkg.createdAt !== 'number') {
    throw new DecryptError('Package is incomplete or damaged.');
  }
  if (now > pkg.expiresAt) throw new DecryptError('This transfer has expired.');
  if (pkg.expiresAt - pkg.createdAt > maxLifetimeMs) {
    throw new DecryptError('Package is invalid: its lifetime is longer than a transfer allows.');
  }
}

/** Decrypts and validates an encrypted package. Throws DecryptError on failure. */
export async function decryptPayload(
  pkg: EncryptedPackage,
  code: string | null | undefined,
  opts: { now?: number; maxLifetimeMs?: number } = {},
): Promise<SessionPayload> {
  checkPackage(pkg, opts.now, opts.maxLifetimeMs);

  if (pkg.keyMode === 'none') return parsePayload(base64ToBytes(pkg.ciphertext), pkg);

  let key: CryptoKey;
  let aad: Uint8Array;
  try {
    if (pkg.version === LEGACY_PACKAGE_VERSION || pkg.keyMode === 'code') {
      if (!code || !code.trim()) throw new DecryptError('Enter the transfer code from the sending browser.');
      if (!pkg.salt) throw new DecryptError('Package is incomplete or damaged.');
      const iterations = pkg.iterations ?? 210_000;
      if (!Number.isInteger(iterations) || iterations < 1 || iterations > 2_000_000) {
        throw new DecryptError('Package is incomplete or damaged.');
      }
      key = await deriveKey(code, base64ToBytes(pkg.salt), iterations);
      aad = pkg.version === LEGACY_PACKAGE_VERSION ? strToBytes(pkg.origin) : headerAad(pkg);
    } else if (pkg.keyMode === 'embedded') {
      const raw = pkg.key ? base64ToBytes(pkg.key) : null;
      if (!raw || raw.length !== KEY_BYTES) throw new DecryptError('Package is incomplete or damaged.');
      key = await crypto.subtle.importKey('raw', bs(raw), 'AES-GCM', false, ['decrypt']);
      aad = headerAad(pkg);
    } else {
      throw new DecryptError('Package is incomplete or damaged.');
    }
  } catch (e) {
    if (e instanceof DecryptError) throw e;
    throw new DecryptError('Package is incomplete or damaged.');
  }

  let plainBuf: ArrayBuffer;
  try {
    plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bs(base64ToBytes(pkg.iv)), additionalData: bs(aad) },
      key,
      bs(base64ToBytes(pkg.ciphertext)),
    );
  } catch {
    throw new DecryptError(
      pkg.keyMode === 'embedded' ? 'Package is damaged or was changed.' : 'Incorrect code or corrupted package.',
    );
  }
  return parsePayload(new Uint8Array(plainBuf), pkg);
}

function parsePayload(bytes: Uint8Array, pkg: EncryptedPackage): SessionPayload {
  let payload: SessionPayload;
  try {
    payload = JSON.parse(bytesToStr(bytes)) as SessionPayload;
  } catch {
    throw new DecryptError('Package is incomplete or damaged.');
  }
  if (payload.source?.origin !== pkg.origin) {
    throw new DecryptError('Origin integrity check failed.');
  }
  return payload;
}
