// KPI tile tinted with its accent colour.
export default function StatCard({ label, value, sub, color = 'var(--brand)', icon: Icon }) {
  return (
    <div className="rounded-2xl border p-4 relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, color-mix(in oklab, ${color} 20%, var(--surface)) 0%, var(--surface) 78%)`,
        borderColor: `color-mix(in oklab, ${color} 28%, var(--border))`,
        boxShadow: 'var(--shadow-sm)',
      }}>
      <div className="flex items-center gap-3">
        {Icon && (
          <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `color-mix(in oklab, ${color} 24%, var(--surface-2))` }}>
            <Icon size={18} style={{ color }} />
          </span>
        )}
        <div className="min-w-0">
          <p className="text-2xl font-semibold tabular-nums leading-none" style={{ color: 'var(--text-primary)' }}>{value}</p>
          <p className="text-xs mt-1.5 truncate" style={{ color: 'var(--text-secondary)' }}>{label}</p>
        </div>
      </div>
      {sub && <p className="text-[11px] mt-3" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  );
}
