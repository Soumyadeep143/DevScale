import { useEffect, useRef, useState } from 'react';
import { LogOut, Moon, RefreshCw, Sun, User, WifiOff } from 'lucide-react';
import { openProfile } from '../lib/profileRoute';
import { useTheme } from '../lib/useTheme';
import logoIcon from '../assets/logo-icon.png';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import DesktopNavigation from './DesktopNavigation';

function userInfo(session) {
  const user = session?.user;
  const email = user?.email || '';
  const name = user?.user_metadata?.display_name || user?.user_metadata?.full_name || '';
  const initial = (name || email || 'U').trim()[0].toUpperCase();
  return { email, name, initial };
}

function AccountMenu({ session, onSignOut }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { email, name, initial } = userInfo(session);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-label="Account menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white"
        style={{ background: 'linear-gradient(135deg, var(--brand), var(--purple))' }}>
        {initial}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-60 rounded-xl border p-1.5 z-50"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)' }}>
          {(name || email) && (
            <div className="px-3 py-2 border-b mb-1" style={{ borderColor: 'var(--border)' }}>
              {name && <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{name}</p>}
              {email && <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{email}</p>}
            </div>
          )}
          <button role="menuitem" type="button" onClick={() => { setOpen(false); openProfile(); }}
            className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-[var(--surface-2)]" style={{ color: 'var(--text-secondary)' }}>
            <User size={15} /> Profile
          </button>
          <button role="menuitem" type="button" onClick={onSignOut}
            className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-[var(--surface-2)]" style={{ color: 'var(--text-secondary)' }}>
            <LogOut size={15} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button type="button" onClick={toggle} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}
      className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-[var(--surface-2)]" style={{ color: 'var(--text-secondary)' }}>
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

export default function AppHeader({ workspace, setWorkspace, tabs, view, setView, session, loading, error, lastSynced, onRefresh, onSignOut }) {
  return (
    <header className="sticky top-0 z-30 border-b backdrop-blur" style={{ background: 'color-mix(in oklab, var(--header) 94%, transparent)', borderColor: 'var(--border)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex flex-wrap md:flex-nowrap items-center gap-x-4 gap-y-2.5 py-2.5 md:h-16 md:py-0">
          <div className="order-1 flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden p-0.5" style={{ background: '#0b1020' }}>
              <img src={logoIcon} alt="" className="w-full h-full object-contain rounded-[3px]" />
            </div>
            <span className="font-semibold text-base">
              <span style={{ color: 'var(--brand-strong)' }}>Dev</span><span style={{ color: 'var(--brand)' }}>Scale</span>
            </span>
          </div>

          <WorkspaceSwitcher workspace={workspace} setWorkspace={setWorkspace} className="order-3 basis-full md:order-2 md:basis-auto" />

          <div className="order-2 md:order-3 ml-auto flex items-center gap-1.5">
            <button type="button" onClick={onRefresh} aria-label="Sync now" title={lastSynced ? `Synced ${lastSynced.toLocaleTimeString()}` : 'Sync'}
              className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-[var(--surface-2)]"
              style={{ color: error ? 'var(--red)' : 'var(--text-secondary)' }}>
              {error ? <WifiOff size={16} /> : <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />}
            </button>
            <ThemeToggle />
            <AccountMenu session={session} onSignOut={onSignOut} />
          </div>
        </div>
        <DesktopNavigation tabs={tabs} view={view} setView={setView} />
      </div>
    </header>
  );
}
