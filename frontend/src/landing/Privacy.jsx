import "@/landing/landing.css";
import { Lock, Shield, Server, Eye, Trash2, Globe } from "lucide-react";

const SECTIONS = [
  {
    icon: Server,
    title: "No servers. No accounts. No tracking.",
    body: "Session Transfer operates entirely inside your browser. It does not create accounts, does not set its own cookies, does not use analytics, and does not transmit any data to us or to any third party. There is no backend database. The hosted demo page is a static informational site and also collects no personal data.",
  },
  {
    icon: Lock,
    title: "What the extension processes",
    body: "When you explicitly click 'Transfer Session', the extension reads the browser state of the active tab's origin only: cookies (including HttpOnly), localStorage, sessionStorage, IndexedDB contents, and Cache Storage entries. This data is session/authentication data and is treated with the same sensitivity as passwords.",
  },
  {
    icon: Shield,
    title: "How that data is protected",
    body: "Collected state is serialized in memory and immediately encrypted with AES-256-GCM using an ephemeral key derived from a one-time transfer code (PBKDF2-SHA256, 210,000 iterations). The transfer code is generated fresh for every export, is never stored on disk, and the package expires 5 minutes after creation. The destination origin is cryptographically bound to the package (authenticated data), so a package cannot be restored into a different website.",
  },
  {
    icon: Globe,
    title: "How data moves",
    body: "Transfers are browser-to-browser by file or copy-paste, moved by you through whatever channel you choose. The extension itself opens no network connections. If you later use an optional transport feature, payloads remain end-to-end encrypted; no server ever sees plaintext session data.",
  },
  {
    icon: Trash2,
    title: "Retention & deletion",
    body: "Packages exist only in memory unless you choose to download or copy one. Optional pre-overwrite backups of the destination are encrypted, stored locally in your browser profile, and automatically deleted after 30 minutes. Uninstalling the extension removes all remaining local data.",
  },
  {
    icon: Eye,
    title: "What we never collect",
    body: "Cookie values, tokens, passwords, storage values, browsing history, page content, URLs containing secrets, authentication headers, or session identifiers. Errors and logs contain only non-sensitive metadata such as item counts and component names.",
  },
];

export default function Privacy() {
  return (
    <div className="st-root" style={{ minHeight: "100vh" }}>
      <header className="fixed top-0 left-0 right-0 z-50" style={{ background: "rgba(8,11,17,0.85)", backdropFilter: "blur(16px)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5 no-underline" data-testid="privacy-brand">
            <img src="/logo.png" alt="" className="w-8 h-8 rounded-lg" />
            <span className="st-mono font-extrabold text-[15px]" style={{ color: "var(--text)" }}>Session Transfer</span>
          </a>
          <a href="/" className="st-link" data-testid="privacy-back-home">&larr; Back to site</a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 pt-32 pb-24" data-testid="privacy-page">
        <span className="st-mono text-[12px] font-bold tracking-[0.15em]" style={{ color: "var(--accent)" }}>LEGAL</span>
        <h1 className="st-mono text-3xl sm:text-4xl font-extrabold tracking-tight mt-3">Privacy Policy</h1>
        <p className="mt-4 text-[15px]" style={{ color: "var(--text-2)" }}>
          Effective date: June 2026 · Applies to the Session Transfer Chrome extension and this website.
        </p>
        <div className="st-terminal p-5 mt-8">
          <p className="st-mono text-[13px] leading-relaxed" style={{ color: "var(--accent-2)" }}>
            TL;DR — Everything happens locally in your browser. Session data is encrypted with a one-time code,
            never sent anywhere by us, and expires automatically. We collect nothing.
          </p>
        </div>

        <div className="space-y-4 mt-10">
          {SECTIONS.map((s) => (
            <div key={s.title} className="st-glow-card p-6" style={{ transform: "none" }}>
              <div className="flex items-center gap-3">
                <s.icon size={18} style={{ color: "var(--accent)" }} />
                <h2 className="st-mono text-[15px] font-bold">{s.title}</h2>
              </div>
              <p className="text-[14px] leading-relaxed mt-3" style={{ color: "var(--text-2)" }}>{s.body}</p>
            </div>
          ))}
        </div>

        <div className="st-glow-card p-6 mt-4" style={{ transform: "none" }}>
          <h2 className="st-mono text-[15px] font-bold">Contact</h2>
          <p className="text-[14px] mt-3" style={{ color: "var(--text-2)" }}>
            Questions about this policy: open an issue on the project repository or contact the publisher
            through the Chrome Web Store listing.
          </p>
        </div>

        <p className="st-mono text-[11px] mt-10 text-center" style={{ color: "var(--text-3)" }}>
          Session Transfer · Encrypted · Local only · No server
        </p>
      </main>
    </div>
  );
}
