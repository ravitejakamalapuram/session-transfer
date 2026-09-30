import { useCallback, useEffect, useRef, useState } from 'react';
import { runOp } from './port';
import {
  ALL_COMPONENTS,
  Button,
  COMPONENT_LABEL,
  ComponentRow,
  expiresIn,
  hostOf,
  StatusIcon,
  timeAgo,
} from './components/ui';
import {
  ConflictStrategy,
  EncryptedPackage,
  PayloadSummary,
  TransferComponent,
  TransferComponentResult,
  TransferStatus,
  VerificationReport,
} from '../core/types';
import { DetectInfo, OpResponse } from '../core/messages';

type View =
  | 'loading'
  | 'home'
  | 'collecting'
  | 'ready'
  | 'receive'
  | 'inspecting'
  | 'inspect-ready'
  | 'origin-mismatch'
  | 'conflict'
  | 'restoring'
  | 'restored'
  | 'error';

interface Collected {
  pkg: EncryptedPackage;
  code: string;
  results: TransferComponentResult[];
  unsupported: string[];
  sizeBytes: number;
}

type ProgressMap = Partial<Record<TransferComponent, { status: TransferStatus; itemCount?: number }>>;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

const LOGO = chrome.runtime.getURL('icons/icon48.png');
const FEEDBACK_URL = 'https://chromewebstore.google.com/detail/fnfmlchbfofjdfeibgdkcibfjjlfcefc/reviews';

// The popup closes whenever it loses focus (switching windows to copy the package or
// code, or opening the file picker), which used to wipe the Receive form. The form is
// kept in chrome.storage.session (memory only, extension-only) until it is used or
// abandoned, and file loading happens in a full tab where the picker can't close it.
const DRAFT_KEY = 'receiveDraft';
const DRAFT_TTL_MS = 30 * 60 * 1000;
const IS_RECEIVE_TAB = location.hash === '#receive';
const CODE_PATTERN = /^[A-Za-z0-9]{4}[-\s]?[A-Za-z0-9]{4}[-\s]?[A-Za-z0-9]{4}$/;

interface ReceiveDraft {
  packageText: string;
  code: string;
  fileName: string;
  savedAt: number;
}

async function loadDraft(): Promise<ReceiveDraft | null> {
  try {
    const draft = (await chrome.storage.session.get(DRAFT_KEY))[DRAFT_KEY] as ReceiveDraft | undefined;
    if (!draft || Date.now() - draft.savedAt > DRAFT_TTL_MS) return null;
    return draft;
  } catch {
    return null;
  }
}

function saveDraft(draft: Omit<ReceiveDraft, 'savedAt'>): void {
  chrome.storage.session.set({ [DRAFT_KEY]: { ...draft, savedAt: Date.now() } }).catch(() => undefined);
}

function clearDraft(): void {
  chrome.storage.session.remove(DRAFT_KEY).catch(() => undefined);
}

