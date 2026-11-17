import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_VIEWS, formatRoute, loadWorkspace, parseRoute, saveWorkspace } from './workspaces';

// Workspace + per-workspace tab, kept in sync with location.hash so refresh, deep links and
// browser back/forward all work. Switching is pure client state: no refetching.
export function useWorkspaceRoute() {
  const [state, setState] = useState(() => {
    const r = parseRoute(window.location.hash);
    const workspace = r ? r.workspace : loadWorkspace();
    return { workspace, views: { ...DEFAULT_VIEWS, ...(r ? { [workspace]: r.view } : {}) } };
  });

  useEffect(() => {
    // Normalise an empty URL; leave any other hash alone (e.g. Supabase auth links).
    const want = formatRoute(state.workspace, state.views[state.workspace]);
    if (window.location.hash === '') window.history.replaceState(null, '', want);
    const onHash = () => {
      const r = parseRoute(window.location.hash);
      if (!r) return;
      saveWorkspace(r.workspace);
      setState((p) => (p.workspace === r.workspace && p.views[r.workspace] === r.view
        ? p
        : { workspace: r.workspace, views: { ...p.views, [r.workspace]: r.view } }));
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = useCallback((workspace, view) => {
    saveWorkspace(workspace);
    setState((p) => ({ workspace, views: { ...p.views, [workspace]: view } }));
    const hash = formatRoute(workspace, view);
    if (window.location.hash !== hash) window.location.hash = hash; // pushes a history entry
  }, []);

  const { workspace, views } = state;
  const setWorkspace = useCallback((next) => go(next, views[next]), [go, views]);
  const setView = useCallback((next) => go(workspace, next), [go, workspace]);
  return { workspace, view: views[workspace], setWorkspace, setView, go };
}
