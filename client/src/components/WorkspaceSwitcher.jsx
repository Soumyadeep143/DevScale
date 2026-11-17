import { useRef } from 'react';
import { WORKSPACES } from '../lib/workspaces';

// Personal / Team segmented pill, one component for every breakpoint: full width by default
// (phones), fixed width from md up. Radio-group semantics with arrow-key navigation.
// What each workspace may see is decided by the database, never by this control.
export default function WorkspaceSwitcher({ workspace, setWorkspace, className = '' }) {
  const refs = useRef([]);
  const index = Math.max(0, WORKSPACES.findIndex((w) => w.id === workspace));

  function onKeyDown(e, i) {
    const n = WORKSPACES.length;
    const next = { ArrowRight: (i + 1) % n, ArrowDown: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, ArrowUp: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setWorkspace?.(WORKSPACES[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Workspace"
      className={`relative grid grid-cols-2 w-full md:w-52 lg:w-60 rounded-full border p-1 ${className}`}
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <span
        aria-hidden="true"
        className="absolute top-1 bottom-1 left-1 rounded-full transition-transform duration-200 ease-out motion-reduce:transition-none"
        style={{
          width: 'calc((100% - 0.5rem) / 2)',
          transform: `translateX(${index * 100}%)`,
          background: 'var(--brand)',
          boxShadow: '0 2px 6px color-mix(in oklab, var(--brand) 40%, transparent)',
        }}
      />
      {WORKSPACES.map((w, i) => {
        const Icon = w.icon;
        const active = i === index;
        return (
          <button
            key={w.id}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => setWorkspace?.(w.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`relative z-10 flex items-center justify-center gap-1.5 rounded-full text-sm font-medium min-h-11 md:min-h-8 transition-colors duration-200 motion-reduce:transition-none ${active ? '' : 'hover:text-[var(--text-primary)]'}`}
            style={{ color: active ? '#ffffff' : 'var(--text-secondary)' }}
          >
            <Icon size={15} aria-hidden="true" /> {w.label}
          </button>
        );
      })}
    </div>
  );
}
