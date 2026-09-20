import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Cookie, Database, HardDrive, Archive, KeyRound, Lock, Check, X,
  ArrowRight, RefreshCw, ShieldCheck, Copy, Fingerprint,
} from "lucide-react";

// ---- Web Crypto pipeline (mirrors the real extension: PBKDF2-SHA256 + AES-256-GCM) ----
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ITER = 210000;
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const b64 = (u8) => btoa(String.fromCharCode.apply(null, u8));
const genCode = () => {
  const r = new Uint32Array(12);
  crypto.getRandomValues(r);
  const c = Array.from(r, (n) => ALPHABET[n % ALPHABET.length]);
  return [0, 1, 2].map((i) => c.slice(i * 4, i * 4 + 4).join("")).join("-");
};
async function deriveKey(code, salt) {
  const bk = await crypto.subtle.importKey("raw", encoder.encode(code), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" },
    bk, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}
async function encryptPayload(payload) {
  const code = genCode();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(code, salt);
  const origin = payload.origin;
  const pt = encoder.encode(JSON.stringify(payload));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(origin) }, key, pt);
  const ctB = new Uint8Array(ct);
  return {
    code,
    pkg: { alg: "AES-256-GCM", salt: b64(salt), iv: b64(iv), origin, expiresAt: Date.now() + 300000, ciphertext: b64(ctB) },
    sizeBytes: pt.length,
  };
}
async function decryptPayload(pkg, code) {
  const salt = Uint8Array.from(atob(pkg.salt), (c) => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(pkg.iv), (c) => c.charCodeAt(0));
  const ct = Uint8Array.from(atob(pkg.ciphertext), (c) => c.charCodeAt(0));
  const key = await deriveKey(code, salt);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(pkg.origin) }, key, ct);
  return JSON.parse(decoder.decode(new Uint8Array(pt)));
}

