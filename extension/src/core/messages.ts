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

/** Popup -> background */
export type OpRequest =
  | { type: 'detect' }
  | { type: 'collect' }
  | { type: 'inspect'; packageText: string; code: string }
  | {
      type: 'restore';
      packageText: string;
      code: string;
      conflict?: ConflictStrategy;
      backup?: boolean;
      confirmOriginMismatch?: boolean;
    };

/** background -> popup */
export type OpResponse =
  | { type: 'detected'; info: DetectInfo }
  | { type: 'progress'; component: TransferComponent; status: TransferStatus; itemCount?: number }
  | {
      type: 'collected';
      pkg: EncryptedPackage;
      code: string;
      results: TransferComponentResult[];
      unsupported: string[];
      sizeBytes: number;
    }
  | { type: 'inspected'; summary: PayloadSummary }
  | { type: 'conflict'; destOrigin: string; counts: Record<TransferComponent, number> }
  | { type: 'originMismatch'; packageOrigin: string; destOrigin: string }
  | { type: 'restored'; report: VerificationReport; backedUp: boolean }
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
