// Background service worker: orchestrates detect / collect / inspect / restore.
// All heavy work happens here (never in the popup) and progress is streamed back
// over a long-lived Port so the popup UI stays responsive.

import { pageCollect, pageDetect, pageLocalStorage, pageRestore, pageVerify } from './injected';
import { CookieRestoreResult, collectCookies, countCookies, countMatchingCookies, getDestinationCookies, restoreCookies } from './cookie-manager';
import { getActiveTab, originOf, reloadTab, resolveDestinationTab } from './tab-utils';
import { checkPackage, decryptPayload, encryptPayload, packageNeedsCode } from '../core/crypto';
import { LARGE_WARN_BYTES, MAX_PACKAGE_BYTES, TRANSFER_TTL_MS } from '../core/limits';
import { logger } from '../core/logger';
import { buildStorageState, parseExtraDomains } from '../core/storage-state';
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
  TransferStatus,
  VerificationLine,
} from '../core/types';


type PagedFunc = typeof pageDetect | typeof pageCollect | typeof pageRestore | typeof pageVerify | typeof pageLocalStorage;

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

async function handleCollect(port: chrome.runtime.Port, requireCode: boolean, extraDomains: string[]) {
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
    cookies = await collectCookies(tab.url!, extraDomains);
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

  const { pkg, code } = await encryptPayload(payload, TRANSFER_TTL_MS, requireCode ? 'code' : 'none');
  // Payload size recovered from the finished package (base64 is 4 chars per 3 bytes): no second stringify.
  const sizeBytes = Math.floor((pkg.ciphertext.length * 3) / 4);
  if (sizeBytes > MAX_PACKAGE_BYTES) {
    send(port, { type: 'error', message: `Session too large (${(sizeBytes / 1048576).toFixed(0)} MB). Exceeds 100 MB limit.` });
    return;
  }
  logger.info('Session collected & encrypted', { origin, keyMode: pkg.keyMode, sizeBytes, components: results.length, large: sizeBytes > LARGE_WARN_BYTES });
  const { ciphertext, ...header } = pkg;
  for (let i = 0; i < ciphertext.length; i += CIPHERTEXT_CHUNK_CHARS) {
    const data = ciphertext.slice(i, i + CIPHERTEXT_CHUNK_CHARS);
    if (!send(port, { type: 'ciphertextChunk', data })) return; // popup is gone; nobody to tell
  }
  if (!send(port, { type: 'collected', pkg: header, code, results, unsupported: NON_TRANSFERABLE, sizeBytes })) {
    send(port, { type: 'error', message: 'The session was collected but could not be handed to the window. Please try again.' });
  }
}

// ---------------------------------------------------------------- export for Playwright
async function handleExportState(port: chrome.runtime.Port, extraDomains: string[]) {
  const tab = await getActiveTab();
  const origin = originOf(tab?.url);
  if (!tab || !origin || tab.id == null) {
    send(port, { type: 'error', message: 'No transferable website in the active tab.' });
    return;
  }
  let cookies: Awaited<ReturnType<typeof collectCookies>>;
  try {
    cookies = await collectCookies(tab.url!, extraDomains);
  } catch {
    // An export without its cookies would look like a success and fail later in the test run.
    send(port, { type: 'error', message: 'Cookie read failed. No file was created.' });
    return;
  }
  let items: [string, string][] = [];
  try {
    items = (await inject<{ items: [string, string][] }>(tab.id, pageLocalStorage)).items;
  } catch {
    /* page blocked: cookies only */
  }
  const { state, skippedPartitioned } = buildStorageState(origin, cookies, items);
  logger.info('Exported storageState', { origin, cookies: state.cookies.length });
  send(port, {
    type: 'stateExported',
    json: JSON.stringify(state, null, 2),
    host: new URL(origin).hostname,
    cookies: state.cookies.length,
    localStorage: items.length,
    skippedPartitioned,
  });
}

// ---------------------------------------------------------------- inspect
function parsePackage(text: string): EncryptedPackage {
  const pkg = JSON.parse(text) as EncryptedPackage;
  if (!pkg || pkg.format !== PACKAGE_FORMAT) throw new Error('Unrecognized package format.');
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
    checkPackage(pkg); // format, version, expiry, lifetime: before anything is decrypted
    if (packageNeedsCode(pkg) && !req.code?.trim()) {
      send(port, { type: 'codeRequired', expiresAt: pkg.expiresAt, origin: pkg.origin });
      return;
    }
    const payload = await decryptPayload(pkg, req.code);
    send(port, { type: 'inspected', summary: summarize(payload, pkg) });
  } catch (e) {
    send(port, { type: 'error', message: (e as Error).message || 'Could not read package.' });
  }
}

