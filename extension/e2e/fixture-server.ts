// Local fixture site for the e2e harness. Seeds cookies, localStorage, sessionStorage,
// IndexedDB and Cache Storage. Counts default to the founder's screenshot (APP-315):
// cookies 9, localStorage 31, sessionStorage 26, IndexedDB 283 records, Cache Storage 15.
import http from 'node:http';
import { AddressInfo } from 'node:net';

const PAGE = `<!doctype html><meta charset="utf-8"><title>Fixture</title><body><h1>fixture</h1><script>
const q = new URLSearchParams(location.search);
const n = (k, d) => (q.has(k) ? Number(q.get(k)) : d);
const LS = n('ls', 31), SS = n('ss', 26), IDB = n('idb', 283), CACHE = n('cache', 15);
const IDB_KB = n('idbkb', 1), CACHE_KB = n('cachekb', 1);
function blobText(kb, seed) { // incompressible-ish text so size is predictable
  const a = new Uint8Array(kb * 1024); 
  for (let o = 0; o < a.length; o += 65536) crypto.getRandomValues(a.subarray(o, Math.min(o + 65536, a.length)));
  return a;
}
(async () => {
  for (let i = 0; i < LS; i++) localStorage.setItem('ls' + i, 'value-' + i);
  for (let i = 0; i < SS; i++) sessionStorage.setItem('ss' + i, 'value-' + i);
  await new Promise((res, rej) => { const d = indexedDB.deleteDatabase('fixture'); d.onsuccess = d.onerror = d.onblocked = () => res(); });
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('fixture', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('rows', { keyPath: 'id' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  // write in batches so big fixtures do not hit one huge transaction
  for (let start = 0; start < IDB; start += 20) {
    await new Promise((res, rej) => {
      const tx = db.transaction('rows', 'readwrite'); const st = tx.objectStore('rows');
      for (let i = start; i < Math.min(IDB, start + 20); i++) st.put({ id: i, name: 'row-' + i, payload: IDB_KB > 1 ? blobText(IDB_KB) : 'x'.repeat(200) });
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
    });
  }
  db.close();
  await caches.delete('fixture-cache');
  const c = await caches.open('fixture-cache');
  for (let i = 0; i < CACHE; i++) await c.put('/asset-' + i, new Response(blobText(CACHE_KB), { headers: { 'content-type': 'application/octet-stream' } }));
  document.title = 'ready';
})();
</script>`;

export interface Fixture { origin: string; close(): Promise<void> }

export async function startFixture(): Promise<Fixture> {
  const server = http.createServer((req, res) => {
    const cookies = Array.from({ length: 9 }, (_, i) => `ck${i}=v${i}; Path=/; Max-Age=3600`);
    res.setHeader('Set-Cookie', cookies);
    res.setHeader('Content-Type', req.url?.startsWith('/asset-') ? 'text/plain' : 'text/html');
    res.end(req.url?.startsWith('/asset-') ? 'asset' : PAGE);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return { origin: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r())) };
}
