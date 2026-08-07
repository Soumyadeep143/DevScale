import { Briefcase, Send, Users, PartyPopper, TrendingUp } from 'lucide-react';
import StatCard from './StatCard';
import StatusBarChart from './charts/StatusBarChart';
import TrendChart from './charts/TrendChart';
import JobCard from './JobCard';

export default function Dashboard({ jobs, onOpen }) {
  const applied = jobs.filter((j) => j.status !== 'lead');
  const interviewing = jobs.filter((j) => j.status === 'interviewing').length;
  const offers = jobs.filter((j) => j.status === 'offer').length;
  const rejected = jobs.filter((j) => j.status === 'rejected').length;
  const responded = interviewing + offers + rejected;
  const responseRate = applied.length ? Math.round((responded / applied.length) * 100) : 0;

  const recent = [...jobs].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 4);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Total tracked" value={jobs.length} icon={Briefcase} color="var(--brand)" />
        <StatCard label="Applied" value={applied.length} icon={Send} color="var(--status-applied)" />
        <StatCard label="Interviewing" value={interviewing} icon={Users} color="var(--status-interviewing)" />
        <StatCard label="Offers" value={offers} icon={PartyPopper} color="var(--status-offer)" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl border p-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Applications over time</h3>
          </div>
          <TrendChart jobs={jobs} />
        </div>

        <div className="rounded-xl border p-4 flex flex-col items-center justify-center text-center" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <TrendingUp size={18} style={{ color: 'var(--brand)' }} className="mb-2" />
          <p className="text-4xl font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{responseRate}%</p>
          <p className="text-xs mt-1.5 max-w-[16ch]" style={{ color: 'var(--text-muted)' }}>
            of applications got a response (interview, offer, or rejection)
          </p>
        </div>
      </div>

      <div className="rounded-xl border p-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Pipeline breakdown</h3>
        <StatusBarChart jobs={jobs} />
      </div>

      {recent.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Recently updated</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {recent.map((job) => <JobCard key={job.id} job={job} onOpen={(j) => onOpen(j, recent)} />)}
          </div>
        </div>
      )}
    </div>
  );
}
