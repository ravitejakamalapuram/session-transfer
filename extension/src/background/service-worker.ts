// Background service worker: orchestrates detect / collect / inspect / restore.
// All heavy work happens here (never in the popup) and progress is streamed back
// over a long-lived Port so the popup UI stays responsive.

import { pageCollect, pageDetect, pageRestore } from './injected';
import { collectCookies, countCookies, restoreCookies } from './cookie-manager';
import { getActiveTab, originOf, reloadTab, resolveDestinationTab } from './tab-utils';
import { createBackup, purgeExpiredBackups } from './extension-storage';
import { decryptPayload, encryptPayload } from '../core/crypto';
import { logger } from '../core/logger';
import { CIPHERTEXT_CHUNK_CHARS, DetectInfo, OpRequest, OpResponse, PORT_NAME } from '../core/messages';
import {
  CapturedCache,
  CapturedIDBDatabase,
  ConflictStrategy,
  EncryptedPackage,
  NON_TRANSFERABLE,
  PACKAGE_FORMAT,
  PACKAGE_VERSION,
  PayloadSummary,
  SessionPayload,
  TransferComponent,
  TransferComponentResult,
  VerificationLine,
} from '../core/types';

const TRANSFER_TTL_MS = 5 * 60 * 1000; // short expiration (replay window)
const MAX_PACKAGE_BYTES = 100 * 1024 * 1024; // 100 MB hard ceiling
const LARGE_WARN_BYTES = 20 * 1024 * 1024;

type PagedFunc = typeof pageDetect | typeof pageCollect | typeof pageRestore;

async function inject<T>(tabId: number, func: PagedFunc, arg?: unknown): Promise<T> {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    func: func as (...a: unknown[]) => unknown,
    args: arg === undefined ? [] : [arg],
  });
  return res?.result as T;
}

/** Returns false when the message could not be delivered (port closed, or message too large). */
function send(port: chrome.runtime.Port, msg: OpResponse): boolean {
  try {
    port.postMessage(msg);
    return true;
  } catch (e) {
    logger.error('Could not send message to popup', { type: msg.type, reason: (e as Error).message });
    return false;
  }
}

// ---------------------------------------------------------------- detect
async function handleDetect(port: chrome.runtime.Port) {
  const tab = await getActiveTab();
  const origin = originOf(tab?.url);
  if (!tab || !origin) {
    const info: DetectInfo = {
      supported: false,
      origin: '',
      url: tab?.url ?? '',
      title: tab?.title ?? '',
      hasSession: false,
      counts: { cookies: 0, localStorage: 0, sessionStorage: 0, indexedDB: 0, cacheStorage: 0 },
      reason: 'Open a normal http(s) website tab to transfer its session.',
    };
    send(port, { type: 'detected', info });
    return;
  }
  const cookies = await countCookies(tab.url!);
  let page = { localStorage: 0, sessionStorage: 0, indexedDB: 0, cacheStorage: 0 };
  try {
    page = await inject(tab.id!, pageDetect);
  } catch {
    /* cannot inject (e.g. blocked page); counts stay 0 */
  }
  const counts = { cookies, ...page };
  const total = cookies + page.localStorage + page.sessionStorage + page.indexedDB + page.cacheStorage;
  const info: DetectInfo = {
    supported: true,
    origin,
    url: tab.url!,
    title: tab.title ?? origin,
    hasSession: total > 0,
    counts,
  };
  send(port, { type: 'detected', info });
}

// ---------------------------------------------------------------- collect
function pageResultStatus(comp: TransferComponent, raw: any): TransferComponentResult {
  if (!raw) return { component: comp, status: 'failed', error: 'No result', itemCount: 0 };
  if (comp === 'localStorage' || comp === 'sessionStorage') {
    return { component: comp, status: raw.status, itemCount: raw.items?.length ?? 0, error: raw.error };
  }
  if (comp === 'indexedDB') {
    const count = (raw.dbs ?? []).reduce((n: number, d: any) => n + d.stores.reduce((m: number, s: any) => m + s.records.length, 0), 0);
    return { component: comp, status: raw.status, itemCount: count, error: raw.error };
  }
  const count = (raw.caches ?? []).reduce((n: number, c: any) => n + c.entries.length, 0);
  return { component: comp, status: raw.status, itemCount: count, error: raw.error };
}

