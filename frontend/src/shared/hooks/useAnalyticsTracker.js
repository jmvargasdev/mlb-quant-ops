import { useEffect } from 'react';
import { apiPath } from '../lib/runtime';

export function useAnalyticsTracker(workspaceId) {
  useEffect(() => {
    if (!workspaceId) return;

    const url = apiPath('/api/analytics/visit');

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace: workspaceId, path: window.location.pathname }),
      keepalive: true,
    }).catch(() => {
      // Silently ignore tracking errors
    });
  }, [workspaceId]);
}
