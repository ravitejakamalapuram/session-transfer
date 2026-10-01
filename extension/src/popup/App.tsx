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
import { clearReadyResult, Collected, loadReadyResult, needsDoneGuard, Ready, saveReadyResult, Saved } from './ready';
import {
  ConflictStrategy,
  PayloadSummary,
  TransferComponent,
  TransferStatus,
  VerificationReport,
} from '../core/types';
import { DetectInfo, OpResponse } from '../core/messages';

type View =
  | 'loading'
  | 'home'
  | 'ready'
  | 'receive'
  | 'inspecting'
  | 'inspect-ready'
  | 'origin-mismatch'
  | 'conflict'
  | 'restoring'
  | 'restored'
  | 'error';

type ProgressMap = Partial<Record<TransferComponent, { status: TransferStatus; itemCount?: number }>>;

// Large sessions take ~1 minute to encrypt; past this the flow is treated as stuck.
const COLLECT_TIMEOUT_MS = 3 * 60 * 1000;
const COLLECT_TIMEOUT_MESSAGE =
  'Collecting the session took too long and was stopped. The page may hold a very large amount of data. Please try again.';

const NOTHING_SAVED: Saved = { package: false, code: false };

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
  const [saved, setSaved] = useState<Saved>(NOTHING_SAVED);
  const [guard, setGuard] = useState(false);

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
  const [collecting, setCollecting] = useState(false);
  const [retry, setRetry] = useState<(() => void) | null>(null);

  const restoreOpts = useRef<{ confirmOriginMismatch?: boolean; conflict?: ConflictStrategy; backup?: boolean }>({});
  const cleanup = useRef<(() => void) | null>(null);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    Promise.all([loadDraft(), IS_RECEIVE_TAB ? null : loadReadyResult()]).then(([draft, ready]) => {
      if (cancelled) return;
      if (ready) {
        setCollected(ready.collected);
        setSaved(ready.saved);
      }
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
          setView(ready ? 'ready' : draft ? 'receive' : 'home');
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

  useEffect(() => {
    if (view === 'ready' && collected) saveReadyResult({ collected, saved });
  }, [view, collected, saved]);

  const toError = (m: string, onRetry: (() => void) | null = null) => {
    setErrorMsg(m);
    setRetry(onRetry ? () => onRetry : null);
    setView('error');
  };

  // ---------------------------------------------------------------- collect
  // Progress is shown on the Home screen the user pressed the button on (no separate screen).
  const startCollect = useCallback(() => {
    setProgress(Object.fromEntries(ALL_COMPONENTS.map((c) => [c, { status: 'pending' as TransferStatus }])));
    setCollecting(true);
    setView('home');
    cleanup.current?.();
    const chunks: string[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      clearTimeout(timer);
      setCollecting(false);
    };
    const fail = (message: string) => {
      cleanup.current?.();
      finish();
      toError(message, startCollect);
    };
    timer = setTimeout(() => fail(COLLECT_TIMEOUT_MESSAGE), COLLECT_TIMEOUT_MS);
    cleanup.current = runOp({ type: 'collect' }, (msg: OpResponse) => {
      if (msg.type === 'progress') {
        setProgress((p) => ({ ...p, [msg.component]: { status: msg.status, itemCount: msg.itemCount } }));
      } else if (msg.type === 'ciphertextChunk') {
        chunks.push(msg.data);
      } else if (msg.type === 'collected') {
        finish();
        setCollected({
          pkg: { ...msg.pkg, ciphertext: chunks.join('') },
          code: msg.code,
          results: msg.results,
          unsupported: msg.unsupported,
          sizeBytes: msg.sizeBytes,
        });
        setSaved(NOTHING_SAVED);
        setGuard(false);
        setView('ready');
      } else if (msg.type === 'error') {
        fail(msg.message);
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
    setSaved((s) => ({ ...s, package: true }));
  };

  const copy = async (what: 'code' | 'package') => {
    if (!collected) return;
    const text = what === 'code' ? collected.code : JSON.stringify(collected.pkg);
    const ok = await navigator.clipboard.writeText(text).then(() => true, () => false);
    if (!ok) return;
    setSaved((s) => ({ ...s, [what]: true }));
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

  const finishTransfer = () => {
    clearReadyResult();
    setCollected(null);
    setSaved(NOTHING_SAVED);
    setGuard(false);
    reset();
  };

  const onDone = () => {
    const expired = collected != null && Date.now() >= collected.pkg.expiresAt;
    if (!expired && needsDoneGuard(saved)) setGuard(true);
    else finishTransfer();
  };

  const onExpired = useCallback(() => {
    clearReadyResult();
  }, []);

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
            collecting={collecting}
            progress={progress}
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

        {view === 'ready' && collected && (
          <Ready
            collected={collected}
            showDetails={showDetails}
            setShowDetails={setShowDetails}
            saved={saved}
            guard={guard}
            copied={copied}
            onCopyCode={() => copy('code')}
            onCopyPackage={() => copy('package')}
            onDownload={downloadPackage}
            onDone={onDone}
            onGoBack={() => setGuard(false)}
            onLeave={finishTransfer}
            onExpired={onExpired}
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
            {retry && (
              <Button testid="error-retry" onClick={retry}>
                Retry
              </Button>
            )}
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
        <span className="lock">v{chrome.runtime.getManifest().version}</span>
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

function Home({
  detect,
  collecting,
  progress,
  onTransfer,
  onReceive,
}: {
  detect: DetectInfo;
  collecting: boolean;
  progress: ProgressMap;
  onTransfer: () => void;
  onReceive: () => void;
}) {
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

      <Button testid="transfer-session-button" onClick={onTransfer} disabled={!detect.supported || collecting}>
        {collecting ? (
          <>
            <span className="spinner" /> Collecting session…
          </>
        ) : (
          'Transfer Session'
        )}
      </Button>
      {collecting ? (
        <div className="rows" data-testid="collect-progress">
          {ALL_COMPONENTS.map((c) => (
            <ComponentRow
              key={c}
              component={c}
              status={progress[c]?.status ?? 'pending'}
              value={progress[c]?.itemCount != null ? String(progress[c]?.itemCount) : ''}
            />
          ))}
        </div>
      ) : (
        <div className="hint" data-testid="transfer-hint">
          Creates 2 things: an encrypted file and a one-time code. You need both on the other browser.
        </div>
      )}
      <Button testid="receive-session-button" variant="ghost" onClick={onReceive} disabled={collecting}>
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

      <div className="section-title" data-testid="receive-step-package">
        ① Encrypted package {hasPackage && <span className="step-check">✓</span>}
      </div>
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
        <div className="section-title" data-testid="receive-step-code">
          ② Transfer code {hasCode && <span className="step-check">✓</span>}
        </div>
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
