import { useEffect, useState } from 'react';
import { Button, ComponentRow, hostOf } from './components/ui';
import { EncryptedPackage, TransferComponentResult } from '../core/types';

export interface Collected {
  pkg: EncryptedPackage;
  code: string;
  results: TransferComponentResult[];
  unsupported: string[];
  sizeBytes: number;
}

/** Which half of the transfer the user has taken away (downloaded/copied). */
export interface Saved {
  package: boolean;
  code: boolean;
}

export interface ReadyResult {
  collected: Collected;
  saved: Saved;
}

// The popup closes whenever it loses focus (e.g. to write the code down), which used to
// lose the package and the code. The Ready result is kept in chrome.storage.session (memory
// only, extension-only, like the receive draft) until Done or until the package expires.
// See docs/threat-model.md #2.
const READY_KEY = 'readyResult';

type SessionArea = Pick<chrome.storage.StorageArea, 'get' | 'set' | 'remove'>;
const session = (): SessionArea => chrome.storage.session;

export async function loadReadyResult(area: SessionArea = session(), now = Date.now()): Promise<ReadyResult | null> {
  try {
    const result = (await area.get(READY_KEY))[READY_KEY] as ReadyResult | undefined;
    if (!result) return null;
    if (now >= result.collected.pkg.expiresAt) {
      await area.remove(READY_KEY);
      return null;
    }
    return result;
  } catch {
    return null;
  }
}

export function saveReadyResult(result: ReadyResult, area: SessionArea = session()): Promise<void> {
  return area.set({ [READY_KEY]: result }).catch(() => undefined);
}

export function clearReadyResult(area: SessionArea = session()): Promise<void> {
  return area.remove(READY_KEY).catch(() => undefined);
}

/** Done leaves without a warning only once the package is saved: the code alone is useless. */
export function needsDoneGuard(saved: Saved): boolean {
  return !saved.package;
}

export function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

export function Ready({
  collected,
  saved,
  guard,
  showDetails,
  setShowDetails,
  copied,
  onCopyCode,
  onCopyPackage,
  onDownload,
  onDone,
  onGoBack,
  onLeave,
  onExpired,
}: {
  collected: Collected;
  saved: Saved;
  /** True while the "you haven't saved the package" question is shown. */
  guard: boolean;
  showDetails: boolean;
  setShowDetails: (v: boolean) => void;
  copied: 'code' | 'package' | null;
  onCopyCode: () => void;
  onCopyPackage: () => void;
  onDownload: () => void;
  onDone: () => void;
  onGoBack: () => void;
  onLeave: () => void;
  onExpired: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const remaining = collected.pkg.expiresAt - now;
  const expired = remaining <= 0;

  useEffect(() => {
    if (expired) {
      onExpired();
      return;
    }
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expired, onExpired]);

  return (
    <div className="gap fade-in">
      <div className="center">
        <div className="big-check">✓</div>
        <div className="section-title">Ready to transfer</div>
        <div className="hint">{hostOf(collected.pkg.origin)} · {formatBytes(collected.sizeBytes)}</div>
      </div>

      <div className="callout warn" data-testid="need-both">
        You need <b>BOTH</b> on the other browser. Neither works alone.
      </div>

      <div className={`step ${saved.package ? 'done' : ''}`} data-testid="step-package">
        <div className="step-head">
          <span className="step-title">① Encrypted package <span className="step-what">the session</span></span>
          <span className="step-status" data-testid="package-status">{saved.package ? '✓ saved' : 'not saved'}</span>
        </div>
        <div className="step-actions">
          <Button testid="download-package-button" variant="ghost" onClick={onDownload} disabled={expired}>
            ⬇ Download
          </Button>
          <Button testid="copy-package-button" variant="ghost" onClick={onCopyPackage} disabled={expired}>
            {copied === 'package' ? 'Copied ✓' : 'Copy'}
          </Button>
        </div>
      </div>

      <div className={`step ${saved.code ? 'done' : ''}`} data-testid="step-code">
        <div className="step-head">
          <span className="step-title">② Transfer code <span className="step-what">the key</span></span>
          <span className="step-status" data-testid="code-status">{saved.code ? '✓ copied' : 'not copied'}</span>
        </div>
        <div className="step-code" data-testid="transfer-code">
          {collected.code}
        </div>
        <div className="step-actions">
          <Button testid="copy-code-button" variant="ghost" onClick={onCopyCode} disabled={expired}>
            {copied === 'code' ? 'Copied ✓' : 'Copy code'}
          </Button>
        </div>
      </div>

      <div className={`hint ${expired ? 'expired' : ''}`} data-testid="expiry-countdown">
        {expired ? 'Expired. Start a new transfer.' : `Expires in ${countdown(remaining)}`}
      </div>

      <div className="hint">
        Send them by different routes (e.g. file by drive, code by chat). On the other browser: <b>Receive Session</b>.
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

      {guard ? (
        <div className="gap-sm" data-testid="done-guard">
          <div className="callout danger">
            You haven't saved the package. The code alone can't restore the session. Leave anyway?
          </div>
          <div className="step-actions">
            <Button testid="done-guard-back" onClick={onGoBack}>
              Go back
            </Button>
            <Button testid="done-guard-leave" variant="danger" onClick={onLeave}>
              Leave
            </Button>
          </div>
        </div>
      ) : (
        <Button testid="transfer-done-button" variant="ghost" onClick={onDone}>
          Done
        </Button>
      )}
    </div>
  );
}
