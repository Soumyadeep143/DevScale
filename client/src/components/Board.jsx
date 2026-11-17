import { useMemo, useState } from 'react';
import { useWindowedList } from '../lib/useWindowedList';
import InfiniteScrollSentinel from './ui/InfiniteScrollSentinel';
import { Plus, Kanban } from 'lucide-react';
import { STATUSES } from '../lib/statusConfig';
import { useJobs } from '../context/JobsContext';
import JobCard from './JobCard';
import PageHeader, { primaryBtn } from './ui/PageHeader';
import SearchAndFilter, { FilterSelect } from './ui/SearchAndFilter';
import EmptyState from './ui/EmptyState';

const COLUMN_PAGE = 20;

// One pipeline column. Only a chunk of its cards is in the page at a time; the rest load as the
// column scrolls, so a stage with hundreds of jobs stays fast.
function BoardColumn({ status, jobs, hot, resetKey, onDragOver, onDragLeave, onDrop, onMove, onOpen }) {
  const Icon = status.icon;
  const win = useWindowedList(jobs, { pageSize: COLUMN_PAGE, resetKey });
  return (
    <section
      aria-label={`${status.label} column`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="shrink-0 w-[80vw] sm:w-72 xl:flex-1 xl:min-w-[15rem] snap-start flex flex-col rounded-2xl border overflow-hidden transition-colors"
      style={{
        background: `color-mix(in oklab, ${status.color} ${hot ? 14 : 6}%, var(--surface))`,
        borderColor: hot ? status.color : 'var(--border)',
        maxHeight: 'calc(100vh - 300px)', minHeight: 220,
      }}
    >
      <div className="flex items-center gap-2 px-3.5 py-3 border-b shrink-0" style={{ borderColor: `color-mix(in oklab, ${status.color} 30%, var(--border))` }}>
        <Icon size={15} style={{ color: status.color }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{status.label}</h3>
        <span className="ml-auto text-xs font-medium rounded-full px-2 py-0.5 tabular-nums" style={{ background: `color-mix(in oklab, ${status.color} 20%, var(--surface))`, color: status.color }}>
          {jobs.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-2.5 space-y-2.5">
        {jobs.length === 0 && <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>Nothing here</p>}
        {win.visible.map((job) => (
          <JobCard key={job.id} job={job} draggable onMove={onMove} onOpen={(j) => onOpen(j, jobs)} />
        ))}
        {jobs.length > COLUMN_PAGE && (
          <InfiniteScrollSentinel hasMore={win.hasMore} loading={false} onLoadMore={win.loadMore} loadedCount={win.visible.length} noun="cards" />
        )}
      </div>
    </section>
  );
}

export default function Board({ jobs, onOpen, onAdd }) {
  const { editJob, promoteLead } = useJobs();
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('all');
  const [overColumn, setOverColumn] = useState(null);
  const [err, setErr] = useState('');

  const sources = useMemo(() => [...new Set(jobs.map((j) => j.source).filter(Boolean))].sort(), [jobs]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((j) => (source === 'all' || j.source === source) && (!q || `${j.company} ${j.role} ${j.location}`.toLowerCase().includes(q)));
  }, [jobs, search, source]);

  // Moves only the signed-in user's own record: jobs come from their own rows,
  // and the database refuses writes to anyone else's.
  async function moveJob(job, status) {
    if (!job || job.status === status) return;
    if (status === 'lead') { setErr('A tracked job can’t be moved back to Leads.'); return; }
    setErr('');
    try {
      if (job.status === 'lead') await promoteLead(job.id, status);
      else await editJob(job.id, { status });
    } catch (e) {
      setErr(e.message || 'Could not move that job.');
    }
  }

  function onDrop(e, status) {
    e.preventDefault();
    setOverColumn(null);
    const id = e.dataTransfer.getData('text/plain');
    moveJob(jobs.find((j) => String(j.id) === id), status);
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Application Board" subtitle="Track your applications with a Kanban view.">
        <button onClick={onAdd} className={primaryBtn} style={{ background: 'var(--brand)' }}><Plus size={16} /> Add Job</button>
      </PageHeader>

      <SearchAndFilter search={search} onSearch={setSearch} placeholder="Search company, role or location…" searchLabel="Search board">
        <FilterSelect label="Filter by source" value={source} onChange={setSource}
          options={[{ value: 'all', label: 'All sources' }, ...sources.map((s) => ({ value: s, label: s }))]} />
      </SearchAndFilter>

      {err && <div role="alert" className="text-sm rounded-lg px-4 py-2.5" style={{ background: 'color-mix(in oklab, var(--red) 12%, var(--surface))', color: 'var(--red)' }}>{err}</div>}

      {jobs.length === 0 ? (
        <EmptyState icon={Kanban} title="Your board is empty" action={<button onClick={onAdd} className={primaryBtn} style={{ background: 'var(--brand)' }}>Add your first job</button>}>
          Add a job and drag it through your pipeline.
        </EmptyState>
      ) : (
        <div className="flex gap-4 overflow-x-auto scrollbar-thin pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x snap-mandatory xl:snap-none">
          {STATUSES.map((status) => (
            <BoardColumn
              key={status.id}
              status={status}
              jobs={filtered.filter((j) => j.status === status.id)}
              hot={overColumn === status.id}
              resetKey={`${search}|${source}`}
              onDragOver={(e) => { e.preventDefault(); setOverColumn(status.id); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOverColumn(null); }}
              onDrop={(e) => onDrop(e, status.id)}
              onMove={moveJob}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}
