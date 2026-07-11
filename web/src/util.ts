// Formatting and PII-masking helpers. No em dashes in any output string.

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}

export function maskName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 1) return full;
  const last = parts[parts.length - 1];
  return [...parts.slice(0, -1), `${last.slice(0, 1)}.`].join(' ');
}

export function fmtTime(ts?: number): string {
  if (!ts) return '...';
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function fmtDateTime(ts?: number): string {
  if (!ts) return '...';
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtUsd(v: number): string {
  return `$${v.toFixed(4)}`;
}

export function fmtMs(ms: number): string {
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

export function isToday(ts: number): boolean {
  const d = new Date(ts);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 3) + '...' : s;
}
