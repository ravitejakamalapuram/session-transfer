import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Shield, Lock, Cookie, Database, HardDrive, Archive, Globe, KeyRound,
  Download, Check, X, Server, Zap, Fingerprint, ArrowRight, ChevronDown,
  Terminal, Eye, RefreshCw, FileCode, ChevronRight,
} from "lucide-react";
import Simulator from "@/landing/Simulator";
import "@/landing/landing.css";

const ZIP_URL = "/session-transfer-v1.2.0.zip";
const VERSION = "v1.2.0";

const NAV = [
  ["How It Works", "how-it-works"],
  ["Features", "features"],
  ["Security", "security"],
  ["Demo", "interactive-demo"],
  ["Storage Matrix", "storage-matrix"],
  ["Install", "installation"],
  ["FAQ", "faq"],
];

function downloadZip() {
  const a = document.createElement("a");
  a.href = ZIP_URL;
  a.download = `session-transfer-${VERSION}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

export default function Landing() {
  const [scrolled, setScrolled] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="st-root">
      <Nav scrolled={scrolled} onDownload={downloadZip} />
      <Hero onDownload={downloadZip} onInstall={() => setInstallOpen(true)} />
      <HowItWorks />
      <Features />
      <Security />
      <Demo />
      <StorageMatrix />
      <Installation onDownload={downloadZip} />
      <Faq />
      <Footer onDownload={downloadZip} />
      {installOpen && <InstallModal onClose={() => setInstallOpen(false)} onDownload={downloadZip} />}
    </div>
  );
}

// ------------------------------------------------------------------ Nav
function Nav({ scrolled, onDownload }) {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        background: scrolled ? "rgba(8,11,17,0.85)" : "transparent",
        backdropFilter: scrolled ? "blur(16px)" : "none",
        borderBottom: `1px solid ${scrolled ? "var(--border)" : "transparent"}`,
      }}
      data-testid="site-header"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="Session Transfer" className="w-8 h-8 rounded-lg" />
          <span className="st-mono font-extrabold text-[15px]">Session Transfer</span>
          <span className="st-badge hidden sm:inline-flex ml-1 !py-0.5 !px-2.5 !text-[10px]">MV3</span>
        </div>
        <nav className="hidden lg:flex items-center gap-6">
          {NAV.map(([label, id]) => (
            <button key={id} className="st-link" onClick={() => scrollTo(id)} data-testid={`nav-link-${id}`}>{label}</button>
          ))}
        </nav>
        <button className="st-btn st-btn-primary !py-2.5 !px-4 !text-[13px]" onClick={onDownload} data-testid="nav-cta-download-button">
          <Download size={15} /> Download {VERSION}
        </button>
      </div>
    </header>
  );
}

// ------------------------------------------------------------------ Hero
function Hero({ onDownload, onInstall }) {
  return (
    <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-28 st-grid-bg overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(800px 400px at 70% 0%, rgba(16,185,129,0.14), transparent 60%), radial-gradient(600px 350px at 0% 100%, rgba(34,211,238,0.08), transparent 55%)" }} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <span className="st-badge" data-testid="hero-badge"><span className="st-dot st-dot-ok" /> Manifest V3 · AES-256-GCM · No Telemetry</span>
              <h1 className="st-mono font-extrabold tracking-tight leading-[1.05] mt-6 text-4xl sm:text-5xl lg:text-6xl">
                Zero-Cloud<br />Session Transfer<br /><span style={{ color: "var(--accent)" }}>for Chrome.</span>
              </h1>
              <p className="mt-6 text-lg leading-relaxed max-w-xl" style={{ color: "var(--text-2)" }}>
                Move an authenticated session — cookies, localStorage, sessionStorage, IndexedDB &amp; Cache Storage —
                between profiles or devices. Encrypted with an ephemeral key, 100% local, zero servers.
              </p>
              <div className="flex flex-wrap gap-3 mt-8">
                <button className="st-btn st-btn-primary" onClick={onDownload} data-testid="hero-cta-download"><Download size={16} /> Download Extension</button>
                <button className="st-btn st-btn-ghost" onClick={() => scrollTo("interactive-demo")} data-testid="hero-cta-demo"><Zap size={16} /> Try Interactive Demo</button>
                <button className="st-btn st-btn-ghost" onClick={onInstall} data-testid="hero-cta-install"><FileCode size={16} /> Install Guide</button>
              </div>
              <div className="flex items-center gap-6 mt-8 st-mono text-[12px]" style={{ color: "var(--text-3)" }}>
                <span className="flex items-center gap-1.5"><Check size={14} style={{ color: "var(--accent)" }} /> No account</span>
                <span className="flex items-center gap-1.5"><Check size={14} style={{ color: "var(--accent)" }} /> No cloud</span>
                <span className="flex items-center gap-1.5"><Check size={14} style={{ color: "var(--accent)" }} /> Open architecture</span>
              </div>
            </motion.div>
          </div>
          <motion.div className="lg:col-span-5" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.15 }}>
            <PopupMock />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function PopupMock() {
  const rows = [
    ["Cookies", "12", Cookie], ["Local Storage", "18", HardDrive],
    ["Session Storage", "4", Archive], ["IndexedDB", "2", Database], ["Cache Storage", "124", Server],
  ];
  return (
    <div className="st-glow-card p-0 overflow-hidden mx-auto max-w-[340px]" style={{ boxShadow: "0 30px 80px rgba(0,0,0,0.5)" }}>
      <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "rgba(8,11,17,0.6)" }}>
        <img src="/logo.png" className="w-6 h-6 rounded-md" alt="" />
        <div><div className="st-mono text-[12px] font-bold">Session Transfer</div><div className="st-mono text-[9px]" style={{ color: "var(--text-3)" }}>AES-256-GCM · local only</div></div>
      </div>
      <div className="p-4 space-y-3">
        <div className="p-3 rounded-xl" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
          <div className="st-mono text-[15px] font-bold">app.example.com</div>
          <span className="st-badge mt-2 !py-1 !text-[10px]"><span className="st-dot st-dot-ok" /> Session detected</span>
        </div>
        <div className="space-y-1.5">
          {rows.map(([l, c, Icon]) => (
            <div key={l} className="flex items-center gap-2.5 px-3 py-2 rounded-lg st-mono text-[12px]" style={{ background: "var(--code-bg)" }}>
              <Icon size={14} style={{ color: "var(--accent)" }} />
              <span style={{ color: "var(--text-2)" }}>{l}</span>
              <span className="ml-auto" style={{ color: "var(--text-3)" }}>{c}</span>
              <Check size={13} style={{ color: "var(--accent)" }} />
            </div>
          ))}
        </div>
        <button className="st-btn st-btn-primary w-full !text-[13px]"><Lock size={15} /> Transfer Session</button>
        <button className="st-btn st-btn-ghost w-full !text-[13px]">Receive Session</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ How it works
function HowItWorks() {
  const steps = [
    { n: "01", icon: Lock, title: "Export on the source browser", desc: "Open the site, click the extension, hit Transfer. State is collected, serialized (structured-clone-aware) and encrypted in-memory." },
    { n: "02", icon: KeyRound, title: "Encrypt & generate a one-time code", desc: "AES-256-GCM with a PBKDF2-derived ephemeral key. You get a short transfer code + a portable encrypted package file." },
    { n: "03", icon: Fingerprint, title: "Import & verify on the target", desc: "Load the package, enter the code. State is validated, restored into the site's own origin, reloaded, and verified." },
  ];
  return (
    <Section id="how-it-works" eyebrow="PIPELINE" title="Three steps. One click each side.">
      <div className="grid md:grid-cols-3 gap-6">
        {steps.map((s, i) => (
          <motion.div key={s.n} className="st-glow-card p-6 relative" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
            <span className="st-mono text-5xl font-extrabold absolute top-4 right-5" style={{ color: "rgba(16,185,129,0.12)" }}>{s.n}</span>
            <div className="w-11 h-11 rounded-xl grid place-items-center mb-4" style={{ background: "rgba(16,185,129,0.1)", border: "1px solid var(--border-strong)" }}>
              <s.icon size={20} style={{ color: "var(--accent)" }} />
            </div>
            <h3 className="st-mono text-lg font-bold mb-2">{s.title}</h3>
            <p style={{ color: "var(--text-2)" }} className="text-[14px] leading-relaxed">{s.desc}</p>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ Features
function Features() {
  const feats = [
    { icon: Database, title: "5 storage mechanisms", desc: "Cookies (incl. HttpOnly/Secure via extension APIs), localStorage, sessionStorage, IndexedDB & Cache Storage." },
    { icon: Lock, title: "AES-256-GCM encryption", desc: "Authenticated encryption with a per-transfer ephemeral key derived via PBKDF2-SHA256. Origin bound as AAD." },
    { icon: Server, title: "Serverless & air-gapped", desc: "No cloud API, no tracking, no database. The package is just an encrypted file you move however you like." },
    { icon: Globe, title: "Strict origin isolation", desc: "State is bound to its origin and restored only into that origin — never mixed across domains." },
    { icon: Eye, title: "Honest about limits", desc: "WebAuthn/passkeys, hardware credentials and TLS state cannot be cloned — and we never pretend they can." },
    { icon: RefreshCw, title: "Verify · backup · expire", desc: "Post-import verification report, encrypted auto-expiring backups, and 5-minute single-use transfers." },
  ];
  return (
    <Section id="features" eyebrow="ARCHITECTURE" title="Security-first by construction.">
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {feats.map((f, i) => (
          <motion.div key={f.title} className="st-glow-card p-6" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: (i % 3) * 0.08 }}>
            <f.icon size={22} style={{ color: "var(--accent)" }} />
            <h3 className="st-mono text-[15px] font-bold mt-4 mb-2">{f.title}</h3>
            <p style={{ color: "var(--text-2)" }} className="text-[13.5px] leading-relaxed">{f.desc}</p>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ Security
function Security() {
  const flow = ["Collect", "Serialize", "Encrypt", "Transfer", "Decrypt", "Validate", "Restore", "Verify"];
  return (
    <Section id="security" eyebrow="THREAT MODEL" title="Session data is treated like passwords.">
      <div className="grid lg:grid-cols-2 gap-8 items-center">
        <div className="space-y-4">
          {[
            ["Ephemeral keys", "Derived per-export from a fresh random code + salt via PBKDF2-SHA256 (210k). Never stored."],
            ["Origin binding (AAD)", "The origin is authenticated data — a tampered package header fails to decrypt, preventing origin confusion."],
            ["Replay protection", "Short 5-minute expiry, random transfer id, single-use codes generated per export."],
            ["Nothing leaks", "No cookie/token/storage value ever reaches logs, UI, errors, clipboard, or disk in plaintext."],
          ].map(([t, d]) => (
            <div key={t} className="flex gap-3">
              <Shield size={18} style={{ color: "var(--accent)", marginTop: 2, flexShrink: 0 }} />
              <div><div className="st-mono text-[14px] font-bold">{t}</div><div className="text-[13.5px] mt-1" style={{ color: "var(--text-2)" }}>{d}</div></div>
            </div>
          ))}
        </div>
        <div className="st-terminal p-6">
          <div className="flex items-center gap-2 mb-4"><Terminal size={15} style={{ color: "var(--accent)" }} /><span className="st-mono text-[12px]" style={{ color: "var(--text-3)" }}>transfer.pipeline</span></div>
          <div className="space-y-2.5">
            {flow.map((f, i) => (
              <div key={f} className="flex items-center gap-3">
                <span className="st-mono text-[11px] w-5" style={{ color: "var(--text-3)" }}>{String(i + 1).padStart(2, "0")}</span>
                <div className="flex-1 flex items-center gap-2">
                  <span className="st-mono text-[13px]" style={{ color: i >= 4 ? "var(--cyan)" : "var(--accent-2)" }}>{f}</span>
                  {i < flow.length - 1 && <div className="flex-1 h-px" style={{ background: "var(--border)" }} />}
                </div>
                <Check size={13} style={{ color: "var(--accent)" }} />
              </div>
            ))}
          </div>
          <div className="mt-5 pt-4 text-[11px] st-mono" style={{ borderTop: "1px solid var(--border)", color: "var(--text-3)" }}>
            AES-256-GCM · PBKDF2-SHA256 · Web Crypto only · no custom crypto
          </div>
        </div>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ Demo
function Demo() {
  return (
    <Section id="interactive-demo" eyebrow="LIVE SANDBOX" title="Run the real encryption pipeline."
      subtitle="This simulator uses the browser's actual Web Crypto API — the same AES-256-GCM + PBKDF2 flow the extension ships. Toggle state, export, then restore on Browser B with the generated code.">
      <Simulator />
      <p className="st-mono text-[11px] text-center mt-5" style={{ color: "var(--text-3)" }}>
        Everything runs locally in this tab. No data leaves your browser.
      </p>
    </Section>
  );
}

// ------------------------------------------------------------------ Storage matrix
function StorageMatrix() {
  const rows = [
    ["HTTP Cookies (session & persistent)", true, "chrome.cookies API", "HttpOnly & SameSite preserved"],
    ["localStorage", true, "Origin injection", "Full key/value dictionary"],
    ["sessionStorage", true, "Tab session proxy", "Restored then reloaded into origin"],
    ["IndexedDB", true, "Structured serializer", "Schema + records, Blobs/TypedArrays"],
    ["Cache Storage", true, "CacheStorage API", "GET / non-opaque responses"],
    ["WebAuthn / passkeys", false, "TPM / Secure Enclave", "Non-extractable by design"],
    ["TLS channel / client certs", false, "Network layer", "OS-level, cannot be cloned"],
  ];
  return (
    <Section id="storage-matrix" eyebrow="CAPABILITIES" title="Transferable vs non-transferable state.">
      <div className="st-glow-card overflow-hidden !p-0">
        <div className="overflow-x-auto">
          <table className="w-full st-mono text-[13px] min-w-[640px]" data-testid="storage-matrix-table">
            <thead>
              <tr style={{ background: "var(--code-bg)", color: "var(--text-3)" }}>
                <th className="text-left px-5 py-3 font-semibold">State / credential</th>
                <th className="text-left px-4 py-3 font-semibold">Transferable</th>
                <th className="text-left px-4 py-3 font-semibold">Mechanism</th>
                <th className="text-left px-5 py-3 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                  <td className="px-5 py-3.5" style={{ color: "var(--text)" }}>{r[0]}</td>
                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                      style={{
                        color: r[1] ? "var(--accent-2)" : "var(--amber)",
                        background: r[1] ? "rgba(16,185,129,0.1)" : "rgba(251,191,36,0.1)",
                        border: `1px solid ${r[1] ? "var(--border-strong)" : "rgba(251,191,36,0.35)"}`,
                      }}>
                      {r[1] ? <><Check size={12} /> Yes</> : <><X size={12} /> By design</>}
                    </span>
                  </td>
                  <td className="px-4 py-3.5" style={{ color: "var(--text-2)" }}>{r[2]}</td>
                  <td className="px-5 py-3.5" style={{ color: "var(--text-3)" }}>{r[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ Installation
function Installation({ onDownload }) {
  const steps = [
    ["Download the package", `Grab session-transfer-${VERSION}.zip.`],
    ["Unzip it", "Extract the archive on your computer."],
    ["Open chrome://extensions", "Paste it into the Chrome address bar."],
    ["Enable Developer mode", "Toggle it in the top-right corner."],
    ["Load unpacked", "Select the unzipped folder."],
    ["Pin & transfer", "Pin Session Transfer to your toolbar and go."],
  ];
  return (
    <Section id="installation" eyebrow="SETUP" title="Load unpacked in under a minute.">
      <div className="grid lg:grid-cols-2 gap-8">
        <div className="space-y-3">
          {steps.map(([t, d], i) => (
            <div key={t} className="flex gap-4 st-glow-card p-4 items-start" data-testid={`install-step-${i + 1}`}>
              <span className="st-mono font-bold text-[13px] w-7 h-7 rounded-lg grid place-items-center flex-shrink-0" style={{ background: "rgba(16,185,129,0.1)", color: "var(--accent-2)", border: "1px solid var(--border-strong)" }}>{i + 1}</span>
              <div><div className="st-mono text-[14px] font-bold">{t}</div><div className="text-[13px] mt-0.5" style={{ color: "var(--text-2)" }}>{d}</div></div>
            </div>
          ))}
        </div>
        <div className="st-terminal p-6 flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-4"><Download size={16} style={{ color: "var(--accent)" }} /><span className="st-mono text-[13px]">Packaged build</span></div>
          <div className="st-mono text-[12px] space-y-1.5" style={{ color: "var(--text-2)" }}>
            <div><span style={{ color: "var(--accent-2)" }}>$</span> session-transfer-{VERSION}.zip</div>
            <div style={{ color: "var(--text-3)" }}># Manifest V3 · strict CSP · ~80 KB</div>
            <div style={{ color: "var(--text-3)" }}># permissions: cookies, scripting, tabs, storage</div>
          </div>
          <button className="st-btn st-btn-primary w-full mt-6" onClick={onDownload} data-testid="install-download-button">
            <Download size={16} /> Download {VERSION}
          </button>
          <p className="st-mono text-[10.5px] mt-3 text-center" style={{ color: "var(--text-3)" }}>Also includes README, threat model & capability docs.</p>
        </div>
      </div>
    </Section>
  );
}

function InstallModal({ onClose, onDownload }) {
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }} onClick={onClose} data-testid="install-modal">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="st-glow-card max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <span className="st-mono font-bold text-lg">Quick install</span>
          <button onClick={onClose} data-testid="install-modal-close"><X size={18} style={{ color: "var(--text-3)" }} /></button>
        </div>
        <ol className="st-mono text-[13px] space-y-2.5" style={{ color: "var(--text-2)" }}>
          {["Download & unzip the package", "Open chrome://extensions", "Enable Developer mode (top-right)", "Click 'Load unpacked'", "Select the unzipped folder", "Pin the extension & transfer"].map((s, i) => (
            <li key={i} className="flex gap-3"><ChevronRight size={15} style={{ color: "var(--accent)", marginTop: 1 }} /> {s}</li>
          ))}
        </ol>
        <button className="st-btn st-btn-primary w-full mt-6" onClick={onDownload}><Download size={16} /> Download {VERSION}</button>
      </motion.div>
    </div>
  );
}

// ------------------------------------------------------------------ FAQ
function Faq() {
  const faqs = [
    ["Is any session data sent to a server?", "No. Everything runs locally in your browser. All encryption uses the Web Crypto API in-process. There is no backend, account, or telemetry."],
    ["How do I transfer between two devices?", "Move the encrypted package file by any channel you like (AirDrop, USB, local share) and share the one-time code separately. The file is useless without the code, and vice-versa."],
    ["Does it work with HttpOnly cookies?", "Yes. The Manifest V3 cookies permission lets the extension read/write HttpOnly and Secure cookies for the selected origin — exactly where session tokens usually live."],
    ["Why can't passkeys / WebAuthn be transferred?", "They're bound to hardware (TPM / Secure Enclave) and are non-extractable by design. We disclose this in-product rather than faking success."],
    ["What happens if the destination already has a session?", "Nothing is overwritten silently. You choose Replace, Merge, or Cancel — and can create an encrypted, auto-expiring backup first."],
  ];
  const [open, setOpen] = useState(0);
  return (
    <Section id="faq" eyebrow="FAQ" title="Questions, answered.">
      <div className="max-w-3xl mx-auto space-y-3">
        {faqs.map(([q, a], i) => (
          <div key={i} className="st-glow-card overflow-hidden" data-testid={`faq-item-${i}`}>
            <button className="w-full flex items-center justify-between gap-4 p-5 text-left" onClick={() => setOpen(open === i ? -1 : i)}>
              <span className="st-mono text-[14px] font-semibold">{q}</span>
              <ChevronDown size={18} style={{ color: "var(--accent)", transform: open === i ? "rotate(180deg)" : "none", transition: "transform 0.25s", flexShrink: 0 }} />
            </button>
            {open === i && <div className="px-5 pb-5 text-[13.5px] leading-relaxed st-fade" style={{ color: "var(--text-2)" }}>{a}</div>}
          </div>
        ))}
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ Footer
function Footer({ onDownload }) {
  return (
    <footer className="border-t" style={{ borderColor: "var(--border)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="st-glow-card p-8 lg:p-10 text-center mb-12" style={{ background: "radial-gradient(500px 200px at 50% 0%, rgba(16,185,129,0.1), transparent)" }}>
          <h2 className="st-mono text-2xl sm:text-3xl font-extrabold">One button here. One button there.</h2>
          <p className="mt-3 max-w-lg mx-auto" style={{ color: "var(--text-2)" }}>Log in once, transfer everywhere. Encrypted, local, and honest about its limits.</p>
          <button className="st-btn st-btn-primary mt-6 mx-auto" onClick={onDownload} data-testid="footer-cta-download"><Download size={16} /> Download {VERSION}</button>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" className="w-7 h-7 rounded-lg" alt="" />
            <span className="st-mono text-[13px] font-bold">Session Transfer</span>
          </div>
          <div className="st-mono text-[11px] flex items-center gap-2" style={{ color: "var(--text-3)" }}>
            <Lock size={12} style={{ color: "var(--accent)" }} /> Encrypted · Local only · No server · {VERSION}
          </div>
        </div>
      </div>
    </footer>
  );
}

// ------------------------------------------------------------------ Section shell
function Section({ id, eyebrow, title, subtitle, children }) {
  return (
    <section id={id} className="py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-12">
          <span className="st-mono text-[12px] font-bold tracking-[0.15em]" style={{ color: "var(--accent)" }}>{eyebrow}</span>
          <h2 className="st-mono text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight mt-3">{title}</h2>
          {subtitle && <p className="mt-4 max-w-2xl text-[15px] leading-relaxed" style={{ color: "var(--text-2)" }}>{subtitle}</p>}
        </motion.div>
        {children}
      </div>
    </section>
  );
}
