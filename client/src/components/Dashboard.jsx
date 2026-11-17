import { useMemo, useState } from 'react';
import { Briefcase, Send, Users, PartyPopper, XCircle, Plus, Upload, ArrowRight, Clock, Sparkles, Inbox } from 'lucide-react';
import { useJobs } from '../context/JobsContext';
import { activitySeries, greeting, isApplication, jobDate, statusCounts, timeAgo } from '../lib/analytics';
import StatCard from './StatCard';
import StatusBadge from './StatusBadge';
import Panel from './ui/Panel';
import PageHeader, { ghostBtn, primaryBtn } from './ui/PageHeader';
import CompanyAvatar from './ui/CompanyAvatar';
import { FilterSelect } from './ui/SearchAndFilter';
import ActivityChart from './charts/ActivityChart';
import StatusDonut from './charts/StatusDonut';

const RANGES = [
  { value: '7', label: 'Last 7 days', days: 7 },
  { value: '30', label: 'Last 30 days', days: 30 },
  { value: '84', label: 'Last 12 weeks', days: 84 },
];

function Row({ job, onOpen, right }) {
  return (
    <li>
      <button type="button" onClick={() => onOpen(job)} className="w-full flex items-center gap-3 px-1 py-2.5 text-left rounded-lg hover:bg-[var(--surface-2)] transition-colors">
        <CompanyAvatar name={job.company} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{job.company}</span>
          <span className="block text-xs truncate" style={{ color: 'var(--text-muted)' }}>{job.role}</span>
        </span>
        {right}
      </button>
    </li>
  );
}

export default function Dashboard({ jobs, onOpen, onAdd, onImport, onNavigate }) {
  const { session } = useJobs();
  const [rangeKey, setRangeKey] = useState('84');
  const range = RANGES.find((r) => r.value === rangeKey);
  const name = (session?.user?.user_metadata?.display_name || '').trim().split(/\s+/)[0];

  const stats = useMemo(() => {
    const n = (s) => jobs.filter((j) => j.status === s).length;
    const weekAgo = Date.now() - 7 * 86400000;
    return {
      total: jobs.length,
      lead: n('lead'), applied: n('applied'), interviewing: n('interviewing'), offers: n('offer'), rejected: n('rejected'),
      addedThisWeek: jobs.filter((j) => j.createdAt && new Date(j.createdAt).getTime() >= weekAgo).length,
    };
  }, [jobs]);

  const series = useMemo(() => activitySeries(jobs, { days: range.days }), [jobs, range]);
  const pipeline = useMemo(() => statusCounts(jobs), [jobs]);

  const recentApps = useMemo(
    () => jobs.filter(isApplication).sort((a, b) => (jobDate(b) + (b.createdAt || '')).localeCompare(jobDate(a) + (a.createdAt || ''))).slice(0, 5),
    [jobs],
  );
  const interviews = useMemo(() => jobs.filter((j) => j.status === 'interviewing').slice(0, 4), [jobs]);
  const recentLeads = useMemo(() => jobs.filter((j) => j.status === 'lead').sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 4), [jobs]);
  const activity = useMemo(() => [...jobs].filter((j) => j.updatedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5), [jobs]);

  const share = (n) => (stats.total ? `${Math.round((n / stats.total) * 100)}% of all jobs` : '');

  return (
    <div className="space-y-5">
      <PageHeader title={`${greeting()}${name ? `, ${name}` : ''}!`} subtitle="Here’s your job search overview.">
        <button onClick={onImport} className={ghostBtn} style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}><Upload size={15} /> Import</button>
        <button onClick={onAdd} className={primaryBtn} style={{ background: 'var(--brand)' }}><Plus size={16} /> Add Job</button>
      </PageHeader>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <StatCard label="Total Leads" value={stats.total} icon={Briefcase} color="var(--status-lead)" sub={`+${stats.addedThisWeek} added in the last 7 days`} />
        <StatCard label="Applied" value={stats.applied} icon={Send} color="var(--status-applied)" sub={share(stats.applied)} />
        <StatCard label="Interviewing" value={stats.interviewing} icon={Users} color="var(--status-interviewing)" sub={share(stats.interviewing)} />
        <StatCard label="Rejected" value={stats.rejected} icon={XCircle} color="var(--status-rejected)" sub={share(stats.rejected)} />
        <StatCard label="Offers" value={stats.offers} icon={PartyPopper} color="var(--status-offer)" sub={share(stats.offers)} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <Panel className="xl:col-span-3" title="Application Activity" subtitle="Jobs added over time"
          action={<FilterSelect label="Activity range" value={rangeKey} onChange={setRangeKey} options={RANGES.map(({ value, label }) => ({ value, label }))} />}>
          <ActivityChart points={series.points} />
        </Panel>
        <Panel className="xl:col-span-2" title="Pipeline" subtitle="Where your jobs are right now">
          <div className="pt-3"><StatusDonut data={pipeline} /></div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel className="xl:col-span-2" title="Recent Applications" action={<button onClick={() => onNavigate?.('table')} className="text-xs flex items-center gap-1 hover:underline" style={{ color: 'var(--brand)' }}>View all <ArrowRight size={12} /></button>}>
          {recentApps.length === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: 'var(--text-muted)' }}>No applications yet. Move a lead to Applied to see it here.</p>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {recentApps.map((j) => (
                <Row key={j.id} job={j} onOpen={(job) => onOpen(job, recentApps)} right={
                  <span className="flex items-center gap-3 shrink-0">
                    <span className="hidden sm:inline text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>{jobDate(j)}</span>
                    <StatusBadge status={j.status} size="sm" />
                  </span>
                } />
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="In the interview process" subtitle="Jobs currently at Interviewing">
          {interviews.length === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: 'var(--text-muted)' }}>No active interviews.</p>
          ) : (
            <ul>{interviews.map((j) => (
              <Row key={j.id} job={j} onOpen={(job) => onOpen(job, interviews)} right={j.interviewStatus ? <span className="text-xs truncate max-w-[40%]" style={{ color: 'var(--text-secondary)' }}>{j.interviewStatus}</span> : null} />
            ))}</ul>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Recent activity" subtitle="Latest changes to your jobs">
          {activity.length === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: 'var(--text-muted)' }}>Nothing yet.</p>
          ) : (
            <ul>{activity.map((j) => (
              <Row key={j.id} job={j} onOpen={(job) => onOpen(job, activity)} right={
                <span className="flex items-center gap-2 shrink-0 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <StatusBadge status={j.status} size="sm" /><span className="flex items-center gap-1"><Clock size={11} /> {timeAgo(j.updatedAt)}</span>
                </span>
              } />
            ))}</ul>
          )}
        </Panel>

        <Panel title="Recently added opportunities" subtitle="Leads you haven’t acted on yet"
          action={<button onClick={() => onNavigate?.('leads')} className="text-xs flex items-center gap-1 hover:underline" style={{ color: 'var(--brand)' }}>All leads <ArrowRight size={12} /></button>}>
          {recentLeads.length === 0 ? (
            <p className="text-sm py-6 text-center flex items-center justify-center gap-2" style={{ color: 'var(--text-muted)' }}><Inbox size={15} /> No open leads.</p>
          ) : (
            <ul>{recentLeads.map((j) => (
              <Row key={j.id} job={j} onOpen={(job) => onOpen(job, recentLeads)} right={<span className="text-xs shrink-0 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}><Sparkles size={11} /> {timeAgo(j.createdAt)}</span>} />
            ))}</ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
