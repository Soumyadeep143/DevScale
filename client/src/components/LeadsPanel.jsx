import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, ExternalLink, MapPin, Lock, Users, Download, Check } from 'lucide-react';
import { fetchMyLeads, fetchSharedLeads, setLeadVisibility, importSharedLead } from '../lib/api';
import { useJobs } from '../context/JobsContext';
import { STATUSES } from '../lib/statusConfig';
import { contactHref } from '../lib/contact';
import { useSharedChanges } from '../lib/sharedUpdates';

const card = { background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' };
const muted = { color: 'var(--text-muted)' };
const btn = 'text-sm rounded-lg px-3 py-1.5 font-medium disabled:opacity-50 flex items-center gap-1.5 hover:opacity-90';

// Personal shows only your own private leads; Team shows the sharing side.
const VIEWS_BY_MODE = {
  personal: [{ id: 'personal', label: 'My personal leads' }],
  team: [{ id: 'byMe', label: 'Shared by me' }, { id: 'withMe', label: 'Shared with me' }],
};
const COPY = {
  personal: 'Leads you keep to yourself. Share one with your peers and it moves to the Team workspace.',
  team: 'Leads shared with your accepted peers. Importing a shared lead gives you your own copy with its own status — nothing you do with it is visible to the person who shared it.',
};

function matches(lead, q) {
  if (!q) return true;
  return `${lead.company} ${lead.role} ${lead.location} ${lead.owner || ''}`.toLowerCase().includes(q);
}

function LeadCard({ lead, owner, children }) {
  const href = lead.jobUrl || (lead.contact ? contactHref(lead.contact) : '');
  return (
    <div className="rounded-xl border p-3.5 space-y-2" style={card}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{lead.company}</p>
          <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{lead.role}</p>
        </div>
        {href && (
          <a href={href} target="_blank" rel="noreferrer" aria-label={`Open link for ${lead.company}`}
            className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-70" style={muted}>
            <ExternalLink size={14} />
          </a>
        )}
      </div>
      {(lead.location || lead.experience || lead.postedTime) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={muted}>
          {lead.location && <span className="flex items-center gap-1"><MapPin size={11} /> {lead.location}</span>}
          {lead.experience && <span>{lead.experience}</span>}
          {lead.postedTime && <span>{lead.postedTime}</span>}
        </div>
      )}
      {lead.description && (
        <p className="text-xs line-clamp-3 whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>{lead.description}</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <span className="text-xs" style={muted}>{owner ? `Shared by ${owner}` : lead.source || ''}</span>
        <div className="flex items-center gap-2">{children}</div>
      </div>
    </div>
  );
}

function SharedWithMeCard({ lead, busy, onImport }) {
  const [stage, setStage] = useState('lead');
  return (
    <LeadCard lead={lead} owner={lead.owner || 'a peer'}>
      {lead.alreadyImported ? (
        <span className="text-xs flex items-center gap-1" style={{ color: 'var(--status-offer)' }}>
          <Check size={13} /> In your pipeline
        </span>
      ) : (
        <>
          <select value={stage} onChange={(e) => setStage(e.target.value)} aria-label={`Import ${lead.company} as`}
            className="text-xs rounded-lg px-2 py-1.5 border outline-none"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
            {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.id === 'lead' ? 'Save as lead' : `Mark ${s.label}`}</option>)}
          </select>
          <button onClick={() => onImport(lead, stage)} disabled={busy} className={`${btn} text-white`} style={{ background: 'var(--brand)' }}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={14} />} Import
          </button>
        </>
      )}
    </LeadCard>
  );
}

