import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { STATUSES } from '../../lib/statusConfig';

function TooltipContent({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border px-3 py-2 text-xs" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-md)' }}>
      <p className="font-medium mb-0.5" style={{ color: 'var(--text-primary)' }}>{p.label}</p>
      <p style={{ color: 'var(--text-secondary)' }}>{p.count} job{p.count === 1 ? '' : 's'}</p>
    </div>
  );
}

export default function StatusBarChart({ jobs }) {
  const data = STATUSES.map((s) => ({
    label: s.label,
    count: jobs.filter((j) => j.status === s.id).length,
    color: s.color,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }} barCategoryGap="28%">
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
          axisLine={{ stroke: 'var(--axis)' }}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<TooltipContent />} cursor={{ fill: 'var(--surface-2)' }} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={56}>
          {data.map((d) => <Cell key={d.label} fill={d.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
