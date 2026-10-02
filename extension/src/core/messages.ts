// Message protocol between popup and background service worker.
// Progress is streamed over a long-lived Port so the popup UI never freezes.

import {
  ConflictStrategy,
  EncryptedPackage,
  PayloadSummary,
  TransferComponent,
  TransferComponentResult,
  TransferStatus,
  VerificationReport,
} from './types';

export const PORT_NAME = 'session-transfer-op';

/** Ciphertext characters per port message; well under the 64 MiB port limit. */
export const CIPHERTEXT_CHUNK_CHARS = 8 * 1024 * 1024;

/** Popup -> background */
export type OpRequest =
  | { type: 'detect' }
  // A package over the 64 MiB port limit is streamed in `packageChunk` messages first; the
  // following inspect/restore then carries an empty `packageText`.
  | { type: 'packageChunk'; data: string }
  | { type: 'collect'; requireCode?: boolean }
  | { type: 'inspect'; packageText: string; code?: string }
  | {
      type: 'restore';
      packageText: string;
      code?: string;
      conflict?: ConflictStrategy;
      confirmOriginMismatch?: boolean;
    };

/** background -> popup */
export type OpResponse =
  | { type: 'detected'; info: DetectInfo }
  | { type: 'progress'; component: TransferComponent; status: TransferStatus; itemCount?: number }
  // A chrome.runtime.Port message is capped at 64 MiB, so a large package's ciphertext is
  // streamed in `ciphertextChunk` messages first and `collected` carries the rest of it.
  | { type: 'ciphertextChunk'; data: string }
  | {
      type: 'collected';
      pkg: Omit<EncryptedPackage, 'ciphertext'>;
      /** The separate transfer code; null when the package is not encrypted. */
      code: string | null;
      results: TransferComponentResult[];
      unsupported: string[];
      sizeBytes: number;
    }
  | { type: 'inspected'; summary: PayloadSummary }
  // The package needs a transfer code and none was given; nothing was decrypted.
  | { type: 'codeRequired'; expiresAt: number; origin: string }
  | { type: 'conflict'; destOrigin: string; counts: Record<TransferComponent, number> }
  | { type: 'originMismatch'; packageOrigin: string; destOrigin: string }
  | { type: 'restored'; report: VerificationReport }
  | { type: 'error'; message: string };

export interface DetectInfo {
  supported: boolean;
  origin: string;
  url: string;
  title: string;
  hasSession: boolean;
  counts: Record<TransferComponent, number>;
  reason?: string;
}
