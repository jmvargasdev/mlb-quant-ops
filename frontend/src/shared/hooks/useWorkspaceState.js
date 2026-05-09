import { useEffect, useState } from 'react';
import { WORKSPACES, workspaceById } from '../../app/workspaces';

export function useWorkspaceState(initialGameId) {
  const [workspaceId, setWorkspaceId] = useState(WORKSPACES[0].id);
  const [focusedGameId, setFocusedGameId] = useState(initialGameId || null);

  useEffect(() => {
    if (initialGameId && !focusedGameId) {
      setFocusedGameId(initialGameId);
    }
  }, [initialGameId, focusedGameId]);

  return {
    workspaceId,
    setWorkspaceId,
    workspace: workspaceById(workspaceId),
    focusedGameId,
    setFocusedGameId,
  };
}
