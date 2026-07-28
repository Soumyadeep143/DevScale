import { LayoutDashboard, Kanban, Table2, ListChecks, StickyNote, Share2, HelpCircle, Plus, Upload, Sun, Moon, Search, RefreshCw, WifiOff } from 'lucide-react';
import { useJobs } from '../context/JobsContext';
import PortalMarquee from './PortalMarquee';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'board', label: 'Board', icon: Kanban },
  { id: 'table', label: 'Table', icon: Table2 },
  { id: 'progress', label: 'LeetCode', icon: ListChecks },
  { id: 'notes', label: 'Notes', icon: StickyNote },
  { id: 'graph', label: 'Graph', icon: Share2 },
  { id: 'guide', label: 'Guide', icon: HelpCircle },
];

export default function Layout({ view, setView, search, setSearch, onAdd, onImport, theme, toggleTheme, children }) {
  const { loading, error, lastSynced, refresh } = useJobs();

  return (
    <div style={{ background: 'var(--page)' }} className="min-h-screen">
      <header className="sticky top-0 z-30 border-b backdrop-blur" style={{ background: 'color-mix(in oklab, var(--surface) 92%, transparent)', borderColor: 'var(--border)' }}>
        <div className="max-w-6xl mx-auto px-3 sm:px-5">
          <div className="flex items-center gap-3 h-14">
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ background: 'var(--brand)' }}>D</div>
              <span className="font-semibold text-sm hidden sm:inline" style={{ color: 'var(--text-primary)' }}>DevScale</span>
            </div>

            <div className="flex-1 min-w-0">
              {(view === 'board' || view === 'table') && (
                <div className="relative max-w-sm">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search company or role…"
                    className="w-full rounded-lg pl-8 pr-3 py-1.5 text-sm outline-none border focus:ring-2"
                    style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={refresh}
                title={lastSynced ? `Synced ${lastSynced.toLocaleTimeString()}` : 'Sync'}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-70"
                style={{ color: error ? 'var(--status-rejected)' : 'var(--text-secondary)' }}
              >
                {error ? <WifiOff size={16} /> : <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />}
              </button>
              <button onClick={toggleTheme} className="w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-70" style={{ color: 'var(--text-secondary)' }} aria-label="Toggle theme">
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <button
                onClick={onImport}
                className="hidden sm:flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm border hover:opacity-80"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                <Upload size={14} /> Import
              </button>
              <button
                onClick={onAdd}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                style={{ background: 'var(--brand)' }}
              >
                <Plus size={15} /> <span className="hidden xs:inline">Add job</span>
              </button>
            </div>
          </div>

          <nav className="flex items-center gap-1 -mb-px overflow-x-auto scrollbar-thin">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = view === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setView(tab.id)}
                  className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors"
                  style={{
                    borderColor: active ? 'var(--brand)' : 'transparent',
                    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                  }}
                >
                  <Icon size={15} /> {tab.label}
                </button>
              );
            })}
            <button
              onClick={onImport}
              className="sm:hidden flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium ml-auto whitespace-nowrap"
              style={{ color: 'var(--text-muted)' }}
            >
              <Upload size={14} /> Import
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-5 py-5">
        {error && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-lg px-4 py-2.5 text-sm" style={{ background: 'color-mix(in oklab, var(--status-rejected) 12%, var(--surface))', color: 'var(--status-rejected)' }}>
            <span>{error}</span>
            <button onClick={refresh} className="underline shrink-0">Retry</button>
          </div>
        )}
        {children}
      </main>

      <div className="max-w-6xl mx-auto px-3 sm:px-5">
        <PortalMarquee />
      </div>

      <footer className="max-w-6xl mx-auto px-5 py-6 text-xs" style={{ color: 'var(--text-muted)' }}>
        {lastSynced ? `Synced with Google Sheets · ${lastSynced.toLocaleTimeString()}` : ''}
      </footer>
    </div>
  );
}
