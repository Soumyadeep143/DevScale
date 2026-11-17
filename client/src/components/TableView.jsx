import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Download, ExternalLink, Plus, Table2, Trash2, Upload } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { STATUSES } from '../lib/statusConfig';
import { contactHref } from '../lib/contact';
import { jobDate } from '../lib/analytics';
import { downloadCsv, toCsv } from '../lib/exportCsv';
import { useJobs } from '../context/JobsContext';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useWindowedList } from '../lib/useWindowedList';
import InfiniteScrollSentinel from './ui/InfiniteScrollSentinel';
import PageHeader, { ghostBtn, primaryBtn } from './ui/PageHeader';
import SearchAndFilter, { FilterSelect } from './ui/SearchAndFilter';
import CompanyAvatar from './ui/CompanyAvatar';
import ConfirmationDialog from './ui/ConfirmationDialog';
import EmptyState from './ui/EmptyState';

const COLUMNS = [
  { key: 'company', label: 'Company' },
  { key: 'role', label: 'Role' },
  { key: 'status', label: 'Status' },
  { key: 'source', label: 'Source' },
  { key: 'appliedOn', label: 'Applied On' },
  { key: 'location', label: 'Location' },
  { key: 'notes', label: 'Notes' },
];
const PAGE_SIZE = 30;
const CSV_COLUMNS = [
  { label: 'Company', value: (j) => j.company }, { label: 'Role', value: (j) => j.role },
  { label: 'Status', value: (j) => j.status }, { label: 'Source', value: (j) => j.source },
  { label: 'Applied On', value: (j) => jobDate(j) }, { label: 'Location', value: (j) => j.location },
  { label: 'Notes', value: (j) => j.notes },
];

const sortValue = (j, key) => (key === 'appliedOn' ? jobDate(j) : (j[key] || '')).toString().toLowerCase();

