// @ts-nocheck
/*
 * Functions in this file are injected into the target PAGE via
 * chrome.scripting.executeScript({ func }). Chrome serializes each function
 * with Function.prototype.toString(), therefore every helper MUST be defined
 * INLINE inside the function. They cannot reference any module-scope symbol,
 * import, or shared type. This is why the file is `any`-typed / ts-nocheck.
 *
 * Storage read/written here is strictly origin-scoped (the page's own origin).
 */

/** Lightweight probe: counts only, never values. Used on the popup home screen. */
export function pageDetect() {
  const counts = { localStorage: 0, sessionStorage: 0, indexedDB: 0, cacheStorage: 0 };
  const out: any = { localStorage: 0, sessionStorage: 0, indexedDB: 0, cacheStorage: 0 };
  try { out.localStorage = window.localStorage.length; } catch (e) {}
  try { out.sessionStorage = window.sessionStorage.length; } catch (e) {}
  return (async () => {
    try {
      if (indexedDB && indexedDB.databases) {
        const dbs = await indexedDB.databases();
        out.indexedDB = dbs.filter((d: any) => d && d.name).length;
      }
    } catch (e) {}
    try {
      if (self.caches) {
        const keys = await caches.keys();
        out.cacheStorage = keys.length;
      }
    } catch (e) {}
    return out;
  })();
}

