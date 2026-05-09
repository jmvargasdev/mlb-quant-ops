function parseRefreshInterval(value, fallback = 120000) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 1000 ? numeric : fallback;
}

export function getApiBaseUrl() {
  return (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
}

export function apiPath(pathname) {
  const base = getApiBaseUrl();
  return base ? `${base}${pathname}` : pathname;
}

export function getClientRefreshInterval(fallback = 120000) {
  return parseRefreshInterval(import.meta.env.VITE_REFRESH_INTERVAL, fallback);
}

