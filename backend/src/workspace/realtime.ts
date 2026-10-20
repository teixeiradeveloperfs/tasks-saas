type Listener = (event: string) => void;

const listeners = new Map<string, Set<Listener>>();

export function subscribeWorkspace(workspaceId: string, listener: Listener) {
  const current = listeners.get(workspaceId) ?? new Set<Listener>();
  current.add(listener);
  listeners.set(workspaceId, current);
  return () => {
    current.delete(listener);
    if (current.size === 0) listeners.delete(workspaceId);
  };
}

export function publishWorkspaceChange(workspaceId: string) {
  for (const listener of listeners.get(workspaceId) ?? []) listener("board.changed");
}
