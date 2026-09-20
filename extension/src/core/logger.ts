// Safe logger. Sensitive values (cookies, tokens, storage values) must NEVER be
// passed here. Only metadata such as counts, component names and non-secret notes.

type LogMeta = Record<string, string | number | boolean | undefined>;

const PREFIX = '[SessionTransfer]';

function scrub(meta?: LogMeta): LogMeta | undefined {
  if (!meta) return undefined;
  // Defensive: drop anything that looks like it could carry a value payload.
  const out: LogMeta = {};
  for (const [k, v] of Object.entries(meta)) {
    if (/(value|token|cookie|secret|password|payload|ciphertext|key)/i.test(k)) {
      out[k] = '[redacted]';
    } else {
      out[k] = v;
    }
  }
  return out;
}

export const logger = {
  info(message: string, meta?: LogMeta) {
    console.info(PREFIX, message, scrub(meta) ?? '');
  },
  warn(message: string, meta?: LogMeta) {
    console.warn(PREFIX, message, scrub(meta) ?? '');
  },
  error(message: string, meta?: LogMeta) {
    // Never pass raw error objects that may embed values; use a short note.
    console.error(PREFIX, message, scrub(meta) ?? '');
  },
};
