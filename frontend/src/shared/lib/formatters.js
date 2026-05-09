export function fmt(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'n/a';
  return Number(value).toFixed(digits);
}

export function pct(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'n/a';
  return `${Number(value).toFixed(digits)}%`;
}

export function signedPoints(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'n/a';
  const numeric = Number(value);
  const prefix = numeric > 0 ? '+' : '';
  return `${prefix}${numeric.toFixed(digits)} pts`;
}

export function timestampLabel(value) {
  if (!value) return 'n/a';
  return new Date(value).toLocaleTimeString();
}

export function timestampFull(value) {
  if (!value) return 'n/a';
  return new Date(value).toLocaleString();
}

export function timeAgo(value) {
  if (!value) return 'n/a';
  const deltaMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(deltaMs)) return 'n/a';
  const seconds = Math.max(1, Math.round(deltaMs / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function statusTone(value) {
  if (value === null || value === undefined) return 'text-slate-400';
  if (value >= 85) return 'metric-good';
  if (value >= 65) return 'metric-warn';
  return 'metric-bad';
}

export function compactList(values) {
  return values?.length ? values.join(', ') : 'none';
}

export function humanizeFlag(value) {
  return String(value ?? 'unknown').replaceAll('_', ' ');
}
