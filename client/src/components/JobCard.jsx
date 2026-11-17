import { ChevronLeft, ChevronRight, ExternalLink, MapPin, CalendarDays } from 'lucide-react';
import { STATUSES, statusMeta } from '../lib/statusConfig';
import { useJobs } from '../context/JobsContext';
import { contactHref } from '../lib/contact';
import { jobDate } from '../lib/analytics';
import CompanyAvatar from './ui/CompanyAvatar';

// Board card. Draggable between columns; the arrow buttons are the
// keyboard/touch alternative. Both only ever change this user's own record.
export default function JobCard({ job, onOpen, onMove, draggable = false }) {
  const { editJob, promoteLead } = useJobs();
  const idx = STATUSES.findIndex((s) => s.id === job.status);
  const stageColor = statusMeta(job.status).color;

  function move(dir, e) {
    e.stopPropagation();
    const next = STATUSES[idx + dir];
    if (!next) return;
    if (onMove) return onMove(job, next.id);
    if (job.status === 'lead' && next.id !== 'lead') promoteLead(job.id, next.id);
    else editJob(job.id, { status: next.id });
  }

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(job.id)); e.dataTransfer.effectAllowed = 'move'; }}
      onClick={() => onOpen(job)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(job)}
      className="rounded-xl border p-3 cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:border-[var(--border-strong)] text-left w-full"
      style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}
    >
      <div className="flex items-start gap-2.5">
        <CompanyAvatar name={job.company} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{job.company}</p>
          <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{job.role}</p>
        </div>
        {job.contact && (
          <a href={contactHref(job.contact)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
            className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center hover:opacity-70" style={{ color: 'var(--text-muted)' }} aria-label="Open job link">
            <ExternalLink size={13} />
          </a>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        {job.location && <span className="flex items-center gap-1 truncate"><MapPin size={11} /> {job.location}</span>}
        {jobDate(job) && <span className="flex items-center gap-1"><CalendarDays size={11} /> {jobDate(job)}</span>}
      </div>

      {job.interviewStatus && (
        <p className="text-xs mt-2 rounded-md px-2 py-1 truncate" style={{ background: `color-mix(in oklab, ${stageColor} 14%, var(--surface))`, color: 'var(--text-secondary)' }}>
          {job.interviewStatus}
        </p>
      )}

      <div className="flex items-center justify-between mt-2.5 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <button onClick={(e) => move(-1, e)} disabled={idx <= 0 || idx === 1 /* applied → lead is not allowed */}
          className="w-8 h-8 rounded-md flex items-center justify-center disabled:opacity-25 hover:bg-[var(--surface)]" style={{ color: 'var(--text-secondary)' }} aria-label="Move to previous stage">
          <ChevronLeft size={15} />
        </button>
        <span className="text-[11px] font-medium truncate px-1" style={{ color: 'var(--text-muted)' }}>{job.source || ''}</span>
        <button onClick={(e) => move(1, e)} disabled={idx >= STATUSES.length - 1}
          className="w-8 h-8 rounded-md flex items-center justify-center disabled:opacity-25 hover:bg-[var(--surface)]" style={{ color: 'var(--text-secondary)' }} aria-label="Move to next stage">
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
