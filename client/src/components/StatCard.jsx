export default function StatCard({ label, value, sub, color, icon: Icon }) {
  return (
    <div className="rounded-xl border p-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
        {Icon && (
          <span className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: `color-mix(in oklab, ${color || 'var(--brand)'} 16%, var(--surface))` }}>
            <Icon size={13} style={{ color: color || 'var(--brand)' }} />
          </span>
        )}
      </div>
      <p className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  );
}
