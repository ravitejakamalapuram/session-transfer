// Encryption layer. Uses only Web Crypto primitives:
//   - AES-256-GCM (authenticated encryption, origin bound via AAD)
//   - PBKDF2-SHA256 for deriving a key from the human transfer code
//   - crypto.getRandomValues for salt / iv / transfer code / id
// No custom cryptography.

import { bytesToBase64, base64ToBytes, strToBytes, bytesToStr } from './encoding';
import {
  EncryptedPackage,
  PACKAGE_FORMAT,
  PACKAGE_VERSION,
  SessionPayload,
} from './types';

// Web Crypto's BufferSource typings tightened in TS 5.7 (ArrayBuffer vs
// ArrayBufferLike). Our byte arrays are always plain ArrayBuffer-backed.
const bs = (u: Uint8Array): BufferSource => u as unknown as BufferSource;

const PBKDF2_ITERATIONS = 210_000;
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

async function deriveKey(code: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    bs(strToBytes(normalizeCode(code))),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: bs(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface EncryptResult {
  pkg: EncryptedPackage;
  code: string;
}

/**
 * Encrypts a session payload with a freshly generated one-time code.
 * The origin is bound as additional authenticated data (AAD) so a tampered
 * package header will fail to decrypt (origin confusion protection).
 */
export async function encryptPayload(
  payload: SessionPayload,
  ttlMs: number,
): Promise<EncryptResult> {
  const code = generateTransferCode();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(code, salt);
  const origin = payload.source.origin;
  const now = Date.now();

  const plaintext = strToBytes(JSON.stringify(payload));
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: bs(iv), additionalData: bs(strToBytes(origin)) },
    key,
    bs(plaintext),
  );

  const pkg: EncryptedPackage = {
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    alg: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    createdAt: now,
    expiresAt: now + ttlMs,
    transferId: randomId(),
    origin,
    ciphertext: bytesToBase64(new Uint8Array(cipherBuf)),
  };
  return { pkg, code };
}

export class DecryptError extends Error {}

/** Decrypts and validates an encrypted package. Throws DecryptError on failure. */
export async function decryptPayload(
  pkg: EncryptedPackage,
  code: string,
): Promise<SessionPayload> {
  if (pkg.format !== PACKAGE_FORMAT) throw new DecryptError('Unrecognized package format.');
  if (Date.now() > pkg.expiresAt) throw new DecryptError('This transfer has expired.');

  const salt = base64ToBytes(pkg.salt);
  const iv = base64ToBytes(pkg.iv);
  const key = await deriveKey(code, salt);
  let plainBuf: ArrayBuffer;
  try {
    plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bs(iv), additionalData: bs(strToBytes(pkg.origin)) },
      key,
      bs(base64ToBytes(pkg.ciphertext)),
    );
  } catch {
    throw new DecryptError('Incorrect code or corrupted package.');
  }
  const payload = JSON.parse(bytesToStr(new Uint8Array(plainBuf))) as SessionPayload;
  if (payload.source?.origin !== pkg.origin) {
    throw new DecryptError('Origin integrity check failed.');
  }
  return payload;
}