async function handleCollect(port: chrome.runtime.Port) {
  const tab = await getActiveTab();
  const origin = originOf(tab?.url);
  if (!tab || !origin || tab.id == null) {
    send(port, { type: 'error', message: 'No transferable website in the active tab.' });
    return;
  }
  const results: TransferComponentResult[] = [];

  // Cookies
  send(port, { type: 'progress', component: 'cookies', status: 'running' });
  let cookies: SessionPayload['state']['cookies'] = [];
  try {
    cookies = await collectCookies(tab.url!);
    const r: TransferComponentResult = { component: 'cookies', status: 'success', itemCount: cookies.length };
    results.push(r);
    send(port, { type: 'progress', component: 'cookies', status: 'success', itemCount: cookies.length });
  } catch {
    results.push({ component: 'cookies', status: 'failed', error: 'Cookie read failed', itemCount: 0 });
    send(port, { type: 'progress', component: 'cookies', status: 'failed', itemCount: 0 });
  }

  // Page storage (single injection returns all four)
  for (const c of ['localStorage', 'sessionStorage', 'indexedDB', 'cacheStorage'] as TransferComponent[]) {
    send(port, { type: 'progress', component: c, status: 'running' });
  }
  let page: any = null;
  try {
    page = await inject(tab.id, pageCollect);
  } catch (e) {
    for (const c of ['localStorage', 'sessionStorage', 'indexedDB', 'cacheStorage'] as TransferComponent[]) {
      results.push({ component: c, status: 'failed', error: 'Page injection blocked', itemCount: 0 });
      send(port, { type: 'progress', component: c, status: 'failed', itemCount: 0 });
    }
  }

  const localStorageItems: [string, string][] = page?.localStorage?.items ?? [];
  const sessionStorageItems: [string, string][] = page?.sessionStorage?.items ?? [];
  const indexedDB: CapturedIDBDatabase[] = page?.indexedDB?.dbs ?? [];
  const cacheStorage: CapturedCache[] = page?.cacheStorage?.caches ?? [];

  if (page) {
    for (const c of ['localStorage', 'sessionStorage', 'indexedDB', 'cacheStorage'] as TransferComponent[]) {
      const r = pageResultStatus(c, page[c]);
      results.push(r);
      send(port, { type: 'progress', component: c, status: r.status, itemCount: r.itemCount });
    }
  }

  const payload: SessionPayload = {
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    createdAt: Date.now(),
    source: {
      browser: 'Chrome',
      origin,
      userAgent: navigator.userAgent,
      title: tab.title ?? origin,
      url: tab.url!,
    },
    state: { cookies, localStorage: localStorageItems, sessionStorage: sessionStorageItems, indexedDB, cacheStorage },
    results,
    unsupported: NON_TRANSFERABLE,
  };

  const sizeBytes = new Blob([JSON.stringify(payload)]).size;
  if (sizeBytes > MAX_PACKAGE_BYTES) {
    send(port, { type: 'error', message: `Session too large (${(sizeBytes / 1048576).toFixed(0)} MB). Exceeds 100 MB limit.` });
    return;
  }

  const { pkg, code } = await encryptPayload(payload, TRANSFER_TTL_MS);
  logger.info('Session collected & encrypted', { origin, sizeBytes, components: results.length, large: sizeBytes > LARGE_WARN_BYTES });
  const { ciphertext, ...header } = pkg;
  for (let i = 0; i < ciphertext.length; i += CIPHERTEXT_CHUNK_CHARS) {
    const data = ciphertext.slice(i, i + CIPHERTEXT_CHUNK_CHARS);
    if (!send(port, { type: 'ciphertextChunk', data })) return; // popup is gone; nobody to tell
  }
  if (!send(port, { type: 'collected', pkg: header, code, results, unsupported: NON_TRANSFERABLE, sizeBytes })) {
    send(port, { type: 'error', message: 'The session was collected but could not be handed to the window. Please try again.' });
  }
}

// ---------------------------------------------------------------- inspect
function parsePackage(text: string): EncryptedPackage {
  const pkg = JSON.parse(text) as EncryptedPackage;
  if (pkg.format !== PACKAGE_FORMAT) throw new Error('Unrecognized package format.');
  return pkg;
}