export default function App() {
  const [view, setView] = useState<View>('loading');
  const [detect, setDetect] = useState<DetectInfo | null>(null);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [collected, setCollected] = useState<Collected | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState<'code' | 'package' | null>(null);

  const [packageText, setPackageText] = useState('');
  const [code, setCode] = useState('');
  const [fileName, setFileName] = useState('');

  const [summary, setSummary] = useState<PayloadSummary | null>(null);
  const [mismatch, setMismatch] = useState<{ packageOrigin: string; destOrigin: string } | null>(null);
  const [conflict, setConflict] = useState<{ destOrigin: string; counts: Record<TransferComponent, number> } | null>(null);
  const [strategy, setStrategy] = useState<ConflictStrategy>('cancel');
  const [backup, setBackup] = useState(true);
  const [report, setReport] = useState<{ report: VerificationReport; backedUp: boolean } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const restoreOpts = useRef<{ confirmOriginMismatch?: boolean; conflict?: ConflictStrategy; backup?: boolean }>({});
  const cleanup = useRef<(() => void) | null>(null);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    loadDraft().then((draft) => {
      if (cancelled) return;
      if (draft) {
        setPackageText(draft.packageText);
        setCode(draft.code);
        setFileName(draft.fileName);
      }
      if (IS_RECEIVE_TAB) {
        setView('receive');
        return;
      }
      stop = runOp({ type: 'detect' }, (msg) => {
        if (msg.type === 'detected') {
          setDetect(msg.info);
          setView(draft ? 'receive' : 'home');
        } else if (msg.type === 'error') {
          setErrorMsg(msg.message);
          setView('error');
        }
      });
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  useEffect(() => {
    if (view === 'receive' && (packageText || code || fileName)) saveDraft({ packageText, code, fileName });
    if (view === 'restored') clearDraft();
  }, [view, packageText, code, fileName]);

  const toError = (m: string) => {
    setErrorMsg(m);
    setView('error');
  };

  // ---------------------------------------------------------------- collect
  const startCollect = useCallback(() => {
    setProgress(Object.fromEntries(ALL_COMPONENTS.map((c) => [c, { status: 'pending' as TransferStatus }])));
    setView('collecting');
    cleanup.current?.();
    cleanup.current = runOp({ type: 'collect' }, (msg: OpResponse) => {
      if (msg.type === 'progress') {
        setProgress((p) => ({ ...p, [msg.component]: { status: msg.status, itemCount: msg.itemCount } }));
      } else if (msg.type === 'collected') {
        setCollected({ pkg: msg.pkg, code: msg.code, results: msg.results, unsupported: msg.unsupported, sizeBytes: msg.sizeBytes });
        setView('ready');
      } else if (msg.type === 'error') {
        toError(msg.message);
      }
    });
  }, []);

  // ---------------------------------------------------------------- inspect
  const startInspect = useCallback(() => {
    setView('inspecting');
    cleanup.current?.();
    cleanup.current = runOp({ type: 'inspect', packageText, code }, (msg) => {
      if (msg.type === 'inspected') {
        setSummary(msg.summary);
        setView('inspect-ready');
      } else if (msg.type === 'error') {
        toError(msg.message);
      }
    });
  }, [packageText, code]);

  // ---------------------------------------------------------------- restore
  const runRestore = useCallback(
    (extra: { confirmOriginMismatch?: boolean; conflict?: ConflictStrategy; backup?: boolean }) => {
      restoreOpts.current = { ...restoreOpts.current, ...extra };
      setView('restoring');
      cleanup.current?.();
      cleanup.current = runOp(
        { type: 'restore', packageText, code, ...restoreOpts.current },
        (msg) => {
          if (msg.type === 'originMismatch') {
            setMismatch({ packageOrigin: msg.packageOrigin, destOrigin: msg.destOrigin });
            setView('origin-mismatch');
          } else if (msg.type === 'conflict') {
            setConflict({ destOrigin: msg.destOrigin, counts: msg.counts });
            setView('conflict');
          } else if (msg.type === 'restored') {
            setReport({ report: msg.report, backedUp: msg.backedUp });
            setView('restored');
          } else if (msg.type === 'error') {
            toError(msg.message);
          }
        },
      );
    },
    [packageText, code],
  );

  // ---------------------------------------------------------------- helpers
  const downloadPackage = () => {
    if (!collected) return;
    const host = hostOf(collected.pkg.origin);
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
    const blob = new Blob([JSON.stringify(collected.pkg, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session-${host}-${stamp}.stpkg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const copy = async (what: 'code' | 'package') => {
    if (!collected) return;
    const text = what === 'code' ? collected.code : JSON.stringify(collected.pkg);
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setPackageText(String(reader.result ?? ''));
    reader.readAsText(file);
  };

  const openReceiveTab = () => {
    saveDraft({ packageText, code, fileName });
    chrome.tabs.create({ url: chrome.runtime.getURL('index.html#receive') });
    window.close();
  };

  const reset = () => {
    cleanup.current?.();
    clearDraft();
    if (IS_RECEIVE_TAB) {
      window.close();
      return;
    }
    setView('home');
    setSummary(null);
    setMismatch(null);
    setConflict(null);
    setReport(null);
    restoreOpts.current = {};
  };

  // ================================================================ render
  return (
    <div className="app">
      <header className="header">
        <img className="logo" src={LOGO} alt="" />
        <div>
          <div className="title">Session Transfer</div>
          <div className="sub">AES-256-GCM · local only</div>
        </div>
      </header>

      <main className="body">
        {view === 'loading' && <Loading />}

        {view === 'home' && detect && (
          <Home
            detect={detect}
            onTransfer={startCollect}
            onReceive={() => {
              clearDraft();
              setPackageText('');
              setCode('');
              setFileName('');
              setView('receive');
            }}
          />
        )}

        {view === 'collecting' && (
          <div className="gap fade-in">
            <div className="section-title">Collecting session…</div>
            <div className="rows">
              {ALL_COMPONENTS.map((c) => (
                <ComponentRow
                  key={c}
                  component={c}
                  status={progress[c]?.status ?? 'pending'}
                  value={progress[c]?.itemCount != null ? String(progress[c]?.itemCount) : ''}
                />
              ))}
            </div>
            <div className="callout info">Serializing &amp; encrypting with an ephemeral key…</div>
          </div>
        )}

        {view === 'ready' && collected && (
          <Ready
            collected={collected}
            showDetails={showDetails}
            setShowDetails={setShowDetails}
            copied={copied}
            onCopyCode={() => copy('code')}
            onCopyPackage={() => copy('package')}
            onDownload={downloadPackage}
            onDone={reset}
          />
        )}

        {view === 'receive' && (
          <Receive
            packageText={packageText}
            setPackageText={setPackageText}
            code={code}
            setCode={setCode}
            fileName={fileName}
            onFile={onFile}
            onOpenTab={IS_RECEIVE_TAB ? undefined : openReceiveTab}
            onInspect={startInspect}
            onBack={reset}
          />
        )}

        {view === 'inspecting' && <Loading label="Decrypting &amp; validating…" />}

        {view === 'inspect-ready' && summary && (
          <InspectReady summary={summary} onImport={() => runRestore({})} onBack={reset} />
        )}

        {view === 'origin-mismatch' && mismatch && (
          <div className="gap fade-in">
            <div className="big-check warn">!</div>
            <div className="center">
              <div className="section-title">Origin check</div>
            </div>
            <div className="callout warn">
              This package is for <b>{hostOf(mismatch.packageOrigin)}</b>, but your active tab is{' '}
              <b>{hostOf(mismatch.destOrigin)}</b>. The session will be restored into a{' '}
              {hostOf(mismatch.packageOrigin)} tab — never into a different origin.
            </div>
            <Button testid="mismatch-continue" onClick={() => runRestore({ confirmOriginMismatch: true })}>
              Continue to {hostOf(mismatch.packageOrigin)}
            </Button>
            <Button testid="mismatch-cancel" variant="ghost" onClick={reset}>
              Cancel
            </Button>
          </div>
        )}

        {view === 'conflict' && conflict && (
          <Conflict
            conflict={conflict}
            strategy={strategy}
            setStrategy={setStrategy}
            backup={backup}
            setBackup={setBackup}
            onContinue={() =>
              runRestore({ conflict: strategy, backup: strategy === 'replace' ? backup : false, confirmOriginMismatch: true })
            }
            onCancel={reset}
          />
        )}

        {view === 'restoring' && <Loading label="Restoring &amp; verifying…" />}

        {view === 'restored' && report && <Restored data={report} onOpen={() => window.close()} onDone={reset} />}

        {view === 'error' && (
          <div className="gap fade-in">
            <div className="big-check warn">✗</div>
            <div className="callout danger" data-testid="error-message">
              {errorMsg}
            </div>
            <Button testid="error-back" variant="ghost" onClick={reset}>
              Back
            </Button>
          </div>
        )}
      </main>

      <footer className="footer">
        <span className="lock">🔒 Encrypted · Local only · No server</span>
        <a className="footer-link" href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer" data-testid="feedback-link">
          Rate or report a problem
        </a>
        <span className="lock">v1.2.0</span>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------- subviews
function Loading({ label }: { label?: string }) {
  return (
    <div className="center fade-in" style={{ marginTop: 40 }}>
      <span className="spinner" style={{ width: 22, height: 22 }} />
      <div className="hint" dangerouslySetInnerHTML={{ __html: label ?? 'Reading active tab…' }} />
    </div>
  );
}

function Home({ detect, onTransfer, onReceive }: { detect: DetectInfo; onTransfer: () => void; onReceive: () => void }) {
  return (
    <div className="gap fade-in">
      <div className="origin-card" data-testid="origin-card">
        {detect.supported ? (
          <>
            <div className="origin-host" data-testid="origin-host">
              {hostOf(detect.origin)}
            </div>
            <div className="origin-sub">{detect.origin}</div>
            {detect.hasSession ? (
              <span className="badge ok" data-testid="session-badge">
                <span className="dot ok" /> Session detected
              </span>
            ) : (
              <span className="badge none" data-testid="session-badge">
                <span className="dot none" /> No session data found
              </span>
            )}
          </>
        ) : (
          <>
            <div className="origin-host">Not available here</div>
            <div className="origin-sub">{detect.reason}</div>
          </>
        )}
      </div>

      {detect.supported && (
        <div className="details-grid" data-testid="detect-counts">
          {ALL_COMPONENTS.map((c) => (
            <Frag key={c} k={COMPONENT_LABEL[c]} v={String(detect.counts[c])} muted={detect.counts[c] === 0} />
          ))}
        </div>
      )}

      <div className="spacer" />

      <Button testid="transfer-session-button" onClick={onTransfer} disabled={!detect.supported}>
        Transfer Session
      </Button>
      <Button testid="receive-session-button" variant="ghost" onClick={onReceive}>
        Receive Session
      </Button>
      <div className="hint">Cookies, storage, IndexedDB &amp; caches are captured for this origin only.</div>
    </div>
  );
}

function Frag({ k, v, muted }: { k: string; v: string; muted?: boolean }) {
  return (
    <>
      <span className={`k ${muted ? 'muted' : ''}`}>{k}</span>
      <span className={`v ${muted ? 'muted' : ''}`}>{v}</span>
    </>
  );
}

function Ready({
  collected,
  showDetails,
  setShowDetails,
  copied,
  onCopyCode,
  onCopyPackage,
  onDownload,
  onDone,
}: {
  collected: Collected;
  showDetails: boolean;
  setShowDetails: (v: boolean) => void;
  copied: 'code' | 'package' | null;
  onCopyCode: () => void;
  onCopyPackage: () => void;
  onDownload: () => void;
  onDone: () => void;
}) {
  return (
    <div className="gap fade-in">
      <div className="center">
        <div className="big-check">✓</div>
        <div className="section-title">Ready to transfer</div>
        <div className="hint">{hostOf(collected.pkg.origin)} · {formatBytes(collected.sizeBytes)}</div>
      </div>

      <div className="code-display" data-testid="transfer-code-display">
        <div className="label">One-time transfer code · expires in {expiresIn(collected.pkg.expiresAt)}</div>
        <div className="code" data-testid="transfer-code">
          {collected.code}
        </div>
      </div>

      <div className="callout info">
        On the other browser: open <b>Receive Session</b>, load the package file (or paste it), and enter this code.
      </div>

      <div className="gap-sm">
        <Button testid="download-package-button" onClick={onDownload}>
          ⬇ Download encrypted package
        </Button>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button testid="copy-code-button" variant="ghost" onClick={onCopyCode}>
            {copied === 'code' ? 'Copied ✓' : 'Copy code'}
          </Button>
          <Button testid="copy-package-button" variant="ghost" onClick={onCopyPackage}>
            {copied === 'package' ? 'Copied ✓' : 'Copy package'}
          </Button>
        </div>
      </div>

      <button className="link-btn" data-testid="toggle-details" onClick={() => setShowDetails(!showDetails)}>
        {showDetails ? 'Hide transfer details' : 'View transfer details'}
      </button>

      {showDetails && (
        <div className="gap-sm fade-in" data-testid="transfer-details">
          <div className="rows">
            {collected.results.map((r) => (
              <ComponentRow
                key={r.component}
                component={r.component}
                status={r.status}
                value={r.error ?? (r.itemCount != null ? String(r.itemCount) : '')}
              />
            ))}
          </div>
          <div className="section-title">Not transferable (by design)</div>
          <div className="callout warn" style={{ fontSize: 10 }}>
            {collected.unsupported.map((u) => (
              <div key={u}>— {u}</div>
            ))}
          </div>
        </div>
      )}

      <Button testid="transfer-done-button" variant="ghost" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}

function Receive({
  packageText,
  setPackageText,
  code,
  setCode,
  fileName,
  onFile,
  onOpenTab,
  onInspect,
  onBack,
}: {
  packageText: string;
  setPackageText: (v: string) => void;
  code: string;
  setCode: (v: string) => void;
  fileName: string;
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Set in the popup: file loading moves to a full tab, where the picker can't close it. */
  onOpenTab?: () => void;
  onInspect: () => void;
  onBack: () => void;
}) {
  const hasPackage = packageText.trim().length > 20;
  const hasCode = code.trim().length >= 8;
  const ready = hasPackage && hasCode;
  const missing = !hasPackage && !hasCode
    ? 'Add the encrypted package and the transfer code to continue.'
    : !hasPackage
      ? 'Add the encrypted package (load the .stpkg file or paste it above). The code alone can’t decrypt anything.'
      : !hasCode
        ? 'Enter the transfer code from the sending device.'
        : '';

  // Route pasted content to the right field: people often paste the code into the
  // package box, or the package into the code box.
  const onPackageChange = (v: string) => {
    if (CODE_PATTERN.test(v.trim())) setCode(v.trim());
    else setPackageText(v);
  };
  const onCodeChange = (v: string) => {
    if (v.trim().startsWith('{')) setPackageText(v.trim());
    else setCode(v);
  };

  return (
    <div className="gap fade-in">
      <div className="section-title">Receive session</div>

      {onOpenTab ? (
        <button className="btn ghost" onClick={onOpenTab} data-testid="load-file-label">
          {fileName ? `📄 ${fileName}` : '📁 Load package file (.stpkg)'}
        </button>
      ) : (
        <label className="btn ghost" style={{ cursor: 'pointer' }} data-testid="load-file-label">
          {fileName ? `📄 ${fileName}` : '📁 Load package file (.stpkg)'}
          <input type="file" accept=".stpkg,.json,application/json" style={{ display: 'none' }} onChange={onFile} data-testid="package-file-input" />
        </label>
      )}

      <textarea
        className="textarea"
        rows={4}
        placeholder="…or paste the encrypted package here"
        value={packageText}
        onChange={(e) => onPackageChange(e.target.value)}
        data-testid="package-textarea"
      />

      <div className="gap-sm">
        <div className="section-title">Transfer code</div>
        <input
          className="input code-input"
          placeholder="ABC7-K9P2-WXYZ"
          value={code}
          onChange={(e) => onCodeChange(e.target.value)}
          data-testid="code-input"
        />
      </div>

      <div className="spacer" />
      {missing && (
        <div className="callout info" style={{ fontSize: 10 }} data-testid="receive-missing-hint">
          {missing}
        </div>
      )}
      <Button testid="inspect-button" onClick={onInspect} disabled={!ready}>
        Continue
      </Button>
      <Button testid="receive-back-button" variant="ghost" onClick={onBack}>
        Back
      </Button>
    </div>
  );
}

function InspectReady({ summary, onImport, onBack }: { summary: PayloadSummary; onImport: () => void; onBack: () => void }) {
  return (
    <div className="gap fade-in">
      <div className="origin-card">
        <div className="section-title">Session available</div>
        <div className="origin-host" data-testid="inspect-origin">
          {hostOf(summary.origin)}
        </div>
        <div className="origin-sub">
          Created {timeAgo(summary.createdAt)} · expires in {expiresIn(summary.expiresAt)}
        </div>
      </div>

      <div className="details-grid" data-testid="inspect-counts">
        {ALL_COMPONENTS.map((c) => (
          <Frag key={c} k={COMPONENT_LABEL[c]} v={String(summary.counts[c])} muted={summary.counts[c] === 0} />
        ))}
      </div>

      {summary.unsupported.length > 0 && (
        <div className="callout warn" style={{ fontSize: 10 }}>
          Not restored (by design): WebAuthn / passkeys, hardware credentials, TLS state.
        </div>
      )}

      <div className="spacer" />
      <Button testid="import-session-button" onClick={onImport}>
        Import Session
      </Button>
      <Button testid="inspect-back-button" variant="ghost" onClick={onBack}>
        Back
      </Button>
    </div>
  );
}

function Conflict({
  conflict,
  strategy,
  setStrategy,
  backup,
  setBackup,
  onContinue,
  onCancel,
}: {
  conflict: { destOrigin: string; counts: Record<TransferComponent, number> };
  strategy: ConflictStrategy;
  setStrategy: (s: ConflictStrategy) => void;
  backup: boolean;
  setBackup: (v: boolean) => void;
  onContinue: () => void;
  onCancel: () => void;
}) {
  const opts: { key: ConflictStrategy; title: string; desc: string }[] = [
    { key: 'cancel', title: 'Cancel', desc: 'Leave the destination untouched (default).' },
    { key: 'replace', title: 'Replace destination session', desc: 'Clear existing state, then restore.' },
    { key: 'merge', title: 'Merge supported state', desc: 'Overwrite matching keys, keep the rest.' },
  ];
  return (
    <div className="gap fade-in">
      <div className="section-title">A session already exists</div>
      <div className="callout warn" data-testid="conflict-message">
        <b>{hostOf(conflict.destOrigin)}</b> already has session data. Choose how to proceed — nothing is overwritten
        silently.
      </div>

      <div className="radio-list" data-testid="conflict-options">
        {opts.map((o) => (
          <label key={o.key} className={`radio ${strategy === o.key ? 'sel' : ''}`} data-testid={`conflict-${o.key}`}>
            <input type="radio" name="strategy" checked={strategy === o.key} onChange={() => setStrategy(o.key)} />
            <div>
              <div className="r-title">{o.title}</div>
              <div className="r-desc">{o.desc}</div>
            </div>
          </label>
        ))}
      </div>

      {strategy === 'replace' && (
        <label className="check-row" data-testid="backup-toggle">
          <input type="checkbox" checked={backup} onChange={(e) => setBackup(e.target.checked)} />
          Back up destination first (encrypted, auto-expires in 30m)
        </label>
      )}

      <div className="spacer" />
      <Button testid="conflict-continue-button" onClick={onContinue} disabled={strategy === 'cancel'}>
        {strategy === 'replace' && backup ? 'Back up & Replace' : 'Continue'}
      </Button>
      <Button testid="conflict-cancel-button" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

function Restored({ data, onOpen, onDone }: { data: { report: VerificationReport; backedUp: boolean }; onOpen: () => void; onDone: () => void }) {
  const { report, backedUp } = data;
  return (
    <div className="gap fade-in">
      <div className="center">
        <div className={`big-check ${report.passed ? '' : 'warn'}`}>{report.passed ? '✓' : '!'}</div>
        <div className="section-title">{report.passed ? 'Session restored' : 'Restored with warnings'}</div>
      </div>

      <div className="rows" data-testid="verification-report">
        {report.lines.map((l) => (
          <div className="row" key={l.component} data-testid={`verify-${l.component}`}>
            <span className="name">
              <StatusIcon status={l.ok ? 'success' : l.expected === 0 ? 'unsupported' : 'partial'} />
              {COMPONENT_LABEL[l.component]}
            </span>
            <span className="val">
              {l.actual} / {l.expected}
            </span>
          </div>
        ))}
      </div>

      <div className={`callout ${report.passed ? 'ok' : 'warn'}`} data-testid="verification-status">
        Verification: {report.passed ? 'Passed' : 'Partial'} · {report.reloaded ? 'page reloaded' : 'reload manually'}
        {backedUp ? ' · destination backed up' : ''}
      </div>

      <div className="callout warn" style={{ fontSize: 10 }}>
        Some state can never be transferred (WebAuthn / passkeys, hardware credentials). You may still need to verify
        those on this device.
      </div>

      <div className="spacer" />
      <Button testid="open-website-button" onClick={onOpen}>
        Open Website
      </Button>
      <Button testid="restored-done-button" variant="ghost" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}
