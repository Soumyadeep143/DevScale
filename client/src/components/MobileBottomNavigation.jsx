import { useEffect, useState } from 'react';
import { MoreHorizontal, X } from 'lucide-react';
import { MOBILE_PRIMARY, moreTabs } from '../lib/workspaces';

// Phones get a persistent four-item bar: three primary destinations plus More, which lists
// every other tab (config lives in lib/workspaces.js: MOBILE_PRIMARY / moreTabs).
export default function MobileBottomNavigation({ workspace, view, setView }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = MOBILE_PRIMARY[workspace] || MOBILE_PRIMARY.personal;
  const more = moreTabs(workspace);
  const moreActive = more.some((t) => t.id === view);

  useEffect(() => {
    if (!moreOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setMoreOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  const item = (active) => ({ color: active ? 'var(--brand)' : 'var(--text-secondary)' });
  const base = 'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium min-h-[56px]';

  return (
    <>
      <nav aria-label="Bottom navigation" className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t flex"
        style={{ background: 'var(--header)', borderColor: 'var(--border)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {primary.map((tab) => {
          const Icon = tab.icon;
          const active = view === tab.id;
          return (
            <button key={tab.id} type="button" aria-current={active ? 'page' : undefined} onClick={() => setView(tab.id)} className={base} style={item(active)}>
              <Icon size={20} />
              {tab.label}
            </button>
          );
        })}
        {more.length > 0 && (
          <button type="button" aria-haspopup="dialog" aria-expanded={moreOpen} onClick={() => setMoreOpen(true)} className={base} style={item(moreActive)}>
            <MoreHorizontal size={20} /> More
          </button>
        )}
      </nav>

      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.55)' }}
          onMouseDown={(e) => e.target === e.currentTarget && setMoreOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="More pages"
            className="w-full rounded-t-2xl border-t p-4 animate-[sheetIn_.18s_ease-out]"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>More</h2>
              <button type="button" aria-label="Close more pages" onClick={() => setMoreOpen(false)} className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ color: 'var(--text-secondary)' }}>
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {more.map((tab) => {
                const Icon = tab.icon;
                const active = view === tab.id;
                return (
                  <button key={tab.id} type="button" onClick={() => { setView(tab.id); setMoreOpen(false); }}
                    className="rounded-xl border flex flex-col items-center gap-1.5 py-3.5 text-xs font-medium min-h-[72px]"
                    style={{ background: active ? 'color-mix(in oklab, var(--brand) 16%, var(--surface-2))' : 'var(--surface-2)', borderColor: active ? 'var(--brand)' : 'var(--border)', color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    <Icon size={20} style={{ color: active ? 'var(--brand)' : undefined }} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
