// Cookie collection & restoration via chrome.cookies (the only way to reach
// HttpOnly / Secure cookies). Only cookies relevant to the selected origin/URL
// are captured -- we use getAll({ url }) which returns exactly the cookies that
// would be sent to that URL (host-only + applicable parent-domain cookies),
// avoiding leaking unrelated sibling-subdomain cookies.

import { CapturedCookie } from '../core/types';

export async function collectCookies(url: string): Promise<CapturedCookie[]> {
  const cookies = await chrome.cookies.getAll({ url });
  return cookies.map((c) => ({
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
  }));
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
}

export async function restoreCookies(
  cookies: CapturedCookie[],
  strategy: 'replace' | 'merge',
  originUrl: string,
): Promise<CookieRestoreResult> {
  let applied = 0;
  let failed = 0;

  if (strategy === 'replace') {
    // Remove existing cookies for the destination URL before writing.
    try {
      const existing = await chrome.cookies.getAll({ url: originUrl });
      for (const c of existing) {
        const host = c.domain.replace(/^\./, '');
        const scheme = c.secure ? 'https://' : 'http://';
        await chrome.cookies.remove({ url: `${scheme}${host}${c.path || '/'}`, name: c.name }).catch(() => undefined);
      }
    } catch {
      /* non-fatal */
    }
  }

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

    try {
      const set = await chrome.cookies.set(details);
      if (set) applied++;
      else failed++;
    } catch {
      failed++;
    }
  }
  return { applied, failed };
}
