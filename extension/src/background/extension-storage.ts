// Encrypted, auto-expiring local backups of destination state (created before an
// overwrite). Stored in chrome.storage.local, never uploaded, purged on expiry.

import { encryptPayload } from '../core/crypto';
import { SessionPayload } from '../core/types';
import { logger } from '../core/logger';

const BACKUP_PREFIX = 'backup:';
const BACKUP_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface StoredBackup {
  pkg: unknown;
  code: string | null;
  origin: string;
  createdAt: number;
  expiresAt: number;
}

export async function purgeExpiredBackups(): Promise<void> {
  const all = await chrome.storage.local.get(null);
  const now = Date.now();
  const remove: string[] = [];
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith(BACKUP_PREFIX) && (v as StoredBackup).expiresAt < now) remove.push(k);
  }
  if (remove.length) await chrome.storage.local.remove(remove);
}

/** Encrypts + stores a backup of the given destination payload. */
export async function createBackup(payload: SessionPayload): Promise<void> {
  await purgeExpiredBackups();
  const { pkg, code } = await encryptPayload(payload, BACKUP_TTL_MS, 'code');
  const key = `${BACKUP_PREFIX}${payload.source.origin}:${Date.now()}`;
  const record: StoredBackup = {
    pkg,
    code, // decryption key kept locally alongside the backup (backups are recovery-only)
    origin: payload.source.origin,
    createdAt: Date.now(),
    expiresAt: Date.now() + BACKUP_TTL_MS,
  };
  await chrome.storage.local.set({ [key]: record });
  logger.info('Created encrypted destination backup', { origin: payload.source.origin });
}