const DRIVERS = [
  { id: "cookies", label: "Cookies", icon: Cookie, count: 12, note: "sid, __Host-auth, csrf +9" },
  { id: "localStorage", label: "Local Storage", icon: HardDrive, count: 18, note: "auth_token, user, prefs +15" },
  { id: "sessionStorage", label: "Session Storage", icon: Archive, count: 4, note: "nav_state, flow_id +2" },
  { id: "indexedDB", label: "IndexedDB", icon: Database, count: 2, note: "app-db, media-cache" },
];
const ORIGIN = "https://app.example.com";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function Simulator() {
  const [enabled, setEnabled] = useState({ cookies: true, localStorage: true, sessionStorage: true, indexedDB: true });
  const [phase, setPhase] = useState("idle"); // idle | encrypting | ready
  const [result, setResult] = useState(null); // {code, pkg, sizeBytes, payload}
  const [copied, setCopied] = useState(false);

  const [codeInput, setCodeInput] = useState("");
  const [importPhase, setImportPhase] = useState("idle"); // idle | decrypting | done | error
  const [restored, setRestored] = useState(null);
  const [log, setLog] = useState([]);

  const activeDrivers = DRIVERS.filter((d) => enabled[d.id]);

  const toggle = (id) => {
    if (phase !== "idle") return;
    setEnabled((e) => ({ ...e, [id]: !e[id] }));
  };

  const runExport = async () => {
    setPhase("encrypting");
    const payload = {
      origin: ORIGIN,
      createdAt: Date.now(),
      state: Object.fromEntries(activeDrivers.map((d) => [d.id, { count: d.count }])),
    };
    await sleep(900);
    const enc = await encryptPayload(payload);
    setResult({ ...enc, payload });
    setCodeInput("");
    setImportPhase("idle");
    setRestored(null);
    setLog([]);
    setPhase("ready");
  };

  const runImport = async () => {
    if (!result) return;
    setImportPhase("decrypting");
    setLog([]);
    try {
      await sleep(700);
      const payload = await decryptPayload(result.pkg, codeInput.trim().toUpperCase());
      const steps = [];
      steps.push({ ok: true, text: `Decrypted · AES-256-GCM · origin ${payload.origin}` });
      for (const d of activeDrivers) {
        await sleep(280);
        const c = payload.state[d.id]?.count ?? 0;
        steps.push({ ok: true, text: `${d.label}: restored ${c}/${c}` });
        setLog([...steps]);
      }
      await sleep(280);
      steps.push({ ok: true, text: "Verification passed · page reloaded" });
      setLog([...steps]);
      setRestored(payload);
      setImportPhase("done");
    } catch {
      setLog([{ ok: false, text: "Decryption failed — incorrect transfer code or tampered package." }]);
      setImportPhase("error");
    }
  };

  const reset = () => {
    setPhase("idle"); setResult(null); setImportPhase("idle"); setRestored(null); setLog([]); setCodeInput("");
  };

  const copyCode = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.code).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="grid lg:grid-cols-[1fr_auto_1fr] gap-5 items-stretch">
      {/* ---------------- Browser A ---------------- */}
      <div className="st-glow-card p-5 flex flex-col" data-testid="sim-browser-a">
        <BrowserChrome label="Browser A · Source" origin={ORIGIN} status="Authenticated" />
        <p className="st-mono text-[11px] mt-4 mb-2" style={{ color: "var(--text-3)" }}>SELECT STATE TO CAPTURE</p>
        <div className="space-y-2">
          {DRIVERS.map((d) => {
            const on = enabled[d.id];
            const Icon = d.icon;
            return (
              <button
                key={d.id}
                onClick={() => toggle(d.id)}
                data-testid={`sim-toggle-${d.id}`}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all"
                style={{
                  background: on ? "rgba(16,185,129,0.07)" : "var(--code-bg)",
                  border: `1px solid ${on ? "var(--border-strong)" : "rgba(255,255,255,0.05)"}`,
                  opacity: phase === "idle" ? 1 : 0.7, cursor: phase === "idle" ? "pointer" : "default",
                }}
              >
                <Icon size={17} style={{ color: on ? "var(--accent)" : "var(--text-3)" }} />
                <div className="flex-1 min-w-0">
                  <div className="st-mono text-[13px] font-semibold" style={{ color: on ? "var(--text)" : "var(--text-3)" }}>{d.label}</div>
                  <div className="st-mono text-[10px] truncate" style={{ color: "var(--text-3)" }}>{d.note}</div>
                </div>
                <span className="st-mono text-[11px]" style={{ color: on ? "var(--accent-2)" : "var(--text-3)" }}>{d.count}</span>
                <span className="st-dot" style={{ background: on ? "var(--accent)" : "var(--text-3)", boxShadow: on ? "0 0 8px var(--accent)" : "none" }} />
              </button>
            );
          })}
        </div>
        <div className="flex-1" />
        <button
          className="st-btn st-btn-primary w-full mt-4"
          onClick={phase === "ready" ? reset : runExport}
          disabled={phase === "encrypting" || activeDrivers.length === 0}
          data-testid="sim-export-btn"
        >
          {phase === "encrypting" ? (<><RefreshCw size={16} className="st-spin" /> Encrypting…</>)
            : phase === "ready" ? (<><RefreshCw size={16} /> Reset simulation</>)
            : (<><Lock size={16} /> Export &amp; Encrypt</>)}
        </button>
      </div>

      {/* ---------------- Pipeline / Package ---------------- */}
      <div className="flex flex-col items-center justify-center gap-3 min-w-[220px] py-2">
        <AnimatePresence mode="wait">
          {phase !== "ready" ? (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center px-4">
              <div className="w-14 h-14 rounded-full grid place-items-center mx-auto mb-3" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid var(--border)" }}>
                <KeyRound size={22} style={{ color: "var(--accent)" }} className={phase === "encrypting" ? "st-spin" : ""} />
              </div>
              <p className="st-mono text-[11px]" style={{ color: "var(--text-3)" }}>
                {phase === "encrypting" ? "Deriving ephemeral key…" : "Ephemeral key · AES-256-GCM"}
              </p>
              {phase === "encrypting" && (
                <div className="mt-3 h-[3px] w-40 rounded overflow-hidden mx-auto" style={{ background: "rgba(34,211,238,0.15)" }}>
                  <div className="st-scanline h-full w-1/2" />
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div key="pkg" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} className="w-full st-fade">
              <div className="st-terminal p-4">
                <p className="text-[10px] mb-1" style={{ color: "var(--text-3)" }}>ONE-TIME CODE · expires 5m</p>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-extrabold tracking-widest" style={{ color: "var(--accent-2)" }} data-testid="sim-transfer-code">{result.code}</span>
                  <button onClick={copyCode} data-testid="sim-copy-code" title="Copy" className="ml-auto" style={{ color: copied ? "var(--accent)" : "var(--text-3)" }}>
                    {copied ? <Check size={15} /> : <Copy size={15} />}
                  </button>
                </div>
                <div className="h-px my-3" style={{ background: "var(--border)" }} />
                <p className="text-[10px] mb-1" style={{ color: "var(--text-3)" }}>ENCRYPTED PAYLOAD · {result.sizeBytes} B</p>
                <p className="text-[10px] leading-relaxed break-all" style={{ color: "var(--cyan)" }} data-testid="sim-ciphertext">
                  {result.pkg.ciphertext.slice(0, 76)}…
                </p>
                <p className="text-[10px] mt-2" style={{ color: "var(--text-3)" }}>salt {result.pkg.salt.slice(0, 12)}… · iv {result.pkg.iv.slice(0, 10)}…</p>
              </div>
              <div className="flex items-center justify-center gap-2 mt-3">
                <span className="st-mono text-[10px]" style={{ color: "var(--text-3)" }}>transfer</span>
                <ArrowRight size={16} style={{ color: "var(--accent)" }} className="animate-pulse" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ---------------- Browser B ---------------- */}
      <div className="st-glow-card p-5 flex flex-col" data-testid="sim-browser-b">
        <BrowserChrome label="Browser B · Destination" origin={ORIGIN} status={importPhase === "done" ? "Authenticated" : "Signed out"} ok={importPhase === "done"} />

        {phase !== "ready" ? (
          <div className="flex-1 grid place-items-center py-10 text-center">
            <p className="st-mono text-[12px] max-w-[200px]" style={{ color: "var(--text-3)" }}>
              Export a session on Browser A to receive an encrypted package here.
            </p>
          </div>
        ) : (
          <div className="mt-4 flex flex-col flex-1">
            <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg" style={{ background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.2)" }}>
              <ShieldCheck size={15} style={{ color: "var(--cyan)" }} />
              <span className="st-mono text-[11px]" style={{ color: "#a5f3fc" }}>Encrypted package received</span>
            </div>
            <p className="st-mono text-[11px] mb-2" style={{ color: "var(--text-3)" }}>ENTER TRANSFER CODE</p>
            <input
              className="st-input text-center tracking-widest font-bold uppercase"
              placeholder="ABC7-K9P2-WXYZ"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              disabled={importPhase === "done"}
              data-testid="sim-import-code-input"
            />

            {log.length > 0 && (
              <div className="st-terminal p-3 mt-3 space-y-1" data-testid="sim-import-log">
                {log.map((l, i) => (
                  <div key={i} className="flex items-start gap-2 st-fade">
                    {l.ok ? <Check size={13} style={{ color: "var(--accent)", marginTop: 2 }} /> : <X size={13} style={{ color: "var(--rose)", marginTop: 2 }} />}
                    <span className="text-[10.5px]" style={{ color: l.ok ? "var(--text-2)" : "#fecaca" }}>{l.text}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex-1" />
            <button
              className={`st-btn w-full mt-4 ${importPhase === "done" ? "st-btn-ghost" : "st-btn-primary"}`}
              onClick={importPhase === "done" ? reset : runImport}
              disabled={importPhase === "decrypting" || codeInput.trim().length < 8}
              data-testid="sim-import-btn"
            >
              {importPhase === "decrypting" ? (<><RefreshCw size={16} className="st-spin" /> Decrypting…</>)
                : importPhase === "done" ? (<><Check size={16} /> Restored — run again</>)
                : (<><Fingerprint size={16} /> Import &amp; Restore</>)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function BrowserChrome({ label, origin, status, ok }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#ff5f57" }} />
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#febc2e" }} />
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#28c840" }} />
        <span className="st-mono text-[10px] ml-2" style={{ color: "var(--text-3)" }}>{label}</span>
      </div>
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "var(--code-bg)", border: "1px solid var(--border)" }}>
        <Lock size={12} style={{ color: "var(--accent)" }} />
        <span className="st-mono text-[12px] truncate flex-1" style={{ color: "var(--text-2)" }}>{origin}</span>
        <span className="st-mono text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap"
          style={{
            color: ok || status === "Authenticated" ? "var(--accent-2)" : "var(--text-3)",
            background: ok || status === "Authenticated" ? "rgba(16,185,129,0.1)" : "rgba(107,114,128,0.12)",
            border: `1px solid ${ok || status === "Authenticated" ? "var(--border-strong)" : "rgba(107,114,128,0.3)"}`,
          }}>
          {status}
        </span>
      </div>
    </div>
  );
}
