import { useMemo, useState } from 'react';
import { ArrowUpDown, CalendarDays, ExternalLink, Inbox, Loader2, MapPin, Plus, Upload, Users } from 'lucide-react';
import { useJobs } from '../context/JobsContext';
import { setLeadVisibility } from '../lib/api';
import { STATUSES } from '../lib/statusConfig';
import { contactHref } from '../lib/contact';
import { jobDate } from '../lib/analytics';
import { personalJobs } from '../lib/personal';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useWindowedList } from '../lib/useWindowedList';
import InfiniteScrollSentinel from './ui/InfiniteScrollSentinel';
import PageHeader, { ghostBtn, primaryBtn } from './ui/PageHeader';
import SearchAndFilter, { FilterSelect } from './ui/SearchAndFilter';
import CompanyAvatar from './ui/CompanyAvatar';
import EmptyState from './ui/EmptyState';
import StatusBadge from './StatusBadge';

const TABS = [{ id: 'all', label: 'All' }, ...STATUSES.map((s) => ({ id: s.id, label: s.id === 'lead' ? 'Leads' : s.label }))];
const DATES = [
  { value: 'any', label: 'Any time' }, { value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' },
];
const SORTS = [
  { value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' },
  { value: 'company', label: 'Company A–Z' }, { value: 'status', label: 'Status' },
];
const STATUS_ORDER = Object.fromEntries(STATUSES.map((s, i) => [s.id, i]));

export default function MyLeads({ onOpen, onAdd, onImport }) {
  const { jobs: allJobs, refresh } = useJobs();
  // A lead moved to Team has left Personal (it shows under Team → Leads until moved back).
  const jobs = useMemo(() => personalJobs(allJobs), [allJobs]);
  const wide = useMediaQuery('(min-width: 768px)');
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [date, setDate] = useState('any');
  const [sort, setSort] = useState('newest');
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');

  const counts = useMemo(() => {
    const c = { all: jobs.length };
    for (const s of STATUSES) c[s.id] = jobs.filter((j) => j.status === s.id).length;
    return c;
  }, [jobs]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cutoff = date === 'any' ? 0 : Date.now() - Number(date) * 86400000;
    const list = jobs.filter((j) => (tab === 'all' || j.status === tab)
      && (!q || `${j.company} ${j.role} ${j.location}`.toLowerCase().includes(q))
      && (!cutoff || (j.createdAt && new Date(j.createdAt).getTime() >= cutoff)));
    const byDate = (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '');
    list.sort({
      newest: byDate, oldest: (a, b) => -byDate(a, b),
      company: (a, b) => a.company.localeCompare(b.company),
      status: (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || byDate(a, b),
    }[sort]);
    return list;
  }, [jobs, tab, search, date, sort]);

  const win = useWindowedList(rows, { pageSize: 30, resetKey: `${tab}|${search}|${date}|${sort}` });

  // Moves an open lead to Team: peers can see it, and it leaves the Personal lists.
  async function moveToTeam(job) {
    setBusyId(job.id); setErr(''); setNotice('');
    try {
      await setLeadVisibility(String(job.id).replace(/^l-/, ''), 'peer');
      setNotice(`Moved ${job.company} to Team. It now lives under Team → Leads; move it back from there any time.`);
      await refresh();
    } catch (e) {
      setErr(e.message || 'Could not move this lead.');
    } finally {
      setBusyId(null);
    }
  }

  // Only open leads can move; applied jobs, interviews, offers and rejections always stay personal.
  const MoveCell = ({ job }) => {
    if (job.status !== 'lead') return null;
    return (
      <button type="button" onClick={(e) => { e.stopPropagation(); moveToTeam(job); }} disabled={busyId === job.id}
        aria-label={`Move ${job.company} to Team`}
        className="inline-flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 border hover:bg-[var(--surface-2)] disabled:opacity-50 min-h-[32px]"
        style={{ borderColor: 'var(--border)', color: 'var(--purple)' }}>
        {busyId === job.id ? <Loader2 size={12} className="animate-spin" /> : <Users size={12} />} Move to Team
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader title="My Leads" subtitle="Track and manage your job opportunities.">
        <button onClick={onImport} className={ghostBtn} style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}><Upload size={15} /> Import</button>
        <button onClick={onAdd} className={primaryBtn} style={{ background: 'var(--brand)' }}><Plus size={16} /> Add Job</button>
      </PageHeader>

      <div role="tablist" aria-label="Lead status" className="flex gap-2 overflow-x-auto scrollbar-thin pb-1">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className="shrink-0 text-sm rounded-full px-3.5 py-1.5 border font-medium min-h-[36px]"
            style={{ background: tab === t.id ? 'color-mix(in oklab, var(--brand) 18%, var(--surface))' : 'var(--surface)', borderColor: tab === t.id ? 'var(--brand)' : 'var(--border)', color: tab === t.id ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
            {t.label} <span className="opacity-70 tabular-nums">({counts[t.id]})</span>
          </button>
        ))}
      </div>

      <SearchAndFilter search={search} onSearch={setSearch} placeholder="Search by company, role or location…" searchLabel="Search leads">
        <FilterSelect label="Date added" value={date} onChange={setDate} options={DATES} icon={CalendarDays} />
        <FilterSelect label="Sort leads" value={sort} onChange={setSort} options={SORTS} icon={ArrowUpDown} />
      </SearchAndFilter>

      {err && <div role="alert" className="text-sm rounded-lg px-4 py-2.5" style={{ background: 'color-mix(in oklab, var(--red) 12%, var(--surface))', color: 'var(--red)' }}>{err}</div>}
      {notice && <div role="status" className="text-sm rounded-lg px-4 py-2.5" style={{ background: 'color-mix(in oklab, var(--green) 12%, var(--surface))', color: 'var(--text-primary)' }}>{notice}</div>}

      {rows.length === 0 ? (
        <EmptyState icon={Inbox} title={jobs.length === 0 ? 'No leads yet' : 'No jobs match your filters'}
          action={jobs.length === 0 ? <button onClick={onAdd} className={primaryBtn} style={{ background: 'var(--brand)' }}>Add a job</button> : null}>
          {jobs.length === 0 ? 'Add a job or import your existing list.' : 'Try a different status, date range or search.'}
        </EmptyState>
      ) : wide ? (
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm" style={{ minWidth: 860 }}>
              <thead>
                <tr className="border-b text-left" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                  {['Company', 'Position', 'Location', 'Status', 'Source', 'Date added', ''].map((h) => <th key={h || 'x'} className="px-3 py-3 font-medium whitespace-nowrap">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {win.visible.map((j) => (
                  <tr key={j.id} onClick={() => onOpen(j, rows)} className="border-b last:border-b-0 cursor-pointer hover:bg-[var(--surface-2)] transition-colors" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-3 py-2.5 whitespace-nowrap"><span className="flex items-center gap-2.5"><CompanyAvatar name={j.company} size={28} /><span className="font-medium" style={{ color: 'var(--text-primary)' }}>{j.company}</span></span></td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--text-secondary)' }}>{j.role}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{j.location || '—'}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={j.status} size="sm" /></td>
                    <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{j.source || '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap tabular-nums" style={{ color: 'var(--text-secondary)' }}>{jobDate(j) || '—'}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <MoveCell job={j} />
                      {(j.jobUrl || j.contact) && <a href={j.jobUrl || contactHref(j.contact)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} aria-label={`Open link for ${j.company}`} className="inline-flex w-8 h-8 items-center justify-center rounded-lg hover:bg-[var(--surface)]" style={{ color: 'var(--text-muted)' }}><ExternalLink size={14} /></a>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {win.visible.map((j) => (
            <li key={j.id} className="rounded-2xl border p-3.5 space-y-2.5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <button type="button" onClick={() => onOpen(j, rows)} className="w-full text-left flex items-center gap-2.5">
                <CompanyAvatar name={j.company} />
                <span className="min-w-0 flex-1"><span className="block font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{j.company}</span><span className="block text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{j.role}</span></span>
                <StatusBadge status={j.status} size="sm" />
              </button>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                <span className="flex items-center gap-3">{j.location && <span className="flex items-center gap-1"><MapPin size={11} /> {j.location}</span>}{jobDate(j) && <span>{jobDate(j)}</span>}</span>
                <MoveCell job={j} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {rows.length > 0 && (
        <InfiniteScrollSentinel hasMore={win.hasMore} loading={false} onLoadMore={win.loadMore} loadedCount={win.visible.length} noun="jobs" />
      )}
    </div>
  );
}
