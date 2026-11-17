export default function ChartTooltip({ active, payload, label, unit = '' }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border px-3 py-2 text-xs" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-md)' }}>
      {(label ?? payload[0].payload.name ?? payload[0].payload.label) && (
        <p className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{label ?? payload[0].payload.name ?? payload[0].payload.label}</p>
      )}
      {payload.map((p) => (
        <p key={p.dataKey || p.name} className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
          <span className="w-2 h-2 rounded-full" style={{ background: p.color || p.payload?.color || p.fill }} />
          {p.name}: <span style={{ color: 'var(--text-primary)' }}>{p.value}{unit}</span>
        </p>
      ))}
    </div>
  );
}