function summarize(payload: SessionPayload, pkg: EncryptedPackage): PayloadSummary {
  const idbCount = payload.state.indexedDB.reduce((n, d) => n + d.stores.reduce((m, s) => m + s.records.length, 0), 0);
  const cacheCount = payload.state.cacheStorage.reduce((n, c) => n + c.entries.length, 0);
  return {
    origin: payload.source.origin,
    createdAt: payload.createdAt,
    expiresAt: pkg.expiresAt,
    counts: {
      cookies: payload.state.cookies.length,
      localStorage: payload.state.localStorage.length,
      sessionStorage: payload.state.sessionStorage.length,
      indexedDB: idbCount,
      cacheStorage: cacheCount,
    },
    results: payload.results,
    unsupported: payload.unsupported,
  };
}

async function handleInspect(port: chrome.runtime.Port, req: Extract<OpRequest, { type: 'inspect' }>) {
  try {
    const pkg = parsePackage(req.packageText);
    const payload = await decryptPayload(pkg, req.code);
    send(port, { type: 'inspected', summary: summarize(payload, pkg) });
  } catch (e) {
    send(port, { type: 'error', message: (e as Error).message || 'Could not read package.' });
  }
}

// ---------------------------------------------------------------- restore
async function collectDestinationPayload(tab: chrome.tabs.Tab, origin: string): Promise<SessionPayload> {
  const cookies = await collectCookies(tab.url!).catch(() => []);
  let page: any = null;
  try {
    page = await inject(tab.id!, pageCollect);
  } catch {
    /* ignore */
  }
  return {
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    createdAt: Date.now(),
    source: { browser: 'Chrome', origin, userAgent: navigator.userAgent, title: tab.title ?? origin, url: tab.url! },
    state: {
      cookies,
      localStorage: page?.localStorage?.items ?? [],
      sessionStorage: page?.sessionStorage?.items ?? [],
      indexedDB: page?.indexedDB?.dbs ?? [],
      cacheStorage: page?.cacheStorage?.caches ?? [],
    },
    results: [],
    unsupported: [],
  };
}

