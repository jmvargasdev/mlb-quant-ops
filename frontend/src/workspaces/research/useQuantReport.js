import { startTransition, useEffect, useState } from 'react';
import { apiPath, getClientRefreshInterval } from '../../shared/lib/runtime';

export function useQuantReport(enabled, intervalMs = 120000) {
  const [report, setReport] = useState(null);
  const [status, setStatus] = useState({
    loading: false,
    refreshing: false,
    error: null,
    lastUpdated: null,
  });

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    let timeoutId;

    async function loadReport({ background = false } = {}) {
      setStatus((current) => ({
        ...current,
        loading: !background && !current.lastUpdated,
        refreshing: background,
        error: null,
      }));

      try {
        const response = await fetch(apiPath('/api/portal/quant-report'));
        if (!response.ok) throw new Error(`Quant report request failed with ${response.status}`);
        const payload = await response.json();
        if (!active) return;
        startTransition(() => {
          setReport(payload);
        });
        setStatus((current) => ({
          ...current,
          loading: false,
          refreshing: false,
          error: null,
          lastUpdated: payload?.meta?.generated_at || new Date().toISOString(),
        }));
        timeoutId = window.setTimeout(() => loadReport({ background: true }), intervalMs);
      } catch (error) {
        if (!active) return;
        setStatus((current) => ({
          ...current,
          loading: false,
          refreshing: false,
          error: error.message,
        }));
        timeoutId = window.setTimeout(() => loadReport({ background: true }), Math.max(intervalMs, getClientRefreshInterval(120000)));
      }
    }

    loadReport();
    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [enabled, intervalMs]);

  return { report, status };
}
