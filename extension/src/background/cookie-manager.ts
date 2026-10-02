// Cookie collection & restoration via chrome.cookies (the only way to reach
// HttpOnly / Secure cookies). Only cookies relevant to the selected origin/URL
// are captured -- we use getAll({ url }) which returns exactly the cookies that
// would be sent to that URL (host-only + applicable parent-domain cookies),
// avoiding leaking unrelated sibling-subdomain cookies.

import { CapturedCookie } from '../core/types';

type CookieFilter = { url?: string; domain?: string };

/** getAll that also returns partitioned (CHIPS) cookies; falls back on a Chrome that rejects the key. */
async function getAllCookies(filter: CookieFilter): Promise<chrome.cookies.Cookie[]> {
  try {
    return await chrome.cookies.getAll({ ...filter, partitionKey: {} } as chrome.cookies.GetAllDetails);
  } catch {
    return chrome.cookies.getAll(filter);
  }
}

const cookieId = (c: { name: string; domain: string; path: string; partitionKey?: { topLevelSite: string } }) =>
  `${c.name}|${c.domain.replace(/^\./, '')}|${c.path}|${c.partitionKey?.topLevelSite ?? ''}`;

/**
 * Cookies the page at `url` would send, plus (optionally) every cookie of `extraDomains` — host
 * names the user typed, for sign-in on a sibling site. Nothing else is read.
 */
export async function collectCookies(url: string, extraDomains: string[] = []): Promise<CapturedCookie[]> {
  const lists = await Promise.all([getAllCookies({ url }), ...extraDomains.map((domain) => getAllCookies({ domain }))]);
  const seen = new Set<string>();
  const out: CapturedCookie[] = [];
  for (const c of lists.flat()) {
    const id = `${cookieId(c as never)}|${c.storeId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: c.sameSite,
      expirationDate: c.expirationDate,
      hostOnly: c.hostOnly,
      session: c.session,
      storeId: c.storeId,
      ...((c as { partitionKey?: CapturedCookie['partitionKey'] }).partitionKey
        ? { partitionKey: (c as { partitionKey?: CapturedCookie['partitionKey'] }).partitionKey }
        : {}),
    });
  }
  return out;
}

export async function countCookies(url: string): Promise<number> {
  try {
    return (await chrome.cookies.getAll({ url })).length;
  } catch {
    return 0;
  }
}

/** Rebuilds a set-URL for a captured cookie from its domain + path + secure flag. */
function cookieUrl(c: CapturedCookie): string {
  const host = c.domain.replace(/^\./, '');
  const scheme = c.secure ? 'https://' : 'http://';
  return `${scheme}${host}${c.path || '/'}`;
}

export interface CookieRestoreResult {
  applied: number;
  failed: number;
  /** The cookies that were actually written. */
  written: CapturedCookie[];
}

/** How many of `cookies` exist (same name, domain, path and partition) in the browser right now. */
export async function countMatchingCookies(cookies: CapturedCookie[]): Promise<number> {
  const hosts = [...new Set(cookies.map((c) => c.domain.replace(/^\./, '')))];
  const lists = await Promise.all(hosts.map((domain) => getAllCookies({ domain }).catch(() => [])));
  const have = new Set(lists.flat().map((c) => cookieId(c as never)));
  return cookies.filter((c) => have.has(cookieId(c))).length;
}

export async function restoreCookies(
  cookies: CapturedCookie[],
  strategy: 'replace' | 'merge',
  originUrl: string,
): Promise<CookieRestoreResult> {
  let applied = 0;
  let failed = 0;
  const written: CapturedCookie[] = [];
  // Replace: remember what was there, write the new cookies first, then remove only the leftovers.
  const existing = strategy === 'replace' ? await chrome.cookies.getAll({ url: originUrl }).catch(() => []) : [];

  for (const c of cookies) {
    const details: chrome.cookies.SetDetails = {
      url: cookieUrl(c),
      name: c.name,
      value: c.value,
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: c.sameSite,
    };
    // host-only cookies must NOT carry a domain; domain cookies must.
    if (!c.hostOnly) details.domain = c.domain;
    if (!c.session && c.expirationDate) details.expirationDate = c.expirationDate;
    if (c.partitionKey) (details as { partitionKey?: unknown }).partitionKey = c.partitionKey;

    try {
      const set = await chrome.cookies.set(details);
      if (set) {
        applied++;
        written.push(c);
      } else failed++;
    } catch {
      failed++;
    }
  }

  const keep = new Set(cookies.map(cookieId));
  for (const c of existing) {
    if (keep.has(cookieId(c))) continue;
    const scheme = c.secure ? 'https://' : 'http://';
    await chrome.cookies.remove({ url: `${scheme}${c.domain.replace(/^\./, '')}${c.path || '/'}`, name: c.name }).catch(() => undefined);
  }
  return { applied, failed, written };
}
