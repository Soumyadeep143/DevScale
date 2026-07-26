import { STATUSES } from '../lib/statusConfig';
import JobCard from './JobCard';

export default function Board({ jobs, onOpen }) {
  return (
    <div className="flex gap-4 overflow-x-auto scrollbar-thin pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x snap-mandatory sm:snap-none">
      {STATUSES.map((status) => {
        const columnJobs = jobs.filter((j) => j.status === status.id);
        const Icon = status.icon;
        return (
          <div
            key={status.id}
            className="shrink-0 w-[82vw] xs:w-72 sm:w-72 snap-start flex flex-col rounded-xl border"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', maxHeight: 'calc(100vh - 220px)' }}
          >
            <div className="flex items-center gap-2 px-3.5 py-3 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
              <Icon size={14} style={{ color: status.color }} />
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{status.label}</h3>
              <span
                className="ml-auto text-xs font-medium rounded-full px-2 py-0.5"
                style={{ background: 'var(--surface)', color: 'var(--text-muted)' }}
              >
                {columnJobs.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin p-2.5 space-y-2.5 min-h-[80px]">
              {columnJobs.length === 0 && (
                <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>Nothing here</p>
              )}
              {columnJobs.map((job) => (
                <JobCard key={job.id} job={job} onOpen={onOpen} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
