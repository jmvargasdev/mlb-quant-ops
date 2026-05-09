import { startTransition, useEffect, useState } from 'react';

export function useFocusedGame(gameId, overviewSignature) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!gameId) return undefined;
    let active = true;

    async function loadGame() {
      const response = await fetch(`/api/portal/games/${gameId}`);
      if (!response.ok) throw new Error(`Game request failed with ${response.status}`);
      const payload = await response.json();
      if (!active) return;
      startTransition(() => {
        setDetail(payload);
        setError(null);
      });
    }

    loadGame().catch((nextError) => {
      if (!active) return;
      setError(nextError.message);
    });

    return () => {
      active = false;
    };
  }, [gameId, overviewSignature]);

  return { detail, error };
}
