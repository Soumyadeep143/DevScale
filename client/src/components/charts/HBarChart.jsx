import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts';
import ChartTooltip from './ChartTooltip';

const PALETTE = ['var(--brand)', 'var(--purple)', 'var(--green)', 'var(--amber)', 'var(--red)'];

export default function HBarChart({ data, unit = 'jobs', height }) {
  if (!data.length) return <div className="flex items-center justify-center text-sm py-10" style={{ color: 'var(--text-muted)' }}>Nothing to show yet.</div>;
  const h = height || Math.max(160, data.length * 34 + 16);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }} barCategoryGap="24%">
        <XAxis type="number" allowDecimals={false} hide />
        <YAxis type="category" dataKey="name" width={96} tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false}
          tickFormatter={(v) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)} />
        <Tooltip content={<ChartTooltip unit={` ${unit}`} />} cursor={{ fill: 'var(--surface-2)' }} />
        <Bar dataKey="count" name="Count" radius={[0, 4, 4, 0]} maxBarSize={20}>
          {data.map((d, i) => <Cell key={d.name} fill={PALETTE[i % PALETTE.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
