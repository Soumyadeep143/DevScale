import { useCallback, useEffect, useMemo, useState } from 'react';
import { Share2, Eye, ExternalLink, Lock, Download, Loader2, MapPin, SlidersHorizontal, ArrowUpDown, Inbox, UserPlus, Check } from 'lucide-react';
import PageHeader, { primaryBtn, ghostBtn } from '../ui/PageHeader';
import EmptyState from '../ui/EmptyState';
import LoadingSkeleton from '../ui/LoadingSkeleton';
import ConfirmationDialog from '../ui/ConfirmationDialog';
import CompanyAvatar from '../ui/CompanyAvatar';
import Modal from '../ui/Modal';
import SearchAndFilter, { FilterSelect } from '../ui/SearchAndFilter';
import StatusBadge from '../StatusBadge';
import { fetchMyLeads, fetchSharedLeads, setLeadVisibility, setLeadsVisibility, importSharedLead } from '../../lib/api';
import { useJobs } from '../../context/JobsContext';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { STATUSES } from '../../lib/statusConfig';
import { myStatusFor, formatDate } from '../../lib/team';
import { Avatar, Badge, Notice, PillTabs, cardStyle, muted, iconBtn } from './parts';
import SharePicker from './SharePicker';
import { useSharedChanges } from '../../lib/sharedUpdates';

const DATES = [{ value: 'all', label: 'Any date' }, { value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }];
const SORTS = [{ value: 'new', label: 'Newest first' }, { value: 'old', label: 'Oldest first' }, { value: 'company', label: 'Company A–Z' }];
const STATUS_FILTER = [{ value: 'all', label: 'Any status' }, { value: 'none', label: 'Not applied' }, ...STATUSES.map((s) => ({ value: s.id, label: s.label }))];

// "My Status" is the signed-in user's OWN pipeline entry for this role. A peer's status is
// never sent to the client, so it can never appear here.
function MyStatus({ status }) {
  return status ? <StatusBadge status={status} size="sm" /> : <Badge color="var(--text-muted)">Not Applied</Badge>;
}

function RowActions({ row, busy, onView, onImport, onStop }) {
  return (
    <div className="flex items-center justify-end gap-0.5">
      <button className={iconBtn} aria-label={`View ${row.company}`} onClick={() => onView(row)} style={{ color: 'var(--text-secondary)' }}><Eye size={15} /></button>
      {row.jobUrl && <a className={iconBtn} aria-label={`Open job link for ${row.company}`} href={row.jobUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--text-secondary)' }}><ExternalLink size={15} /></a>}
      {row.kind === 'byMe' && (
        <button className={iconBtn} aria-label={`Move ${row.company} to Personal`} disabled={busy} onClick={() => onStop(row)} style={{ color: 'var(--text-secondary)' }}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />}
        </button>
      )}
      {row.kind === 'withMe' && (row.alreadyImported
        ? <span className="text-xs inline-flex items-center gap-1 px-2" style={{ color: 'var(--green)' }}><Check size={13} /> In your Personal leads</span>
        : <button className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white min-h-[36px] disabled:opacity-50" style={{ background: 'var(--brand)' }}
          disabled={busy} onClick={() => onImport(row, 'lead')} aria-label={`Save ${row.company} to Personal`}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Save to Personal
        </button>)}
    </div>
  );
}

function LeadCard({ row, ...actions }) {
  return (
    <div className="rounded-xl border p-3.5 space-y-2.5" style={cardStyle}>
      <div className="flex items-start gap-3">
        <CompanyAvatar name={row.company} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{row.company}</p>
          <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{row.role}</p>
        </div>
        <MyStatus status={row.status} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={muted}>
        {row.location && <span className="inline-flex items-center gap-1"><MapPin size={11} /> {row.location}</span>}
        <span>{row.kind === 'byMe' ? 'Shared by you' : `Shared by ${row.owner}`}</span>
        <span>{formatDate(row.createdAt)}</span>
      </div>
      <div className="pt-2 border-t" style={{ borderColor: 'var(--border)' }}><RowActions row={row} {...actions} /></div>
    </div>
  );
}

