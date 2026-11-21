import { initials, avatarColor } from '../../lib/team';

export const cardStyle = { background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' };
export const muted = { color: 'var(--text-muted)' };

export function Avatar({ name, size = 36 }) {
  const tone = avatarColor(name);
  return (
    <span aria-hidden="true" className="shrink-0 inline-flex items-center justify-center rounded-full font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `color-mix(in oklab, ${tone} 25%, var(--surface-2))`, color: tone }}>
      {initials(name)}
    </span>
  );
}

// Gradient statistic card. `value` is always a real count from the database (or "—" while loading).
export function TeamStatCard({ label, value, sub, icon: Icon, color }) {
  return (
    <div className="rounded-2xl border p-3.5 sm:p-4 min-w-0"
      style={{ borderColor: `color-mix(in oklab, ${color} 28%, var(--border))`, background: `linear-gradient(145deg, color-mix(in oklab, ${color} 20%, var(--surface)), var(--surface) 70%)`, boxShadow: 'var(--shadow-sm)' }}>
      <span className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ background: `color-mix(in oklab, ${color} 22%, var(--surface-2))` }}>
        <Icon size={18} style={{ color }} />
      </span>
      <p className="text-2xl font-semibold tabular-nums leading-none" style={{ color: 'var(--text-primary)' }}>{value}</p>
      <p className="text-xs mt-1.5 break-words" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      {sub && <p className="text-[11px] mt-0.5 truncate" style={muted}>{sub}</p>}
    </div>
  );
}

// Pill tabs with counts (All shared (36) / Shared by me (12) …).
export function PillTabs({ label, tabs, value, onChange }) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-2">
      {tabs.map((t) => {
        const active = value === t.id;
        return (
          <button key={t.id} role="tab" aria-selected={active} onClick={() => onChange(t.id)}
            className="relative rounded-full border px-3.5 py-1.5 text-sm font-medium min-h-[36px] transition"
            style={{ background: active ? 'var(--brand)' : 'var(--surface)', borderColor: active ? 'var(--brand)' : 'var(--border)', color: active ? '#fff' : 'var(--text-secondary)' }}>
            {t.label}{t.count != null ? ` (${t.count})` : ''}
            {t.dot && <span aria-label="New" className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full" style={{ background: 'var(--red)' }} />}
          </button>
        );
      })}
    </div>
  );
}

export function Notice({ err, notice }) {
  return (
    <>
      {err && <div role="alert" className="text-sm rounded-lg p-3" style={{ background: 'color-mix(in oklab, var(--red) 12%, var(--surface))', color: 'var(--red)' }}>{err}</div>}
      {notice && <div role="status" className="text-sm rounded-lg p-3" style={{ background: 'color-mix(in oklab, var(--green) 12%, var(--surface))', color: 'var(--text-primary)' }}>{notice}</div>}
    </>
  );
}

export function Badge({ children, color = 'var(--brand)' }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
      style={{ background: `color-mix(in oklab, ${color} 18%, var(--surface))`, color: 'var(--text-primary)', border: `1px solid color-mix(in oklab, ${color} 35%, var(--border))` }}>
      {children}
    </span>
  );
}

export const iconBtn = 'w-9 h-9 rounded-lg inline-flex items-center justify-center hover:bg-[var(--surface-2)] disabled:opacity-50';
