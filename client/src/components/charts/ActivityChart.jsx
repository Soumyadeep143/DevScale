import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart } from 'recharts';
import ChartTooltip from './ChartTooltip';

const tick = { fontSize: 11, fill: 'var(--text-muted)' };

// Jobs per day/week. `variant="bar"` for the dashboard, "area" for analytics
// (where Applications and All jobs are drawn together).
export default function ActivityChart({ points, variant = 'bar', height = 240 }) {
  const empty = points.every((p) => p.total === 0);
  if (empty) {
    return <div className="flex items-center justify-center text-sm text-center px-4" style={{ height, color: 'var(--text-muted)' }}>No activity in this period.</div>;
  }
  const interval = points.length > 14 ? Math.ceil(points.length / 8) - 1 : 0;
  const common = { data: points, margin: { top: 8, right: 8, left: -22, bottom: 0 } };
  const axes = (
    <>
      <CartesianGrid vertical={false} stroke="var(--grid)" />
      <XAxis dataKey="label" tick={tick} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} interval={interval} />
      <YAxis allowDecimals={false} tick={tick} axisLine={false} tickLine={false} />
      <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--surface-2)', stroke: 'var(--axis)' }} />
    </>
  );
  return (
    <ResponsiveContainer width="100%" height={height}>
      {variant === 'area' ? (
        <AreaChart {...common}>
          <defs>
            <linearGradient id="actTotal" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--brand)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--brand)" stopOpacity={0} /></linearGradient>
            <linearGradient id="actApplied" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--purple)" stopOpacity={0.3} /><stop offset="100%" stopColor="var(--purple)" stopOpacity={0} /></linearGradient>
          </defs>
          {axes}
          <Area type="monotone" dataKey="total" name="Jobs added" stroke="var(--brand)" strokeWidth={2} fill="url(#actTotal)" />
          <Area type="monotone" dataKey="applied" name="Applied" stroke="var(--purple)" strokeWidth={2} fill="url(#actApplied)" />
        </AreaChart>
      ) : (
        <BarChart {...common} barCategoryGap="22%">
          {axes}
          <Bar dataKey="total" name="Jobs added" fill="var(--brand)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}