// ---------------------------------------------------------------- restore
async function handleRestore(port: chrome.runtime.Port, req: Extract<OpRequest, { type: 'restore' }>) {
  let payload: SessionPayload;
  let pkg: EncryptedPackage;
  try {
    pkg = parsePackage(req.packageText);
    checkPackage(pkg);
    if (packageNeedsCode(pkg) && !req.code?.trim()) {
      send(port, { type: 'codeRequired', expiresAt: pkg.expiresAt, origin: pkg.origin });
      return;
    }
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
  const existingCookies = (await getDestinationCookies(tab.url ?? origin, payload.state.cookies).catch(() => [])).length;
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

  const applyStrategy = strategy === 'merge' ? 'merge' : 'replace';
  const destUrl = tab.url ?? origin + '/';

  // Apply cookies (extension context) then page storage (page context).
  const cookieRes: CookieRestoreResult = await restoreCookies(payload.state.cookies, applyStrategy, destUrl).catch(() => ({
    applied: 0,
    failed: payload.state.cookies.length,
    written: [],
  }));
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

  // Verify what is really there now (same keys AND values), BEFORE the reload: apps often rewrite state on load.
  const matchedCookies = await countMatchingCookies(cookieRes.written);
  let matched = { localStorage: 0, sessionStorage: 0, indexedDB: 0, cacheStorage: 0 };
  try {
    matched = await inject(tab.id, pageVerify, {
      localStorage: payload.state.localStorage,
      sessionStorage: payload.state.sessionStorage,
      indexedDB: payload.state.indexedDB.map((d) => d.name),
      cacheStorage: payload.state.cacheStorage.map((c) => c.name),
    });
  } catch {
    /* counts stay 0: reported as not verified */
  }

  // Reload so the app initializes with the restored cookies + storage (only if anything was written).
  const wroteAnything =
    cookieRes.applied > 0 ||
    ['localStorage', 'sessionStorage', 'indexedDB', 'cacheStorage'].some((c) => (pageRes?.[c]?.applied ?? 0) > 0);
  let reloaded = false;
  if (wroteAnything) {
    try {
      await reloadTab(tab.id);
      reloaded = true;
    } catch {
      /* ignore */
    }
  }

  const st = payload.state;
  const idbRecords = st.indexedDB.reduce((n, d) => n + d.stores.reduce((m, x) => m + x.records.length, 0), 0);
  const cacheEntries = st.cacheStorage.reduce((n, c) => n + c.entries.filter((e) => e.supported && e.reqMethod === 'GET').length, 0);
  const lines: VerificationLine[] = [
    line('cookies', st.cookies.length, matchedCookies),
    line('localStorage', st.localStorage.length, matched.localStorage),
    line('sessionStorage', st.sessionStorage.length, matched.sessionStorage),
    line('indexedDB', st.indexedDB.length, matched.indexedDB),
    line('cacheStorage', st.cacheStorage.length, matched.cacheStorage),
  ];

  const cookieNote = cookieRes.failed ? `${cookieRes.failed} cookie(s) could not be set` : '';
  const results: TransferComponentResult[] = [
    { component: 'cookies', status: outcome(cookieRes.applied, st.cookies.length), itemCount: cookieRes.applied, error: cookieNote || undefined },
    pageResult('localStorage', pageRes, st.localStorage.length),
    pageResult('sessionStorage', pageRes, st.sessionStorage.length),
    pageResult('indexedDB', pageRes, idbRecords),
    pageResult('cacheStorage', pageRes, cacheEntries),
  ];

  const passed = lines.every((l) => l.ok) && results.every((r) => r.status === 'success');
  logger.info('Session restored', { origin, passed, reloaded });
  send(port, { type: 'restored', report: { lines, passed, results, reloaded } });
}

/** success = everything written, partial = some, failed = nothing (when something was expected). */
function outcome(applied: number, expected: number): TransferStatus {
  if (applied >= expected) return 'success';
  return applied > 0 ? 'partial' : 'failed';
}

function pageResult(component: TransferComponent, pageRes: any, expected: number): TransferComponentResult {
  const r = pageRes?.[component];
  const applied = r?.applied ?? 0;
  const status = r?.error || !pageRes ? (applied > 0 ? 'partial' : 'failed') : outcome(applied, expected);
  return { component, status, itemCount: applied, error: r?.error ?? (!pageRes ? 'Page write blocked' : undefined) };
}

function line(component: TransferComponent, expected: number, actual: number): VerificationLine {
  return { component, expected, actual, ok: expected === 0 ? true : actual >= expected };
}

// ---------------------------------------------------------------- wiring
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;
  const packageChunks: string[] = [];
  port.onMessage.addListener(async (msg: OpRequest) => {
    try {
      if (msg.type === 'packageChunk') {
        packageChunks.push(msg.data);
        return;
      }
      if ((msg.type === 'inspect' || msg.type === 'restore') && packageChunks.length) {
        msg = { ...msg, packageText: packageChunks.join('') };
        packageChunks.length = 0;
      }
      switch (msg.type) {
        case 'detect': await handleDetect(port); break;
        case 'collect': await handleCollect(port, msg.requireCode === true, parseExtraDomains((msg.extraDomains ?? []).join(' ')).domains); break;
        case 'exportState': await handleExportState(port, parseExtraDomains((msg.extraDomains ?? []).join(' ')).domains); break;
        case 'inspect': await handleInspect(port, msg); break;
        case 'restore': await handleRestore(port, msg); break;
      }
    } catch (e) {
      send(port, { type: 'error', message: 'Unexpected error during operation.' });
      logger.error('Operation failed', { op: (msg as OpRequest).type });
    }
  });
});

// v1.2.x kept encrypted destination backups here; they are gone, so remove any left behind.
chrome.runtime.onInstalled.addListener(async () => {
  const all = await chrome.storage.local.get(null).catch(() => ({}));
  const old = Object.keys(all).filter((k) => k.startsWith('backup:'));
  if (old.length) await chrome.storage.local.remove(old).catch(() => undefined);
});
