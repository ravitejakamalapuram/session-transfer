// Shared domain types for the Session Transfer extension.

export const PACKAGE_FORMAT = 'browser-session-transfer' as const;
export const PACKAGE_VERSION = 2 as const;
/** Oldest package version the receiver still reads (v1 = transfer code only). */
export const LEGACY_PACKAGE_VERSION = 1 as const;

/**
 * 'none': plain package, not encrypted (default). 'code': AES-256-GCM with a key derived from a
 * separate transfer code. 'embedded' is only read, for packages made by v1.2.x.
 */
export type KeyMode = 'none' | 'embedded' | 'code';

/** Per-storage-mechanism outcome. Never contains secret values. */
export type TransferStatus = 'success' | 'partial' | 'failed' | 'unsupported' | 'pending' | 'running';

export type TransferComponent =
  | 'cookies'
  | 'localStorage'
  | 'sessionStorage'
  | 'indexedDB'
  | 'cacheStorage';

export interface TransferComponentResult {
  component: TransferComponent;
  status: TransferStatus;
  itemCount?: number;
  /** Non-sensitive, human readable note (never a stored value). */
  error?: string;
}

/** A single cookie captured for an origin. */
export interface CapturedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: chrome.cookies.SameSiteStatus;
  expirationDate?: number;
  hostOnly: boolean;
  session: boolean;
  storeId?: string;
}

/** A recursively-tagged, structured-clone-aware serialized value node. */
export interface SNode {
  t:
    | 'prim'
    | 'null'
    | 'undef'
    | 'date'
    | 'ab'
    | 'ta'
    | 'blob'
    | 'map'
    | 'set'
    | 'arr'
    | 'obj'
    | 'unsupported';
  v?: unknown;
  /** For typed arrays: constructor name (e.g. "Uint8Array"). */
  ctor?: string;
  /** For blobs: mime type. */
  mime?: string;
}

export interface CapturedIDBIndex {
  name: string;
  keyPath: string | string[] | null;
  unique: boolean;
  multiEntry: boolean;
}

export interface CapturedIDBRecord {
  /** Serialized key (out-of-line keys preserved). */
  key: SNode;
  /** Serialized value. */
  value: SNode;
}

export interface CapturedIDBStore {
  name: string;
  keyPath: string | string[] | null;
  autoIncrement: boolean;
  indexes: CapturedIDBIndex[];
  records: CapturedIDBRecord[];
}

export interface CapturedIDBDatabase {
  name: string;
  version: number;
  stores: CapturedIDBStore[];
}

export interface CapturedCacheEntry {
  reqUrl: string;
  reqMethod: string;
  reqHeaders: [string, string][];
  status: number;
  statusText: string;
  respHeaders: [string, string][];
  /** base64-encoded response body. */
  bodyB64: string;
  supported: boolean;
}

export interface CapturedCache {
  name: string;
  entries: CapturedCacheEntry[];
}

/** The decrypted session payload. Highly sensitive: never logged. */
export interface SessionPayload {
  format: typeof PACKAGE_FORMAT;
  version: number;
  createdAt: number;
  source: {
    browser: string;
    origin: string;
    userAgent: string;
    title: string;
    url: string;
  };
  state: {
    cookies: CapturedCookie[];
    localStorage: [string, string][];
    sessionStorage: [string, string][];
    indexedDB: CapturedIDBDatabase[];
    cacheStorage: CapturedCache[];
  };
  results: TransferComponentResult[];
  unsupported: string[];
}

/** The encrypted, on-disk / on-wire package. No plaintext secrets. */
export interface EncryptedPackage {
  format: typeof PACKAGE_FORMAT;
  /** 2 for new packages; 1 (code only, AAD = origin) is still read. */
  version: number;
  /** v2 only. v1 packages are always 'code'. */
  keyMode?: KeyMode;
  alg: 'AES-256-GCM' | 'none';
  /** base64 AES key, 32 bytes. Present only when keyMode = 'embedded'. */
  key?: string;
  kdf?: 'PBKDF2-SHA256'; // code mode / v1
  iterations?: number; // code mode / v1
  salt?: string; // base64, code mode / v1
  iv: string; // base64 ('' when keyMode = 'none')
  createdAt: number;
  expiresAt: number;
  transferId: string;
  /** Authenticated (AAD) but not encrypted; tampering breaks decryption (code mode / v1). */
  origin: string;
  ciphertext: string; // base64 (the plain payload JSON when keyMode = 'none')
}

/** Non-sensitive summary shown to the user before applying a transfer. */
export interface PayloadSummary {
  origin: string;
  createdAt: number;
  expiresAt: number;
  counts: Record<TransferComponent, number>;
  results: TransferComponentResult[];
  unsupported: string[];
}

export type ConflictStrategy = 'replace' | 'merge' | 'cancel';

export interface VerificationLine {
  component: TransferComponent;
  expected: number;
  actual: number;
  ok: boolean;
}

export interface VerificationReport {
  lines: VerificationLine[];
  passed: boolean;
  results: TransferComponentResult[];
  reloaded: boolean;
}

/** Non-transferable state the product is explicitly honest about. */
export const NON_TRANSFERABLE: string[] = [
  'WebAuthn / passkeys (hardware & platform authenticators)',
  'Hardware-backed credentials (TPM / Secure Enclave)',
  'OS credential stores',
  'TLS / channel-bound session state',
  'Service-worker runtime memory',
  'Active JavaScript in-memory state',
  'Browser-managed encryption keys & profile identity',
];