function LeadTable({ rows, ...actions }) {
  const th = 'text-left text-xs font-medium px-3 py-2.5';
  return (
    <div className="rounded-2xl border overflow-hidden" style={cardStyle}>
      <table className="w-full text-sm">
        <thead style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
          <tr><th className={th}>Company</th><th className={th}>Role</th><th className={th}>Shared By</th><th className={th}>My Status</th><th className={th}>Added On</th><th className={`${th} text-right`}>Actions</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t" style={{ borderColor: 'var(--border)' }}>
              <td className="px-3 py-2.5"><div className="flex items-center gap-2.5 min-w-0"><CompanyAvatar name={r.company} size={30} /><span className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{r.company}</span></div></td>
              <td className="px-3 py-2.5 max-w-[14rem]"><p className="truncate" style={{ color: 'var(--text-secondary)' }}>{r.role}</p>{r.location && <p className="text-xs truncate" style={muted}>{r.location}</p>}</td>
              <td className="px-3 py-2.5"><div className="flex items-center gap-2"><Avatar name={r.owner} size={24} /><span style={{ color: 'var(--text-secondary)' }}>{r.owner}</span></div></td>
              <td className="px-3 py-2.5"><MyStatus status={r.status} /></td>
              <td className="px-3 py-2.5 whitespace-nowrap" style={muted}>{formatDate(r.createdAt)}</td>
              <td className="px-3 py-2.5"><RowActions row={r} {...actions} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeadDetail({ row, busy, onClose, onImport, onStop }) {
  const [stage, setStage] = useState('lead');
  if (!row) return null;
  const line = (label, value) => value ? <div><dt className="text-xs" style={muted}>{label}</dt><dd className="text-sm" style={{ color: 'var(--text-primary)' }}>{value}</dd></div> : null;
  return (
    <Modal open onClose={onClose} title={`${row.company} — ${row.role}`}>
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-3">
          {line('Original owner', row.kind === 'byMe' ? 'You' : row.owner)}
          {line('Shared on', formatDate(row.createdAt))}
          {line('Location', row.location)}
          {line('Source', row.source)}
          {line('Experience', row.experience)}
          {line('Visibility', row.kind === 'byMe' ? 'Shared with your peers' : 'Shared with you by a peer')}
        </dl>
        {row.description && <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>{row.description}</p>}
        <div className="rounded-xl p-3 text-sm space-y-1.5" style={{ background: 'var(--surface-2)' }}>
          <p className="flex items-center justify-between gap-2"><span style={{ color: 'var(--text-secondary)' }}>Your application status</span><MyStatus status={row.status} /></p>
          <p className="text-xs" style={muted}>Application status is personal. {row.kind === 'withMe' ? `${row.owner} keeps their own, and nothing you change here affects it.` : 'Peers who import this lead track their own status.'}</p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          {row.jobUrl && <a href={row.jobUrl} target="_blank" rel="noreferrer" className={ghostBtn} style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}><ExternalLink size={14} /> Open job link</a>}
          {row.kind === 'byMe' && <button onClick={() => onStop(row)} className={ghostBtn} style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}><Lock size={14} /> Move to Personal</button>}
          {row.kind === 'withMe' && !row.alreadyImported && (
            <>
              <select value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Import as" className="rounded-lg px-2 py-2 text-sm border min-h-[40px]" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.id === 'lead' ? 'Save as lead' : `Mark ${s.label}`}</option>)}
              </select>
              <button onClick={() => onImport(row, stage)} disabled={busy} className={primaryBtn} style={{ background: 'var(--brand)' }}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Save to Personal</button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default function TeamLeads({ intent, onIntentDone, onNavigate }) {
  const { jobs, refresh } = useJobs();
  const isWide = useMediaQuery('(min-width: 768px)');
  const [mine, setMine] = useState([]);
  const [shared, setShared] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [peer, setPeer] = useState('all');
  const [date, setDate] = useState('all');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('new');
  const [detail, setDetail] = useState(null);
  const [confirmStop, setConfirmStop] = useState(null);
  const [picker, setPicker] = useState(false);

  const load = useCallback(async () => {
    setErr('');
    try {
      const [m, s] = await Promise.all([fetchMyLeads(), fetchSharedLeads()]);
      setMine(m);
      setShared(s);
    } catch (e) {
      setErr(e.message || 'Could not load leads.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useSharedChanges(['leads'], load); // reload live when peers change what they share with you
  useEffect(() => {
    if (intent === 'share') { setPicker(true); onIntentDone && onIntentDone(); }
  }, [intent, onIntentDone]);

  const rows = useMemo(() => [
    ...mine.filter((l) => l.visibility === 'peer').map((l) => ({ ...l, key: `m${l.id}`, kind: 'byMe', owner: 'You', status: myStatusFor(l, jobs) || (l.applied ? 'applied' : null) })),
    ...shared.map((l) => ({ ...l, key: `s${l.id}`, kind: 'withMe', owner: l.owner || 'A peer', status: l.alreadyImported ? myStatusFor(l, jobs) : null })),
  ], [mine, shared, jobs]);
  const counts = { all: rows.length, byMe: rows.filter((r) => r.kind === 'byMe').length, withMe: rows.filter((r) => r.kind === 'withMe').length };
  const owners = useMemo(() => [...new Set(rows.filter((r) => r.kind === 'withMe').map((r) => r.owner))].sort(), [rows]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const cutoff = date === 'all' ? 0 : Date.now() - Number(date) * 86400000;
    const out = rows.filter((r) =>
      (tab === 'all' || r.kind === tab) &&
      (peer === 'all' || r.owner === peer) &&
      Date.parse(r.createdAt) >= cutoff &&
      (status === 'all' || (status === 'none' ? !r.status : r.status === status)) &&
      (!needle || `${r.company} ${r.role} ${r.location}`.toLowerCase().includes(needle)));
    out.sort((a, b) => sort === 'company' ? a.company.localeCompare(b.company)
      : sort === 'old' ? Date.parse(a.createdAt) - Date.parse(b.createdAt) : Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return out;
  }, [rows, tab, q, peer, date, status, sort]);

  async function run(id, fn, ok) {
    setBusyId(id); setErr(''); setNotice('');
    try { await fn(); setNotice(ok); await load(); refresh(); } catch (e) { setErr(e.message || 'That did not work.'); } finally { setBusyId(null); }
  }
  const doImport = (row, stage) => run(row.id, () => importSharedLead(row.id, stage), `Imported ${row.company}. It is your own copy — changing it never affects ${row.owner}.`).then(() => setDetail(null));
  const doStop = () => {
    const row = confirmStop; setConfirmStop(null);
    return run(row.id, () => setLeadVisibility(row.id, 'personal'), 'Moved back to Personal — peers can no longer see it.').then(() => setDetail(null));
  };
  const doShare = (lead) => run(lead.id, () => setLeadVisibility(lead.id, 'peer'), `Moved ${lead.company} to Team. It left your Personal leads.`);

  const actions = { busy: false, onView: setDetail, onImport: doImport, onStop: setConfirmStop };
  const shareable = mine.filter((l) => l.visibility === 'personal' && !l.applied);
  // Several at once: one reload at the end, and a partial failure is reported, not hidden.
  const doShareMany = async (leads) => {
    setBusyId('many'); setErr(''); setNotice('');
    try {
      const n = await setLeadsVisibility(leads.map((l) => l.id), 'peer');
      setNotice(`Moved ${n} lead${n === 1 ? '' : 's'} to Team. ${n === 1 ? 'It' : 'They'} left your Personal leads.`);
    } catch (e) { setErr(e.message || 'Could not move those leads.'); }
    finally { setBusyId(null); await load(); }
  };
  const filtersActive = peer !== 'all' || date !== 'all' || status !== 'all';

  return (
    <div className="space-y-4">
      <PageHeader title="Team Leads" subtitle="Job opportunities shared across your peer network.">
        <button onClick={() => setPicker(true)} className={primaryBtn} style={{ background: 'var(--brand)' }}><Share2 size={15} /> Move Lead to Team</button>
      </PageHeader>

      <PillTabs label="Lead categories" value={tab} onChange={setTab}
        tabs={[{ id: 'all', label: 'All Shared', count: counts.all }, { id: 'byMe', label: 'Shared by Me', count: counts.byMe }, { id: 'withMe', label: 'Shared With Me', count: counts.withMe }]} />

      <SearchAndFilter search={q} onSearch={setQ} placeholder="Search by company, role, or location…" searchLabel="Search leads">
        <button onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters} className={ghostBtn} style={{ borderColor: filtersActive ? 'var(--brand)' : 'var(--border)', color: 'var(--text-secondary)' }}><SlidersHorizontal size={14} /> Filters</button>
        <FilterSelect icon={ArrowUpDown} value={sort} onChange={setSort} label="Sort leads" options={SORTS} />
      </SearchAndFilter>
      {showFilters && (
        <div className="flex flex-wrap gap-2">
          <FilterSelect value={peer} onChange={setPeer} label="Filter by peer" options={[{ value: 'all', label: 'All peers' }, ...owners.map((o) => ({ value: o, label: o }))]} />
          <FilterSelect value={date} onChange={setDate} label="Filter by date" options={DATES} />
          <FilterSelect value={status} onChange={setStatus} label="Filter by my status" options={STATUS_FILTER} />
        </div>
      )}

      <Notice err={err} notice={notice} />

      {loading ? <LoadingSkeleton rows={5} label="Loading leads" /> : list.length === 0 ? (
        rows.length === 0 ? (
          <EmptyState icon={Inbox} title="No shared leads yet" action={<>
            <button onClick={() => setPicker(true)} className={primaryBtn} style={{ background: 'var(--brand)' }}><Share2 size={15} /> Move Lead to Team</button>
            <button onClick={() => onNavigate && onNavigate('peers', 'connect')} className={ghostBtn} style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}><UserPlus size={15} /> Connect Peer</button></>}>
            Move a lead to Team to share it with your peers, or connect with a peer to see what they share.
          </EmptyState>
        ) : <p className="text-sm text-center py-10" style={muted}>No leads match your search or filters.</p>
      ) : isWide ? <LeadTable rows={list} {...actions} /> : (
        <div className="space-y-3">{list.map((r) => <LeadCard key={r.key} row={r} {...actions} busy={busyId === r.id} />)}</div>
      )}

      <LeadDetail key={detail?.key} row={detail} busy={busyId === detail?.id} onClose={() => setDetail(null)} onImport={doImport} onStop={setConfirmStop} />
      <ConfirmationDialog open={!!confirmStop} title="Move this lead back to Personal?" confirmLabel="Move to Personal"
        message={confirmStop ? `${confirmStop.company} — ${confirmStop.role} becomes personal. Your peers lose access immediately; anyone who already imported it keeps their own copy.` : ''}
        onConfirm={doStop} onCancel={() => setConfirmStop(null)} />
      <SharePicker open={picker} onClose={() => setPicker(false)} title="Move a lead to Team" items={shareable}
        getTitle={(l) => l.company} getSub={(l) => l.role} onShare={doShare} onShareMany={doShareMany} noun="leads" busyId={busyId}
        emptyText="You have no personal leads to share. Add leads in your Personal workspace first." />
    </div>
  );
}
