import { useEffect, useMemo, useState } from 'react';
import { uncachedApiPath } from '../../shared/lib/runtime';

export default function useHistoricalSelections() {
  const [data, setData] = useState({ rows: [], summary: {} });
  const [status, setStatus] = useState({ loading: true, error: null });

  useEffect(() => {
    let active = true;

    async function load() {
      setStatus({ loading: true, error: null });
      try {
        const response = await fetch(uncachedApiPath('/api/portal/historical-selections'), {
          cache: 'no-store',
        });
        if (!response.ok) throw new Error(`Historical selections request failed with ${response.status}`);
        const payload = await response.json();
        if (!active) return;
        setData(payload);
        setStatus({ loading: false, error: null });
      } catch (error) {
        if (!active) return;
        setStatus({ loading: false, error: error.message });
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  return useMemo(() => ({
    rows: data.rows || [],
    summary: data.summary || {},
    generatedAt: data.generated_at || null,
    status,
  }), [data, status]);
}
