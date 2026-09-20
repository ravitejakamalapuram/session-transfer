// Heuristic secret classification. Used ONLY to ensure sensitive keys are never
// displayed or logged. It never blocks a transfer and never inspects values.

const SENSITIVE_KEY_PATTERNS = [
  /token/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /authorization/i,
  /\bjwt\b/i,
  /session/i,
  /password/i,
  /passwd/i,
  /secret/i,
  /api[_-]?key/i,
  /credential/i,
  /bearer/i,
  /csrf/i,
  /\bauth\b/i,
];

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((re) => re.test(key));
}

/** Mask a value for any (rare) display need. Never returns the real value. */
export function maskValue(value: string): string {
  if (value.length <= 6) return '••••••';
  return `${value.slice(0, 2)}••••••${value.slice(-2)} (${value.length} chars)`;
}
