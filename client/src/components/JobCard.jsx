import { ChevronLeft, ChevronRight, ExternalLink, MapPin } from 'lucide-react';
import { STATUSES, statusMeta } from '../lib/statusConfig';
import { useJobs } from '../context/JobsContext';
import { contactHref } from '../lib/contact';

export default function JobCard({ job, onOpen }) {
  const { editJob, promoteLead } = useJobs();
  const idx = STATUSES.findIndex((s) => s.id === job.status);
  const stageColor = statusMeta(job.status).color;

  function move(dir, e) {
    e.stopPropagation();
    const next = STATUSES[idx + dir];
    if (!next) return;
    if (job.status === 'lead' && next.id !== 'lead') {
      promoteLead(job.id, next.id);
    } else {
      editJob(job.id, { status: next.id });
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(job)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(job)}
      className="rounded-xl border p-3.5 cursor-pointer transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 text-left w-full"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)', borderLeft: `3px solid ${stageColor}`, boxShadow: 'var(--shadow-sm)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{job.company}</p>
          <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{job.role}</p>
        </div>
        {job.contact && (
          <a
            href={contactHref(job.contact)}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-70"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Open job link"
          >
            <ExternalLink size={14} />
          </a>
        )}
      </div>

      {(job.location || job.postedTime) && (
        <div className="flex items-center gap-1 mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          {job.location && (
            <span className="flex items-center gap-1 truncate">
              <MapPin size={11} /> {job.location}
            </span>
          )}
          {job.postedTime && <span className="truncate">· {job.postedTime}</span>}
        </div>
      )}

      {job.interviewStatus && (
        <p className="text-xs mt-2 rounded-md px-2 py-1 truncate" style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}>
          {job.interviewStatus}
        </p>
      )}

      <div className="flex items-center justify-between mt-3 pt-2.5 border-t" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={(e) => move(-1, e)}
          disabled={idx <= 0}
          className="w-8 h-8 rounded-md flex items-center justify-center disabled:opacity-25 hover:opacity-70"
          style={{ color: 'var(--text-secondary)' }}
          aria-label="Move to previous stage"
        >
          <ChevronLeft size={15} />
        </button>
        <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
          {job.dateApplied || job.source || ''}
        </span>
        <button
          onClick={(e) => move(1, e)}
          disabled={idx >= STATUSES.length - 1}
          className="w-8 h-8 rounded-md flex items-center justify-center disabled:opacity-25 hover:opacity-70"
          style={{ color: 'var(--text-secondary)' }}
          aria-label="Move to next stage"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