export default function TableView({ jobs, onOpen, onAdd, onImport }) {
  const { editJob, promoteLead, removeJob } = useJobs();
  const wide = useMediaQuery('(min-width: 768px)');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState('appliedOn');
  const [sortDir, setSortDir] = useState('desc');
  const [selected, setSelected] = useState(() => new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = jobs.filter((j) => (statusFilter === 'all' || j.status === statusFilter)
      && (!q || `${j.company} ${j.role} ${j.location} ${j.source} ${j.notes}`.toLowerCase().includes(q)));
    list.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      return (av < bv ? -1 : av > bv ? 1 : 0) * (sortDir === 'asc' ? 1 : -1);
    });
    return list;
  }, [jobs, search, statusFilter, sortKey, sortDir]);

  const win = useWindowedList(rows, { pageSize: PAGE_SIZE, resetKey: `${search}|${statusFilter}|${sortKey}|${sortDir}` });
  const pageRows = win.visible;

  // Drop selections for jobs that no longer exist (deleted/promoted elsewhere).
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(jobs.map((j) => j.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [jobs]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }
  const toggleRow = (id) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pageAllSelected = pageRows.length > 0 && pageRows.every((j) => selected.has(j.id));
  const togglePage = () => setSelected((prev) => { const n = new Set(prev); pageRows.forEach((j) => (pageAllSelected ? n.delete(j.id) : n.add(j.id))); return n; });

  const selectedJobs = jobs.filter((j) => selected.has(j.id));

  async function bulkMove(status) {
    if (!status) return;
    setBusy(true); setErr('');
    const failed = [];
    for (const j of selectedJobs) {
      if (j.status === status) continue;
      try {
        if (j.status === 'lead') await promoteLead(j.id, status);
        else await editJob(j.id, { status });
      } catch { failed.push(j.company); }
    }
    setBusy(false);
    setSelected(new Set());
    if (failed.length) setErr(`Couldn’t update: ${failed.join(', ')}.`);
  }

  async function bulkDelete() {
    setBusy(true); setErr('');
    const failed = [];
    for (const j of selectedJobs) {
      try { await removeJob(j.id); } catch { failed.push(j.company); }
    }
    setBusy(false); setConfirmDelete(false); setSelected(new Set());
    if (failed.length) setErr(`Couldn’t delete: ${failed.join(', ')}.`);
  }

  const exportRows = selectedJobs.length ? selectedJobs : rows;
  const exportCsv = () => downloadCsv('devscale-applications.csv', toCsv(CSV_COLUMNS, exportRows));

  const SortIcon = ({ k }) => (sortKey === k ? (sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <ArrowUpDown size={11} style={{ opacity: 0.35 }} />);

  return (
    <div className="space-y-4">
      <PageHeader title="Applications Table" subtitle="A detailed, sortable view of all your job applications.">
        <button onClick={onImport} className={ghostBtn} style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}><Upload size={15} /> Import</button>
        <button onClick={exportCsv} disabled={rows.length === 0} className={ghostBtn} style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}><Download size={15} /> Export</button>
        <button onClick={onAdd} className={`${primaryBtn} hidden sm:inline-flex`} style={{ background: 'var(--brand)' }}><Plus size={16} /> Add Job</button>
      </PageHeader>

      <SearchAndFilter search={search} onSearch={setSearch} placeholder="Search company, role, source, notes…" searchLabel="Search table">
        <FilterSelect label="Filter by status" value={statusFilter} onChange={setStatusFilter}
          options={[{ value: 'all', label: 'All statuses' }, ...STATUSES.map((s) => ({ value: s.id, label: s.label }))]} />
        {!wide && (
          <FilterSelect label="Sort by" value={`${sortKey}:${sortDir}`} onChange={(v) => { const [k, d] = v.split(':'); setSortKey(k); setSortDir(d); }}
            options={COLUMNS.flatMap((c) => [{ value: `${c.key}:asc`, label: `${c.label} ↑` }, { value: `${c.key}:desc`, label: `${c.label} ↓` }])} />
        )}
      </SearchAndFilter>

      {err && <div role="alert" className="text-sm rounded-lg px-4 py-2.5" style={{ background: 'color-mix(in oklab, var(--red) 12%, var(--surface))', color: 'var(--red)' }}>{err}</div>}

      {selected.size > 0 && (
        <div role="region" aria-label="Bulk actions" className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2" style={{ background: 'color-mix(in oklab, var(--brand) 12%, var(--surface))', borderColor: 'var(--brand)' }}>
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{selected.size} selected</span>
          <FilterSelect label="Move selected to" value="" onChange={bulkMove}
            options={[{ value: '', label: 'Move to…' }, ...STATUSES.filter((s) => s.id !== 'lead').map((s) => ({ value: s.id, label: s.label }))]} />
          <button onClick={() => setConfirmDelete(true)} disabled={busy} className={ghostBtn} style={{ borderColor: 'var(--border)', color: 'var(--red)' }}><Trash2 size={14} /> Delete</button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs underline" style={{ color: 'var(--text-secondary)' }}>Clear</button>
        </div>
      )}

      {jobs.length === 0 ? (
        <EmptyState icon={Table2} title="No applications yet" action={<button onClick={onAdd} className={primaryBtn} style={{ background: 'var(--brand)' }}>Add a job</button>}>
          Add or import jobs to see them here.
        </EmptyState>
      ) : rows.length === 0 ? (
        <p className="text-sm text-center py-12 rounded-2xl border" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>No jobs match your filters.</p>
      ) : wide ? (
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
          <div className="overflow-auto scrollbar-thin max-h-[68vh]">
            <table className="w-full text-sm" style={{ minWidth: 900 }}>
              <thead className="sticky top-0 z-10" style={{ background: 'var(--surface)' }}>
                <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                  <th className="px-4 py-3 w-10"><input type="checkbox" aria-label="Select all loaded rows" checked={pageAllSelected} onChange={togglePage} /></th>
                  {COLUMNS.map((col) => (
                    <th key={col.key} aria-sort={sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} className="text-left px-3 py-3 font-medium whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                      <button type="button" onClick={() => toggleSort(col.key)} className="flex items-center gap-1 hover:text-[var(--text-primary)]">{col.label} <SortIcon k={col.key} /></button>
                    </th>
                  ))}
                  <th className="px-3 py-3 text-right font-medium" style={{ color: 'var(--text-muted)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((job) => (
                  <tr key={job.id} className="border-b last:border-b-0 transition-colors hover:bg-[var(--surface-2)]" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-4 py-2.5"><input type="checkbox" aria-label={`Select ${job.company}`} checked={selected.has(job.id)} onChange={() => toggleRow(job.id)} /></td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="flex items-center gap-2.5"><CompanyAvatar name={job.company} size={28} /><span className="font-medium" style={{ color: 'var(--text-primary)' }}>{job.company}</span></span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{job.role}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={job.status} size="sm" /></td>
                    <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{job.source || '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap tabular-nums" style={{ color: 'var(--text-secondary)' }}>{jobDate(job) || '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{job.location || '—'}</td>
                    <td className="px-3 py-2.5 max-w-[14rem] truncate" title={job.notes} style={{ color: 'var(--text-muted)' }}>{job.notes || '—'}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      {job.contact && (
                        <a href={contactHref(job.contact)} target="_blank" rel="noreferrer" aria-label={`Open link for ${job.company}`} className="inline-flex w-8 h-8 items-center justify-center rounded-lg hover:bg-[var(--surface)]" style={{ color: 'var(--text-muted)' }}><ExternalLink size={14} /></a>
                      )}
                      <button onClick={() => onOpen(job, rows)} className="text-xs rounded-lg px-2.5 py-1.5 border hover:bg-[var(--surface)]" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <InfiniteScrollSentinel hasMore={win.hasMore} loading={false} onLoadMore={win.loadMore} loadedCount={pageRows.length} noun="jobs" />
          </div>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {pageRows.map((job) => (
            <li key={job.id} className="rounded-2xl border p-3.5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <div className="flex items-start gap-3">
                <input type="checkbox" className="mt-1" aria-label={`Select ${job.company}`} checked={selected.has(job.id)} onChange={() => toggleRow(job.id)} />
                <button type="button" onClick={() => onOpen(job, rows)} className="flex-1 min-w-0 text-left">
                  <span className="flex items-center gap-2.5">
                    <CompanyAvatar name={job.company} />
                    <span className="min-w-0 flex-1"><span className="block font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{job.company}</span><span className="block text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{job.role}</span></span>
                    <StatusBadge status={job.status} size="sm" />
                  </span>
                  <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {job.location && <span>{job.location}</span>}{job.source && <span>{job.source}</span>}{jobDate(job) && <span>{jobDate(job)}</span>}
                  </span>
                  {job.notes && <span className="mt-1.5 block text-xs line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{job.notes}</span>}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {rows.length > 0 && (
        <>
          {!wide && <InfiniteScrollSentinel hasMore={win.hasMore} loading={false} onLoadMore={win.loadMore} loadedCount={pageRows.length} noun="jobs" />}
          <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>Showing {pageRows.length} of {rows.length}</p>
        </>
      )}

      <ConfirmationDialog open={confirmDelete} danger busy={busy} title={`Delete ${selected.size} job${selected.size === 1 ? '' : 's'}?`}
        message="This permanently removes the selected jobs from your account. It can’t be undone." confirmLabel="Delete"
        onConfirm={bulkDelete} onCancel={() => setConfirmDelete(false)} />
    </div>
  );
}
