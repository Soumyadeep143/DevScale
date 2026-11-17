import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, Share2 } from 'lucide-react';
import { activitySeries, conversion, filterByRange, isApplication, MIN_FOR_RATES, monthlySeries, statusCounts, topBy } from '../lib/analytics';
import PageHeader from './ui/PageHeader';
import Panel from './ui/Panel';
import EmptyState from './ui/EmptyState';
import StatCard from './StatCard';
import { FilterSelect } from './ui/SearchAndFilter';
import ActivityChart from './charts/ActivityChart';
import StatusDonut from './charts/StatusDonut';
import HBarChart from './charts/HBarChart';
import ChartTooltip from './charts/ChartTooltip';
import GraphView from './GraphView';
import { Briefcase, Send, Percent, PartyPopper } from 'lucide-react';

const RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '84', label: 'Last 12 weeks' },
  { value: 'custom', label: 'Custom range' },
];
const dateInput = 'text-sm rounded-lg px-2.5 py-2 border outline-none min-h-[40px]';

export default function Analytics({ jobs, theme, onOpen, onOpenNotes }) {
  const [tab, setTab] = useState('insights');
  const [rangeKey, setRangeKey] = useState('84');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const range = rangeKey === 'custom' ? { from, to } : { days: Number(rangeKey) };
  const inRange = useMemo(() => filterByRange(jobs, range), [jobs, rangeKey, from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  const apps = useMemo(() => inRange.filter(isApplication), [inRange]);
  const series = useMemo(() => activitySeries(jobs, range), [jobs, rangeKey, from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  const monthly = useMemo(() => monthlySeries(jobs, 6), [jobs]);
  const conv = useMemo(() => conversion(inRange), [inRange]);
  const offers = apps.filter((j) => j.status === 'offer').length;
  const noData = <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Needs at least {MIN_FOR_RATES} applications in this period to show a percentage.</span>;

  const tabBtn = (id, label, Icon) => (
    <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className="flex items-center gap-1.5 text-sm rounded-md px-3 py-1.5 font-medium"
      style={{ background: tab === id ? 'var(--brand)' : 'transparent', color: tab === id ? '#fff' : 'var(--text-secondary)' }}>
      <Icon size={14} /> {label}
    </button>
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Application Insights" subtitle="Visualize your job search progress.">
        <div role="tablist" aria-label="Graph views" className="flex gap-1 rounded-lg p-1 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          {tabBtn('insights', 'Insights', BarChart3)}
          {tabBtn('network', 'Network', Share2)}
        </div>
      </PageHeader>

      {tab === 'network' ? (
        <GraphView theme={theme} onOpen={onOpen} onOpenNotes={onOpenNotes} />
      ) : jobs.length === 0 ? (
        <EmptyState icon={BarChart3} title="No data to analyse yet">Add or import jobs and your charts will appear here.</EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect label="Date range" value={rangeKey} onChange={setRangeKey} options={RANGES} />
            {rangeKey === 'custom' && (
              <>
                <input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={dateInput} style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                <span style={{ color: 'var(--text-muted)' }}>to</span>
                <input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={dateInput} style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
              </>
            )}
          </div>

          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <StatCard label="Jobs added" value={inRange.length} icon={Briefcase} color="var(--status-lead)" />
            <StatCard label="Applications" value={apps.length} icon={Send} color="var(--status-applied)" sub="Jobs past the Lead stage" />
            <StatCard label="Response rate" value={conv ? `${conv.responseRate}%` : '—'} icon={Percent} color="var(--status-interviewing)"
              sub={conv ? 'Interview, offer or rejection' : `Needs ${MIN_FOR_RATES}+ applications`} />
            <StatCard label="Offers" value={offers} icon={PartyPopper} color="var(--status-offer)" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
            <Panel className="xl:col-span-3" title="Applications Over Time" subtitle={series.weekly ? 'Per week' : 'Per day'}>
              <ActivityChart points={series.points} variant="area" height={260} />
            </Panel>
            <Panel className="xl:col-span-2" title="Status Distribution">
              <div className="pt-3"><StatusDonut data={statusCounts(inRange)} /></div>
            </Panel>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Panel title="Applications by Company" subtitle="Top 8">
              <HBarChart data={topBy(inRange, 'company')} />
            </Panel>
            <Panel title="Applications by Source" subtitle="Where your jobs come from">
              <HBarChart data={topBy(inRange, 'source')} />
            </Panel>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Panel title="Interview Conversion" subtitle="Based on each job’s current status">
              {conv ? (
                <ul className="space-y-3 pt-1">
                  {conv.stages.map((s, i) => (
                    <li key={s.label}>
                      <div className="flex justify-between text-sm mb-1"><span style={{ color: 'var(--text-secondary)' }}>{s.label}</span><span className="tabular-nums" style={{ color: 'var(--text-primary)' }}>{s.count}{i > 0 && ` · ${Math.round((s.count / conv.applications) * 100)}%`}</span></div>
                      <div className="h-2 rounded-full" style={{ background: 'var(--surface-2)' }}>
                        <div className="h-full rounded-full" style={{ width: `${(s.count / conv.applications) * 100}%`, background: ['var(--brand)', 'var(--purple)', 'var(--amber)'][i] }} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <div className="py-8 text-center">{noData}</div>}
            </Panel>

            <Panel title="Monthly Application Trends" subtitle="Last 6 months, all jobs">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthly} margin={{ top: 8, right: 8, left: -22, bottom: 0 }} barCategoryGap="28%">
                  <CartesianGrid vertical={false} stroke="var(--grid)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--surface-2)' }} />
                  <Bar dataKey="count" name="Jobs" fill="var(--purple)" radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
