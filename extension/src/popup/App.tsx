import { useCallback, useEffect, useRef, useState } from 'react';
import { runOp } from './port';
import { COLLECT_TIMEOUT_MS, DRAFT_TTL_MS } from '../core/limits';
import { parseExtraDomains } from '../core/storage-state';
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
const COLLECT_TIMEOUT_MESSAGE =
  'Collecting the session took too long and was stopped. The page may hold a very large amount of data. Please try again.';

const NOTHING_SAVED: Saved = { package: false, code: false };

// "Encrypt with a transfer code" setting. Per profile (storage.local), absent = OFF.
const SETTING_KEY = 'settings.requireTransferCode';
async function loadRequireCode(): Promise<boolean> {
  try {
    return (await chrome.storage.local.get(SETTING_KEY))[SETTING_KEY] === true;
  } catch {
    return false;
  }
}

const LOGO = chrome.runtime.getURL('icons/icon48.png');
const FEEDBACK_URL = 'https://chromewebstore.google.com/detail/fnfmlchbfofjdfeibgdkcibfjjlfcefc/reviews';

// The popup closes whenever it loses focus (switching windows to copy the package or
// code, or opening the file picker), which used to wipe the Receive form. The form is
// kept in chrome.storage.session (memory only, extension-only) until it is used or
// abandoned, and file loading happens in a full tab where the picker can't close it.
const DRAFT_KEY = 'receiveDraft';
const IS_RECEIVE_TAB = location.hash === '#receive';
// A package this big is not shown in (or drafted from) the textarea: rendering and
// serialising tens of MB on every change froze the receiver tab.
const LARGE_PACKAGE_CHARS = 2 * 1024 * 1024;
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
  const [requireCode, setRequireCode] = useState(false);
  const [extraDomains, setExtraDomains] = useState('');
  const [exportNote, setExportNote] = useState('');
  const [exporting, setExporting] = useState(false);
  const exportInProgress = useRef(false);
  const [codeNeeded, setCodeNeeded] = useState(false);
  const savedRef = useRef<Saved>(NOTHING_SAVED);
  savedRef.current = saved;

  const [packageText, setPackageTextRaw] = useState('');
  const setPackageText = (v: string) => {
    setPackageTextRaw(v);
    setCodeNeeded(false);
  };
  const [code, setCode] = useState('');
  const [fileName, setFileName] = useState('');

  const [summary, setSummary] = useState<PayloadSummary | null>(null);
  const [mismatch, setMismatch] = useState<{ packageOrigin: string; destOrigin: string } | null>(null);
  const [conflict, setConflict] = useState<{ destOrigin: string; counts: Record<TransferComponent, number> } | null>(null);
  const [strategy, setStrategy] = useState<ConflictStrategy>('cancel');
  const [report, setReport] = useState<{ report: VerificationReport } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [collecting, setCollecting] = useState(false);
  const [retry, setRetry] = useState<(() => void) | null>(null);

  const restoreOpts = useRef<{ confirmOriginMismatch?: boolean; conflict?: ConflictStrategy }>({});
  const cleanup = useRef<(() => void) | null>(null);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    Promise.all([loadDraft(), IS_RECEIVE_TAB ? null : loadReadyResult(), loadRequireCode()]).then(([draft, ready, req]) => {
      if (cancelled) return;
      setRequireCode(req);
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
    if (view === 'receive' && (packageText || code || fileName) && packageText.length <= LARGE_PACKAGE_CHARS) saveDraft({ packageText, code, fileName });
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
    cleanup.current = runOp({ type: 'collect', requireCode, extraDomains: parseExtraDomains(extraDomains).domains }, (msg: OpResponse) => {
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
  }, [requireCode, extraDomains]);

  // ---------------------------------------------------------------- inspect
  const startInspect = useCallback(() => {
    setView('inspecting');
    cleanup.current?.();
    cleanup.current = runOp({ type: 'inspect', packageText, code: code.trim() || undefined }, (msg) => {
      if (msg.type === 'inspected') {
        setSummary(msg.summary);
        setView('inspect-ready');
      } else if (msg.type === 'codeRequired') {
        setCodeNeeded(true);
        setView('receive');
      } else if (msg.type === 'error') {
        toError(msg.message);
      }
    });
  }, [packageText, code]);

  // ---------------------------------------------------------------- restore
  const runRestore = useCallback(
    (extra: { confirmOriginMismatch?: boolean; conflict?: ConflictStrategy }) => {
      restoreOpts.current = { ...restoreOpts.current, ...extra };
      setView('restoring');
      cleanup.current?.();
      cleanup.current = runOp(
        { type: 'restore', packageText, code: code.trim() || undefined, ...restoreOpts.current },
        (msg) => {
          if (msg.type === 'originMismatch') {
            setMismatch({ packageOrigin: msg.packageOrigin, destOrigin: msg.destOrigin });
            setView('origin-mismatch');
          } else if (msg.type === 'conflict') {
            setConflict({ destOrigin: msg.destOrigin, counts: msg.counts });
            setView('conflict');
          } else if (msg.type === 'codeRequired') {
            setCodeNeeded(true);
            setView('receive');
          } else if (msg.type === 'restored') {
            setReport({ report: msg.report });
            setView('restored');
          } else if (msg.type === 'error') {
            toError(msg.message);
          }
        },
      );
    },
    [packageText, code],
  );

  // ---------------------------------------------------------------- export for Playwright
  const exportState = () => {
    if (exportInProgress.current) return; // one export at a time: no duplicate downloads
    exportInProgress.current = true;
    setExporting(true);
    setExportNote('');
    let stop: (() => void) | undefined;
    let finished = false;
    const finish = () => {
      finished = true;
      exportInProgress.current = false;
      setExporting(false);
      stop?.();
    };
    stop = runOp({ type: 'exportState', extraDomains: parseExtraDomains(extraDomains).domains }, (msg: OpResponse) => {
      if (msg.type === 'stateExported') {
        const blob = new Blob([msg.json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `storageState-${msg.host}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        setExportNote(
          `Saved storageState-${msg.host}.json: ${msg.cookies} cookies, ${msg.localStorage} localStorage items` +
            (msg.skippedPartitioned ? `, ${msg.skippedPartitioned} partitioned cookies left out` : '') +
            '. It holds live logins: treat it like a password.',
        );
        finish();
      } else if (msg.type === 'error') {
        setExportNote(msg.message);
        finish();
      }
    });
    if (finished) stop(); // runOp answered before it returned
  };

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
    const text = what === 'code' ? collected.code ?? '' : JSON.stringify(collected.pkg);
    const ok = await navigator.clipboard.writeText(text).then(() => true, () => false);
    if (!ok) return;
    setSaved((s) => ({ ...s, [what]: true, copied: true }));
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setPackageText(String(reader.result ?? ''));
    reader.onerror = () => toError('Could not read the file.');
    reader.readAsText(file);
  };

  const openReceiveTab = () => {
    if (packageText.length <= LARGE_PACKAGE_CHARS) saveDraft({ packageText, code, fileName });
    chrome.tabs.create({ url: chrome.runtime.getURL('index.html#receive') });
    window.close();
  };

  // Done overwrites the clipboard (we cannot read it to check it still holds our text; that
  // needs clipboardRead). Needs a user gesture, so it is best-effort when the popup timer fires.
  const clearClipboard = () => {
    if (savedRef.current.copied) navigator.clipboard.writeText('').catch(() => undefined);
  };

  const finishTransfer = () => {
    clearClipboard();
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
    if (savedRef.current.copied) navigator.clipboard.writeText('').catch(() => undefined);
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
          <div className="sub">Move a logged-in session</div>
        </div>
      </header>

      <main className="body">
        {view === 'loading' && <Loading />}

        {view === 'home' && detect && (
          <Home
            detect={detect}
            requireCode={requireCode}
            onRequireCode={(v) => {
              setRequireCode(v);
              chrome.storage.local.set({ [SETTING_KEY]: v }).catch(() => undefined);
            }}
            collecting={collecting}
            progress={progress}
            onTransfer={startCollect}
            extraDomains={extraDomains}
            setExtraDomains={setExtraDomains}
            onExportState={exportState}
            exportNote={exportNote}
            exporting={exporting}
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
            codeNeeded={codeNeeded}
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
            onContinue={() =>
              runRestore({ conflict: strategy, confirmOriginMismatch: true })
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
        <span className="lock">🔒 Local only · No server</span>
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
  requireCode,
  onRequireCode,
  collecting,
  progress,
  onTransfer,
  extraDomains,
  setExtraDomains,
  onExportState,
  exportNote,
  exporting,
  onReceive,
}: {
  detect: DetectInfo;
  requireCode: boolean;
  onRequireCode: (v: boolean) => void;
  collecting: boolean;
  progress: ProgressMap;
  onTransfer: () => void;
  extraDomains: string;
  setExtraDomains: (v: string) => void;
  onExportState: () => void;
  exportNote: string;
  exporting: boolean;
  onReceive: () => void;
}) {
  const extra = parseExtraDomains(extraDomains);
  const blocked = !detect.supported || collecting || extra.invalid.length > 0;
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

      <Button testid="transfer-session-button" onClick={onTransfer} disabled={blocked}>
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
          {requireCode
            ? 'Creates 2 things: an encrypted file and a transfer code. You need both on the other browser.'
            : 'Creates one package to copy or download. It is not encrypted, so treat it like a password.'}
        </div>
      )}
      <label className="check-row" data-testid="require-code-toggle">
        <input
          type="checkbox"
          checked={requireCode}
          disabled={collecting}
          onChange={(e) => onRequireCode(e.target.checked)}
          data-testid="require-code-checkbox"
        />
        Encrypt with a transfer code (more secure)
      </label>
      <Button testid="receive-session-button" variant="ghost" onClick={onReceive} disabled={collecting}>
        Receive Session
      </Button>
      <details className="more" data-testid="more-options">
        <summary>More options</summary>
        <div className="gap-sm">
          <label className="hint" htmlFor="extra-domains">
            Also include cookies from other sites (for sign-in pages), e.g. accounts.example.com. Up to 5 host names.
          </label>
          <input
            id="extra-domains"
            className="input"
            data-testid="extra-domains-input"
            value={extraDomains}
            placeholder="accounts.example.com, login.example.org"
            onChange={(e) => setExtraDomains(e.target.value)}
          />
          {extra.invalid.length > 0 && (
            <div className="callout danger" data-testid="extra-domains-error">
              Not a plain host name: {extra.invalid.join(', ')}
            </div>
          )}
          <Button testid="export-state-button" variant="ghost" onClick={onExportState} disabled={blocked || exporting}>
            Export for Playwright (.json)
          </Button>
          <div className="hint">Saves this site's cookies and localStorage as a Playwright storageState file for tests.</div>
          {exportNote && (
            <div className="callout info" data-testid="export-note">
              {exportNote}
            </div>
          )}
        </div>
      </details>
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
  codeNeeded,
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
  /** The package asked for a transfer code (code mode / older packages). */
  codeNeeded: boolean;
  fileName: string;
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Set in the popup: file loading moves to a full tab, where the picker can't close it. */
  onOpenTab?: () => void;
  onInspect: () => void;
  onBack: () => void;
}) {
  const hasPackage = packageText.trim().length > 20;
  const hasCode = code.trim().length >= 8;
  const showCode = codeNeeded || hasCode;
  const ready = hasPackage && (!codeNeeded || hasCode);
  const missing = !hasPackage
    ? 'Add the package: load the .stpkg file or paste the text above.'
    : codeNeeded && !hasCode
      ? 'This package needs a transfer code. Enter the code from the sending device.'
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
        Package {hasPackage && <span className="step-check">✓</span>}
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

      {packageText.length > LARGE_PACKAGE_CHARS ? (
        <div className="callout info" style={{ fontSize: 10 }} data-testid="package-loaded-large">
          Large package loaded ({(packageText.length / 1024 / 1024).toFixed(0)} MB). It is not shown here.
        </div>
      ) : (
        <textarea
          className="textarea"
          rows={4}
          placeholder="…or paste the package here"
          value={packageText}
          onChange={(e) => onPackageChange(e.target.value)}
          data-testid="package-textarea"
        />
      )}

      {showCode && (
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
      )}

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
  onContinue,
  onCancel,
}: {
  conflict: { destOrigin: string; counts: Record<TransferComponent, number> };
  strategy: ConflictStrategy;
  setStrategy: (s: ConflictStrategy) => void;
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

      <div className="spacer" />
      <Button testid="conflict-continue-button" onClick={onContinue} disabled={strategy === 'cancel'}>
        Continue
      </Button>
      <Button testid="conflict-cancel-button" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

function Restored({ data, onOpen, onDone }: { data: { report: VerificationReport }; onOpen: () => void; onDone: () => void }) {
  const { report } = data;
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
