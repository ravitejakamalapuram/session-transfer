import { TransferComponent, TransferStatus } from '../../core/types';

export const COMPONENT_LABEL: Record<TransferComponent, string> = {
  cookies: 'Cookies',
  localStorage: 'Local Storage',
  sessionStorage: 'Session Storage',
  indexedDB: 'IndexedDB',
  cacheStorage: 'Cache Storage',
};

export const ALL_COMPONENTS: TransferComponent[] = [
  'cookies',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'cacheStorage',
];

const STATUS_GLYPH: Record<TransferStatus, string> = {
  success: '\u2713', // ✓
  partial: '\u26A0', // ⚠
  failed: '\u2717', // ✗
  unsupported: '\u2014', // —
  pending: '\u25CB', // ○
  running: '',
};

export function StatusIcon({ status }: { status: TransferStatus }) {
  if (status === 'running') return <span className="spinner" data-testid="status-running" />;
  return (
    <span className={`status-icon ${status}`} data-testid={`status-${status}`}>
      {STATUS_GLYPH[status]}
    </span>
  );
}

export function ComponentRow({
  component,
  status,
  value,
}: {
  component: TransferComponent;
  status: TransferStatus;
  value?: string;
}) {
  return (
    <div className="row fade-in" data-testid={`row-${component}`}>
      <span className="name">
        <StatusIcon status={status} />
        {COMPONENT_LABEL[component]}
      </span>
      <span className="val">{value ?? ''}</span>
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  testid,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  testid: string;
}) {
  return (
    <button className={`btn ${variant}`} onClick={onClick} disabled={disabled} data-testid={testid}>
      {children}
    </button>
  );
}

export function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

export function expiresIn(ts: number): string {
  const s = Math.round((ts - Date.now()) / 1000);
  if (s <= 0) return 'expired';
  if (s < 60) return `${s}s`;
  return `${Math.round(s / 60)}m`;
}

export function hostOf(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}
