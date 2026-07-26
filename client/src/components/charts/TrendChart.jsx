import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

function TooltipContent({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border px-3 py-2 text-xs" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-md)' }}>
      <p className="font-medium mb-0.5" style={{ color: 'var(--text-primary)' }}>{label}</p>
      <p style={{ color: 'var(--text-secondary)' }}>{payload[0].value} total applications</p>
    </div>
  );
}

export default function TrendChart({ jobs }) {
  const dated = jobs.filter((j) => j.dateApplied).sort((a, b) => a.dateApplied.localeCompare(b.dateApplied));

  if (dated.length === 0) {
    return (
      <div className="flex items-center justify-center h-[220px] text-sm" style={{ color: 'var(--text-muted)' }}>
        Add a date applied to see your trend here.
      </div>
    );
  }

  const byDate = new Map();
  dated.forEach((j) => byDate.set(j.dateApplied, (byDate.get(j.dateApplied) || 0) + 1));

  let cumulative = 0;
  const data = [...byDate.entries()].map(([date, count]) => {
    cumulative += count;
    return {
      date: new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      total: cumulative,
    };
  });

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
        <Tooltip content={<TooltipContent />} cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }} />
        <Area type="monotone" dataKey="total" stroke="var(--brand)" strokeWidth={2} fill="url(#trendFill)" activeDot={{ r: 5 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