/** Full origin-scoped state collection with per-mechanism results. */
export function pageCollect() {
  function b64(u8: any) {
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return btoa(s);
  }
  const stack = new WeakSet();
  async function ser(v: any): Promise<any> {
    if (v && typeof v === 'object') {
      if (stack.has(v)) return { t: 'unsupported', v: '[circular]' };
      stack.add(v);
      try { return await ser0(v); } finally { stack.delete(v); }
    }
    return ser0(v);
  }
  async function ser0(v: any): Promise<any> {
    if (v === undefined) return { t: 'undef' };
    if (v === null) return { t: 'null' };
    const tp = typeof v;
    if (tp === 'number' || tp === 'string' || tp === 'boolean') return { t: 'prim', v };
    if (tp === 'bigint') return { t: 'prim', v: v.toString() };
    if (v instanceof Date) return { t: 'date', v: v.getTime() };
    if (v instanceof ArrayBuffer) return { t: 'ab', v: b64(new Uint8Array(v)) };
    if (ArrayBuffer.isView(v)) return { t: 'ta', ctor: v.constructor.name, v: b64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
    if (typeof Blob !== 'undefined' && v instanceof Blob) {
      const ab = await v.arrayBuffer();
      return { t: 'blob', mime: v.type, v: b64(new Uint8Array(ab)) };
    }
    if (v instanceof Map) { const e = []; for (const [k, val] of v.entries()) e.push([await ser(k), await ser(val)]); return { t: 'map', v: e }; }
    if (v instanceof Set) { const e = []; for (const x of v.values()) e.push(await ser(x)); return { t: 'set', v: e }; }
    if (Array.isArray(v)) { const a = []; for (const x of v) a.push(await ser(x)); return { t: 'arr', v: a }; }
    if (tp === 'object') { const o: any = {}; for (const k of Object.keys(v)) o[k] = await ser(v[k]); return { t: 'obj', v: o }; }
    return { t: 'unsupported', v: String(v) };
  }
  function reqP(req: any) { return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }

  async function collectIDB() {
    const r: any = { status: 'success', dbs: [], error: undefined };
    const skipped: string[] = [];
    try {
      if (!indexedDB || !indexedDB.databases) { r.status = 'unsupported'; r.error = 'indexedDB.databases() unavailable'; return r; }
      const infos = await indexedDB.databases();
      const named = infos.filter((d: any) => d && d.name);
      for (const info of named) {
        try {
          const db: any = await new Promise((resolve, reject) => {
            const op = indexedDB.open(info.name);
            op.onsuccess = () => resolve(op.result);
            op.onerror = () => reject(op.error);
            op.onblocked = () => reject(new Error('blocked'));
          });
          const storeNames = Array.from(db.objectStoreNames);
          const raw: any[] = [];
          for (const sName of storeNames) {
            const tx = db.transaction(sName, 'readonly');
            const store = tx.objectStore(sName);
            const indexes = Array.from(store.indexNames).map((iName: any) => {
              const idx = store.index(iName);
              return { name: idx.name, keyPath: idx.keyPath, unique: idx.unique, multiEntry: idx.multiEntry };
            });
            const values = await reqP(store.getAll());
            const keys = await reqP(store.getAllKeys());
            raw.push({ name: sName, keyPath: store.keyPath, autoIncrement: store.autoIncrement, indexes, values, keys });
          }
          const version = db.version;
          db.close();
          const stores = [];
          for (const rs of raw) {
            const records = [];
            for (let i = 0; i < rs.values.length; i++) {
              records.push({ key: await ser(rs.keys[i]), value: await ser(rs.values[i]) });
            }
            stores.push({ name: rs.name, keyPath: rs.keyPath, autoIncrement: rs.autoIncrement, indexes: rs.indexes, records });
          }
          r.dbs.push({ name: info.name, version, stores });
        } catch (e) {
          r.status = 'partial';
          skipped.push(info.name);
        }
      }
    } catch (e) { r.status = 'failed'; r.error = 'IndexedDB read failed'; }
    if (skipped.length) r.error = `${skipped.length} database(s) could not be read: ${skipped.join(', ')}`;
    return r;
  }

  async function collectCaches() {
    const r: any = { status: 'success', caches: [], error: undefined };
    try {
      if (!self.caches) { r.status = 'unsupported'; r.error = 'Cache Storage unavailable'; return r; }
      const names = await caches.keys();
      let anyUnsupported = false;
      for (const name of names) {
        const cache = await caches.open(name);
        const reqs = await cache.keys();
        const entries = [];
        for (const req of reqs) {
          try {
            const resp = await cache.match(req);
            if (!resp || resp.type === 'opaque' || resp.status === 0 || req.method !== 'GET') {
              anyUnsupported = true;
              entries.push({ reqUrl: req.url, reqMethod: req.method, reqHeaders: [], status: resp ? resp.status : 0, statusText: '', respHeaders: [], bodyB64: '', supported: false });
              continue;
            }
            const buf = await resp.clone().arrayBuffer();
            entries.push({
              reqUrl: req.url,
              reqMethod: req.method,
              reqHeaders: Array.from((req.headers as any).entries()),
              status: resp.status,
              statusText: resp.statusText,
              respHeaders: Array.from((resp.headers as any).entries()),
              bodyB64: b64(new Uint8Array(buf)),
              supported: true,
            });
          } catch (e) { anyUnsupported = true; }
        }
        r.caches.push({ name, entries });
      }
      if (anyUnsupported) r.status = 'partial';
    } catch (e) { r.status = 'failed'; r.error = 'Cache read failed'; }
    return r;
  }

  const ls: any = { status: 'success', items: [], error: undefined };
  try { for (let i = 0; i < window.localStorage.length; i++) { const k = window.localStorage.key(i)!; ls.items.push([k, window.localStorage.getItem(k)]); } }
  catch (e) { ls.status = 'failed'; ls.error = 'localStorage unavailable'; }

  const ss: any = { status: 'success', items: [], error: undefined };
  try { for (let i = 0; i < window.sessionStorage.length; i++) { const k = window.sessionStorage.key(i)!; ss.items.push([k, window.sessionStorage.getItem(k)]); } }
  catch (e) { ss.status = 'failed'; ss.error = 'sessionStorage unavailable'; }

  return (async () => ({
    localStorage: ls,
    sessionStorage: ss,
    indexedDB: await collectIDB(),
    cacheStorage: await collectCaches(),
  }))();
}

/** Restores origin-scoped state. `args` = { state, strategy }. Returns applied counts. */
export function pageRestore(args: any) {
  const state = args.state;
  const strategy = args.strategy || 'replace';

  function ub64(str: string) { const bin = atob(str); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; }
  function deser(n: any): any {
    if (n === null || n === undefined || typeof n !== 'object') return n;
    switch (n.t) {
      case 'undef': return undefined;
      case 'null': return null;
      case 'prim': return n.v;
      case 'date': return new Date(n.v);
      case 'ab': return ub64(n.v).buffer;
      case 'ta': { const u8 = ub64(n.v); const C = (self as any)[n.ctor] || (globalThis as any)[n.ctor]; if (!C) return u8.buffer; return n.ctor === 'DataView' ? new DataView(u8.buffer) : new C(u8.buffer); }
      case 'blob': return new Blob([ub64(n.v)], { type: n.mime || '' });
      case 'map': { const m = new Map(); for (const [k, val] of n.v) m.set(deser(k), deser(val)); return m; }
      case 'set': { const s = new Set(); for (const x of n.v) s.add(deser(x)); return s; }
      case 'arr': return n.v.map(deser);
      case 'obj': { const o: any = {}; for (const k of Object.keys(n.v)) o[k] = deser(n.v[k]); return o; }
      default: return n.v;
    }
  }
  function del(name: string) { return new Promise((res) => { const r = indexedDB.deleteDatabase(name); r.onsuccess = () => res(null); r.onerror = () => res(null); r.onblocked = () => res(null); }); }

  async function restoreIDB(dbs: any[]) {
    let applied = 0;
    for (const dbData of dbs) {
      try {
        if (strategy === 'replace') await del(dbData.name);
        // Opening below an existing version fails, so never go lower than what is there.
        let existingVersion = 0;
        try { existingVersion = ((await indexedDB.databases()).find((d: any) => d.name === dbData.name) || {}).version || 0; } catch (e) {}
        await new Promise((resolve) => {
          const op = indexedDB.open(dbData.name, Math.max(existingVersion, dbData.version || 1));
          op.onupgradeneeded = () => {
            const db = op.result;
            for (const s of dbData.stores) {
              let store;
              if (!db.objectStoreNames.contains(s.name)) {
                store = db.createObjectStore(s.name, { keyPath: s.keyPath === null ? undefined : s.keyPath, autoIncrement: !!s.autoIncrement });
              } else {
                store = (op.transaction as any).objectStore(s.name);
              }
              for (const idx of s.indexes) {
                if (!store.indexNames.contains(idx.name)) {
                  try { store.createIndex(idx.name, idx.keyPath, { unique: idx.unique, multiEntry: idx.multiEntry }); } catch (e) {}
                }
              }
            }
          };
          op.onsuccess = async () => {
            const db = op.result;
            try {
              const names = dbData.stores.map((s: any) => s.name).filter((n: string) => db.objectStoreNames.contains(n));
              if (names.length) {
                const tx = db.transaction(names, 'readwrite');
                let puts = 0;
                for (const s of dbData.stores) {
                  if (!db.objectStoreNames.contains(s.name)) continue;
                  const store = tx.objectStore(s.name);
                  for (const rec of s.records) {
                    const val = deser(rec.value);
                    try {
                      if (s.keyPath === null || s.keyPath === undefined) store.put(val, deser(rec.key));
                      else store.put(val);
                      puts++;
                    } catch (e) {}
                  }
                }
                // Only a committed transaction counts; an aborted one wrote nothing.
                await new Promise((r) => { tx.oncomplete = () => { applied += puts; r(null); }; tx.onerror = () => r(null); tx.onabort = () => r(null); });
              }
            } catch (e) {}
            db.close();
            resolve(null);
          };
          op.onerror = () => resolve(null);
          op.onblocked = () => resolve(null);
        });
      } catch (e) {}
    }
    return applied;
  }

  async function restoreCaches(cachesData: any[]) {
    let applied = 0;
    if (!self.caches) return applied;
    for (const c of cachesData) {
      try {
        const cache = await caches.open(c.name);
        for (const e of c.entries) {
          if (!e.supported || e.reqMethod !== 'GET') continue;
          try {
            const body = e.bodyB64 ? ub64(e.bodyB64) : null;
            const resp = new Response(body, { status: e.status, statusText: e.statusText, headers: e.respHeaders });
            await cache.put(new Request(e.reqUrl, { method: 'GET' }), resp);
            applied++;
          } catch (err) {}
        }
      } catch (e) {}
    }
    return applied;
  }

  const result: any = {
    localStorage: { applied: 0, error: undefined },
    sessionStorage: { applied: 0, error: undefined },
    indexedDB: { applied: 0, error: undefined },
    cacheStorage: { applied: 0, error: undefined },
  };

  // Replace: write the new keys first, then drop the leftovers, so a failure never leaves it empty.
  function dropStale(store: any, items: any[]) {
    const keep = new Set(items.map((i: any) => i[0]));
    for (const k of Object.keys(store)) if (!keep.has(k)) store.removeItem(k);
  }
  try {
    for (const [k, v] of state.localStorage || []) { window.localStorage.setItem(k, v); result.localStorage.applied++; }
    if (strategy === 'replace') dropStale(window.localStorage, state.localStorage || []);
  } catch (e) { result.localStorage.error = 'localStorage write failed'; }

  try {
    for (const [k, v] of state.sessionStorage || []) { window.sessionStorage.setItem(k, v); result.sessionStorage.applied++; }
    if (strategy === 'replace') dropStale(window.sessionStorage, state.sessionStorage || []);
  } catch (e) { result.sessionStorage.error = 'sessionStorage write failed'; }

  return (async () => {
    try { result.indexedDB.applied = await restoreIDB(state.indexedDB || []); } catch (e) { result.indexedDB.error = 'IndexedDB write failed'; }
    try { result.cacheStorage.applied = await restoreCaches(state.cacheStorage || []); } catch (e) { result.cacheStorage.error = 'Cache write failed'; }
    return result;
  })();
}

/**
 * Checks what is really in the page now against what was sent. `args` = { localStorage, sessionStorage,
 * indexedDB: names, cacheStorage: names }. Returns how many of each matched (same key AND value for storage).
 */
export function pageVerify(args: any) {
  function same(store: any, items: any[]) {
    let n = 0;
    try { for (const [k, v] of items) if (store.getItem(k) === v) n++; } catch (e) {}
    return n;
  }
  return (async () => {
    const out: any = {
      localStorage: same(window.localStorage, args.localStorage || []),
      sessionStorage: same(window.sessionStorage, args.sessionStorage || []),
      indexedDB: 0,
      cacheStorage: 0,
    };
    try {
      const have = new Set((await indexedDB.databases()).map((d: any) => d.name));
      out.indexedDB = (args.indexedDB || []).filter((n: string) => have.has(n)).length;
    } catch (e) {}
    try {
      const have = new Set(await caches.keys());
      out.cacheStorage = (args.cacheStorage || []).filter((n: string) => have.has(n)).length;
    } catch (e) {}
    return out;
  })();
}
