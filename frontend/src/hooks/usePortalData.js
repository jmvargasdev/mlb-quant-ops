import { startTransition, useEffect, useRef, useState } from 'react';
import { getClientRefreshInterval, uncachedApiPath } from '../shared/lib/runtime';

function computeInterval(overview) {
  return overview?.meta?.refresh_policy?.interval_ms ?? getClientRefreshInterval(120000);
}

export function usePortalData() {
  const [overview, setOverview] = useState(null);
  const [gameId, setGameId] = useState(null);
  const [gameDetail, setGameDetail] = useState(null);
  const [status, setStatus] = useState({ loading: true, refreshing: false, error: null, lastUpdated: null });
  const signatureRef = useRef(null);

  useEffect(() => {
    let active = true;
    let timeoutId;

    async function loadOverview({ background = false } = {}) {
      if (!background) {
        setStatus((current) => ({ ...current, loading: true, error: null }));
      } else {
        setStatus((current) => ({ ...current, refreshing: true, error: null }));
      }

      try {
        const response = await fetch(uncachedApiPath('/api/portal/overview'), {
          cache: 'no-store',
        });
        if (!response.ok) throw new Error(`Overview request failed with ${response.status}`);
        const payload = await response.json();
        if (!active) return;

        startTransition(() => {
          setOverview(payload);
          if (!gameId && payload.game_index?.length) {
            setGameId(payload.sections?.top_bettable?.[0]?.game_id || payload.game_index[0].game_id);
          }
        });

        signatureRef.current = payload.meta?.latest_snapshot_signature || null;
        setStatus((current) => ({
          ...current,
          loading: false,
          refreshing: false,
          lastUpdated: new Date().toISOString(),
        }));

        timeoutId = window.setTimeout(() => {
          loadOverview({ background: true });
        }, computeInterval(payload));
      } catch (error) {
        if (!active) return;
        setStatus((current) => ({
          ...current,
          loading: false,
          refreshing: false,
          error: error.message,
        }));
        timeoutId = window.setTimeout(() => {
          loadOverview({ background: true });
        }, getClientRefreshInterval(120000));
      }
    }

    loadOverview();

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (!gameId) return undefined;
    let active = true;

    async function loadGame() {
      const response = await fetch(uncachedApiPath(`/api/portal/games/${gameId}`), {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`Game request failed with ${response.status}`);
      const payload = await response.json();
      if (!active) return;
      startTransition(() => {
        setGameDetail(payload);
      });
    }

    loadGame().catch((error) => {
      if (!active) return;
      setStatus((current) => ({ ...current, error: error.message }));
    });

    return () => {
      active = false;
    };
  }, [gameId, overview?.meta?.latest_snapshot_signature]);

  return {
    overview,
    gameId,
    setGameId,
    gameDetail,
    status,
  };
}