export default function LeadsPanel({ mode = 'personal' }) {
  const { refresh } = useJobs();
  const views = VIEWS_BY_MODE[mode] || VIEWS_BY_MODE.personal;
  const [view, setView] = useState(views[0].id);
  const [mine, setMine] = useState([]);
  const [shared, setShared] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setErr('');
    try {
      const [m, s] = await Promise.all([fetchMyLeads(), fetchSharedLeads()]);
      setMine(m);
      setShared(s);
    } catch (error) {
      setErr(error.message || 'Could not load leads.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useSharedChanges(['leads'], load); // reload live when peers change what they share with you

  const q = search.trim().toLowerCase();
  const personal = useMemo(() => mine.filter((l) => l.visibility === 'personal' && !l.applied && matches(l, q)), [mine, q]);
  const byMe = useMemo(() => mine.filter((l) => l.visibility === 'peer' && matches(l, q)), [mine, q]);
  const withMe = useMemo(() => shared.filter((l) => matches(l, q)), [shared, q]);
  const counts = { personal: personal.length, byMe: byMe.length, withMe: withMe.length };

  async function changeVisibility(lead, visibility) {
    if (visibility === 'personal' &&
        !confirm(`Make ${lead.company} — ${lead.role} personal? Your peers will lose access immediately. Anyone who already imported it keeps their own copy.`)) return;
    setBusyId(lead.id);
    setErr('');
    setNotice('');
    try {
      await setLeadVisibility(lead.id, visibility);
      setNotice(visibility === 'peer' ? 'Shared with your peers.' : 'Now personal — peers can no longer see it.');
      await load();
      refresh();
    } catch (error) {
      setErr(error.message || 'Could not change visibility.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleImport(lead, status) {
    setBusyId(lead.id);
    setErr('');
    setNotice('');
    try {
      await importSharedLead(lead.id, status);
      setNotice(`Imported ${lead.company}. It is your own copy — changing it never affects ${lead.owner || 'the owner'}.`);
      await load();
      refresh();
    } catch (error) {
      setErr(error.message || 'Could not import this lead.');
    } finally {
      setBusyId(null);
    }
  }

  const list = view === 'personal' ? personal : view === 'byMe' ? byMe : withMe;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h2 className="text-base font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Users size={18} style={{ color: 'var(--brand)' }} /> {mode === 'team' ? 'Team leads' : 'Leads'}
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{COPY[mode] || COPY.personal}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {views.length > 1 && <div role="tablist" aria-label="Lead views" className="flex gap-1 rounded-lg p-1 border" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
          {views.map((v) => (
            <button key={v.id} role="tab" aria-selected={view === v.id} onClick={() => setView(v.id)}
              className="text-sm rounded-md px-3 py-1.5 font-medium"
              style={{ background: view === v.id ? 'var(--brand)' : 'transparent', color: view === v.id ? '#fff' : 'var(--text-secondary)' }}>
              {v.label} <span className="opacity-75">· {counts[v.id]}</span>
            </button>
          ))}
        </div>}
        <div className="relative flex-1 min-w-[12rem]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={muted} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company, role, location…" aria-label="Search leads"
            className="w-full rounded-lg pl-8 pr-3 py-1.5 text-sm outline-none border focus:ring-2"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
        </div>
      </div>

      {err && (
        <div role="alert" className="text-sm rounded-lg p-3"
          style={{ background: 'color-mix(in oklab, var(--status-rejected) 12%, var(--surface))', color: 'var(--status-rejected)' }}>{err}</div>
      )}
      {notice && (
        <div role="status" className="text-sm rounded-lg p-3"
          style={{ background: 'color-mix(in oklab, var(--status-offer) 12%, var(--surface))', color: 'var(--text-primary)' }}>{notice}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12" style={muted}><Loader2 size={18} className="animate-spin mr-2" /> Loading leads…</div>
      ) : list.length === 0 ? (
        <p className="text-sm text-center py-10" style={muted}>
          {view === 'personal' && 'No personal leads here. Leads you add stay private until you share them.'}
          {view === 'byMe' && 'You are not sharing any leads. Share one from Personal → Leads.'}
          {view === 'withMe' && 'Nothing shared with you yet. Connect with a peer on the Peers tab.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {view === 'withMe'
            ? list.map((l) => <SharedWithMeCard key={l.id} lead={l} busy={busyId === l.id} onImport={handleImport} />)
            : list.map((l) => (
              <LeadCard key={l.id} lead={l}>
                {view === 'personal' ? (
                  <button onClick={() => changeVisibility(l, 'peer')} disabled={busyId === l.id} className={`${btn} border`}
                    style={{ borderColor: 'var(--border)', color: 'var(--brand)' }}>
                    {busyId === l.id ? <Loader2 size={13} className="animate-spin" /> : <Users size={14} />} Share with peers
                  </button>
                ) : (
                  <button onClick={() => changeVisibility(l, 'personal')} disabled={busyId === l.id} className={`${btn} border`}
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                    {busyId === l.id ? <Loader2 size={13} className="animate-spin" /> : <Lock size={14} />} Make personal
                  </button>
                )}
              </LeadCard>
            ))}
        </div>
      )}
    </div>
  );
}
