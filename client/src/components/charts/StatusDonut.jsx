import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import ChartTooltip from './ChartTooltip';

// Donut + legend with counts and shares. `data` = [{ id, label, color, count }].
export default function StatusDonut({ data, centerLabel = 'Total' }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) {
    return <div className="flex items-center justify-center text-sm py-10" style={{ color: 'var(--text-muted)' }}>Nothing to show yet.</div>;
  }
  const pct = (n) => Math.round((n / total) * 100);
  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <div className="relative w-40 h-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data.filter((d) => d.count > 0)} dataKey="count" nameKey="label" innerRadius="68%" outerRadius="100%" paddingAngle={2} stroke="none">
              {data.filter((d) => d.count > 0).map((d) => <Cell key={d.id} fill={d.color} />)}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{total}</span>
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{centerLabel}</span>
        </div>
      </div>
      <ul className="w-full space-y-2 text-sm">
        {data.map((d) => (
          <li key={d.id} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>{d.label}</span>
            <span className="tabular-nums" style={{ color: 'var(--text-primary)' }}>{d.count}</span>
            <span className="w-10 text-right tabular-nums text-xs" style={{ color: 'var(--text-muted)' }}>{pct(d.count)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
