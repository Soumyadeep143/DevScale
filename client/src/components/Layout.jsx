import { useJobs } from '../context/JobsContext';
import PortalMarquee from './PortalMarquee';
import AppHeader from './AppHeader';
import MobileBottomNavigation from './MobileBottomNavigation';
import { WORKSPACE_TABS } from '../lib/workspaces';

// Shared chrome for every page: header + workspace switch, tab navigation
// (top on tablet/desktop, bottom on phones) and the page container.
export default function Layout({ workspace = 'personal', setWorkspace, view, setView, children }) {
  const { session, loading, error, lastSynced, refresh, signOut } = useJobs();
  const tabs = WORKSPACE_TABS[workspace] || WORKSPACE_TABS.personal;

  return (
    <div style={{ background: 'var(--page)' }} className="min-h-screen has-bottom-nav md:pb-0 overflow-x-clip">
      <AppHeader
        workspace={workspace} setWorkspace={setWorkspace} tabs={tabs} view={view} setView={setView}
        session={session} loading={loading} error={error} lastSynced={lastSynced} onRefresh={refresh} onSignOut={signOut}
      />

      <main className="min-w-0 max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
        {error && (
          <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-lg px-4 py-2.5 text-sm"
            style={{ background: 'color-mix(in oklab, var(--red) 12%, var(--surface))', color: 'var(--red)' }}>
            <span>{error}</span>
            <button onClick={refresh} className="underline shrink-0">Retry</button>
          </div>
        )}
        {children}
      </main>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 hidden md:block"><PortalMarquee /></div>
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 py-6 text-xs hidden md:block" style={{ color: 'var(--text-muted)' }}>
        {lastSynced ? `Synced with Supabase · ${lastSynced.toLocaleTimeString()}` : ''}
      </footer>

      <MobileBottomNavigation workspace={workspace} view={view} setView={setView} />
    </div>
  );
}