async function handleRestore(port: chrome.runtime.Port, req: Extract<OpRequest, { type: 'restore' }>) {
  let payload: SessionPayload;
  let pkg: EncryptedPackage;
  try {
    pkg = parsePackage(req.packageText);
    payload = await decryptPayload(pkg, req.code);
  } catch (e) {
    send(port, { type: 'error', message: (e as Error).message || 'Could not read package.' });
    return;
  }
  const origin = payload.source.origin;

  // Origin confirmation: active tab differs from the package origin.
  const active = await getActiveTab();
  const activeOrigin = originOf(active?.url);
  if (activeOrigin && activeOrigin !== origin && !req.confirmOriginMismatch) {
    send(port, { type: 'originMismatch', packageOrigin: origin, destOrigin: activeOrigin });
    return;
  }

  let tab: chrome.tabs.Tab;
  try {
    tab = await resolveDestinationTab(origin);
  } catch {
    send(port, { type: 'error', message: 'Could not open the destination tab.' });
    return;
  }
  if (tab.id == null) {
    send(port, { type: 'error', message: 'Destination tab unavailable.' });
    return;
  }

  // Conflict detection: does the destination already have a session?
  const existingCookies = await countCookies(tab.url ?? origin).catch(() => 0);
  let existingPage = { localStorage: 0, sessionStorage: 0, indexedDB: 0, cacheStorage: 0 };
  try {
    existingPage = await inject(tab.id, pageDetect);
  } catch {
    /* ignore */
  }
  const existingTotal = existingCookies + existingPage.localStorage + existingPage.sessionStorage + existingPage.indexedDB + existingPage.cacheStorage;

  if (existingTotal > 0 && !req.conflict) {
    send(port, {
      type: 'conflict',
      destOrigin: origin,
      counts: { cookies: existingCookies, ...existingPage },
    });
    return;
  }
  const strategy: ConflictStrategy = req.conflict ?? 'replace';
  if (strategy === 'cancel') {
    send(port, { type: 'error', message: 'Transfer cancelled. Destination was not changed.' });
    return;
  }

  // Optional encrypted backup of current destination state.
  let backedUp = false;
  if (req.backup && existingTotal > 0) {
    try {
      const dest = await collectDestinationPayload(tab, origin);
      await createBackup(dest);
      backedUp = true;
    } catch {
      /* backup is best-effort */
    }
  }

  const applyStrategy = strategy === 'merge' ? 'merge' : 'replace';

  // Apply cookies (extension context) then page storage (page context).
  const cookieRes = await restoreCookies(payload.state.cookies, applyStrategy, tab.url ?? origin + '/').catch(() => ({ applied: 0, failed: payload.state.cookies.length }));
  let pageRes: any = null;
  try {
    pageRes = await inject(tab.id, pageRestore, {
      state: {
        localStorage: payload.state.localStorage,
        sessionStorage: payload.state.sessionStorage,
        indexedDB: payload.state.indexedDB,
        cacheStorage: payload.state.cacheStorage,
      },
      strategy: applyStrategy,
    });
  } catch {
    /* page write failed */
  }

  // Reload so the app initializes with the restored cookies + storage.
  let reloaded = false;
  try {
    await reloadTab(tab.id);
    reloaded = true;
  } catch {
    /* ignore */
  }

  // Verify by re-reading counts (never values).
  const verifyCookies = await countCookies(tab.url ?? origin).catch(() => 0);
  let verifyPage = { localStorage: 0, sessionStorage: 0, indexedDB: 0, cacheStorage: 0 };
  try {
    verifyPage = await inject(tab.id, pageDetect);
  } catch {
    /* ignore */
  }

  const expectedIdbDbs = payload.state.indexedDB.length;
  const expectedCaches = payload.state.cacheStorage.length;
  const lines: VerificationLine[] = [
    line('cookies', payload.state.cookies.length, verifyCookies),
    line('localStorage', payload.state.localStorage.length, verifyPage.localStorage),
    line('sessionStorage', payload.state.sessionStorage.length, verifyPage.sessionStorage),
    line('indexedDB', expectedIdbDbs, verifyPage.indexedDB),
    line('cacheStorage', expectedCaches, verifyPage.cacheStorage),
  ];

  const results: TransferComponentResult[] = [
    { component: 'cookies', status: cookieRes.failed ? 'partial' : 'success', itemCount: cookieRes.applied, error: cookieRes.failed ? `${cookieRes.failed} cookie(s) could not be set` : undefined },
    { component: 'localStorage', status: pageRes?.localStorage?.error ? 'failed' : 'success', itemCount: pageRes?.localStorage?.applied ?? 0, error: pageRes?.localStorage?.error },
    { component: 'sessionStorage', status: pageRes?.sessionStorage?.error ? 'failed' : 'success', itemCount: pageRes?.sessionStorage?.applied ?? 0, error: pageRes?.sessionStorage?.error },
    { component: 'indexedDB', status: pageRes?.indexedDB?.error ? 'failed' : 'success', itemCount: pageRes?.indexedDB?.applied ?? 0, error: pageRes?.indexedDB?.error },
    { component: 'cacheStorage', status: pageRes?.cacheStorage?.error ? 'failed' : 'success', itemCount: pageRes?.cacheStorage?.applied ?? 0, error: pageRes?.cacheStorage?.error },
  ];

  const passed = lines.filter((l) => l.expected > 0).every((l) => l.actual >= l.expected);
  logger.info('Session restored', { origin, passed, reloaded, backedUp });
  send(port, { type: 'restored', report: { lines, passed, results, reloaded }, backedUp });
}

function line(component: TransferComponent, expected: number, actual: number): VerificationLine {
  return { component, expected, actual, ok: expected === 0 ? true : actual >= expected };
}

// ---------------------------------------------------------------- wiring
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;
  port.onMessage.addListener(async (msg: OpRequest) => {
    try {
      switch (msg.type) {
        case 'detect': await handleDetect(port); break;
        case 'collect': await handleCollect(port); break;
        case 'inspect': await handleInspect(port, msg); break;
        case 'restore': await handleRestore(port, msg); break;
      }
    } catch (e) {
      send(port, { type: 'error', message: 'Unexpected error during operation.' });
      logger.error('Operation failed', { op: (msg as OpRequest).type });
    }
  });
});

chrome.runtime.onInstalled.addListener(() => {
  purgeExpiredBackups().catch(() => undefined);
});
