import { startTransition, useEffect, useState } from 'react';
import { apiPath, getClientRefreshInterval } from '../../shared/lib/runtime';

export function useResearchWorkspace(enabled, intervalMs = 120000) {
  const [data, setData] = useState(null);
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

    async function loadResearch({ background = false } = {}) {
      setStatus((current) => ({
        ...current,
        loading: !background && !current.lastUpdated,
        refreshing: background,
        error: null,
      }));

      try {
        const response = await fetch(apiPath('/api/portal/research'));
        if (!response.ok) throw new Error(`Research request failed with ${response.status}`);
        const payload = await response.json();
        if (!active) return;
        startTransition(() => {
          setData(payload);
        });
        setStatus((current) => ({
          ...current,
          loading: false,
          refreshing: false,
          error: null,
          lastUpdated: payload?.meta?.generated_at || new Date().toISOString(),
        }));
        timeoutId = window.setTimeout(() => loadResearch({ background: true }), intervalMs);
      } catch (error) {
        if (!active) return;
        setStatus((current) => ({
          ...current,
          loading: false,
          refreshing: false,
          error: error.message,
        }));
        timeoutId = window.setTimeout(() => loadResearch({ background: true }), Math.max(intervalMs, getClientRefreshInterval(120000)));
      }
    }

    loadResearch();
    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [enabled, intervalMs]);

  return { data, status };
}
