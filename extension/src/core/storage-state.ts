// Pure helpers for (a) exporting a session as a Playwright storageState file and (b) validating the
// extra cookie domains a user may add to a transfer. No chrome.* calls, so they are unit-tested.

import { CapturedCookie } from './types';

export interface PlaywrightCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  /** Unix seconds, or -1 for a session cookie. */
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
}

export interface PlaywrightStorageState {
  cookies: PlaywrightCookie[];
  origins: { origin: string; localStorage: { name: string; value: string }[] }[];
}

const SAME_SITE: Record<string, PlaywrightCookie['sameSite']> = {
  no_restriction: 'None',
  lax: 'Lax',
  strict: 'Strict',
  unspecified: 'Lax', // what Chrome applies to a cookie without SameSite
};

export function toPlaywrightCookie(c: CapturedCookie): PlaywrightCookie {
  return {
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path || '/',
    expires: c.session || !c.expirationDate ? -1 : Math.floor(c.expirationDate),
    httpOnly: c.httpOnly,
    secure: c.secure,
    sameSite: SAME_SITE[c.sameSite] ?? 'Lax',
  };
}

/**
 * Playwright storageState for one origin. Partitioned (CHIPS) cookies are left out: older Playwright
 * versions cannot load them. `skippedPartitioned` says how many were left out.
 */
export function buildStorageState(
  origin: string,
  cookies: CapturedCookie[],
  localStorageItems: [string, string][],
): { state: PlaywrightStorageState; skippedPartitioned: number } {
  const plain = cookies.filter((c) => !c.partitionKey);
  return {
    state: {
      cookies: plain.map(toPlaywrightCookie),
      origins: localStorageItems.length
        ? [{ origin, localStorage: localStorageItems.map(([name, value]) => ({ name, value })) }]
        : [],
    },
    skippedPartitioned: cookies.length - plain.length,
  };
}

export const MAX_EXTRA_DOMAINS = 5;
const HOST = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;

/**
 * Parses "accounts.example.com, login.example.org" into host names. Only plain host names are
 * accepted (no scheme, path, port or wildcard); a leading dot is dropped. Anything else is reported
 * in `invalid` and never used.
 */
export function parseExtraDomains(raw: string): { domains: string[]; invalid: string[] } {
  const domains: string[] = [];
  const invalid: string[] = [];
  for (const part of raw.split(/[\s,;]+/)) {
    const host = part.trim().toLowerCase().replace(/^\./, '');
    if (!host) continue;
    if (!HOST.test(host)) invalid.push(part.trim());
    else if (!domains.includes(host)) domains.push(host);
  }
  if (domains.length > MAX_EXTRA_DOMAINS) {
    invalid.push(...domains.splice(MAX_EXTRA_DOMAINS).map((d) => `${d} (limit ${MAX_EXTRA_DOMAINS})`));
  }
  return { domains, invalid };
}
