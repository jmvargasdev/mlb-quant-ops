import { startTransition, useEffect, useState } from 'react';
import { apiPath, getClientRefreshInterval } from '../lib/runtime';

function computeInterval(overview) {
  return overview?.meta?.refresh_policy?.interval_ms ?? getClientRefreshInterval(120000);
}

export function usePortalOverview() {
  const [overview, setOverview] = useState(null);
  const [status, setStatus] = useState({
    loading: true,
    refreshing: false,
    error: null,
    lastUpdated: null,
    latestSnapshotAt: null,
  });

  useEffect(() => {
    let active = true;
    let timeoutId;

    async function loadOverview({ background = false } = {}) {
      setStatus((current) => ({
        ...current,
        loading: !background && !current.lastUpdated,
        refreshing: background,
        error: null,
      }));

      try {
        const response = await fetch(apiPath('/api/portal/overview'));
        if (!response.ok) throw new Error(`Overview request failed with ${response.status}`);
        const payload = await response.json();
        if (!active) return;
        startTransition(() => {
          setOverview(payload);
        });
        const resolvedLastUpdated = payload?.meta?.generated_at || new Date().toISOString();
        const resolvedLatestSnapshotAt = payload?.meta?.latest_snapshot_time || null;
        setStatus((current) => ({
          ...current,
          loading: false,
          refreshing: false,
          error: null,
          lastUpdated: resolvedLastUpdated,
          latestSnapshotAt: resolvedLatestSnapshotAt,
        }));
        timeoutId = window.setTimeout(() => loadOverview({ background: true }), computeInterval(payload));
      } catch (error) {
        if (!active) return;
        setStatus((current) => ({
          ...current,
          loading: false,
          refreshing: false,
          error: error.message,
        }));
        timeoutId = window.setTimeout(() => loadOverview({ background: true }), getClientRefreshInterval(120000));
      }
    }

    loadOverview();
    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, []);

  return { overview, status };
}
