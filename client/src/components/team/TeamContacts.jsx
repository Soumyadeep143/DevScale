import { useCallback, useEffect, useMemo, useState } from 'react';
import { Share2, Eye, Pencil, Trash2, Lock, Mail, Phone, ExternalLink, Copy, Check, Loader2, SlidersHorizontal, ArrowUpDown, Contact as ContactIcon, UserPlus, Plus, Upload } from 'lucide-react';
import PageHeader, { primaryBtn, ghostBtn } from '../ui/PageHeader';
import EmptyState from '../ui/EmptyState';
import LoadingSkeleton from '../ui/LoadingSkeleton';
import ConfirmationDialog from '../ui/ConfirmationDialog';
import Modal from '../ui/Modal';
import SearchAndFilter, { FilterSelect } from '../ui/SearchAndFilter';
import ContactModal from '../ContactModal';
import ContactImportModal from '../ContactImportModal';
import { fetchContacts, fetchSharedContacts, createContact, updateContact, deleteContact, duplicateContact, setContactsVisibility } from '../../lib/api';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { formatDate } from '../../lib/team';
import { Avatar, Badge, Notice, PillTabs, cardStyle, muted, iconBtn } from './parts';
import SharePicker from './SharePicker';
import { useSharedChanges } from '../../lib/sharedUpdates';

const SORTS = [{ value: 'name', label: 'Name A–Z' }, { value: 'company', label: 'Company A–Z' }, { value: 'new', label: 'Newest first' }];
const sub = (c) => [c.designation, c.company].filter(Boolean).join(' • ');

function Actions({ c, busy, onView, onEdit, onDelete, onStop, onSave }) {
  const mine = c.kind === 'byMe';
  const link = { color: 'var(--text-secondary)' };
  return (
    <div className="flex flex-wrap items-center justify-end gap-0.5">
      <a className={iconBtn} style={link} href={`mailto:${c.email}`} aria-label={`Email ${c.name}`}><Mail size={15} /></a>
      <a className={iconBtn} style={link} href={`tel:${c.phone}`} aria-label={`Call ${c.name}`}><Phone size={15} /></a>
      {c.linkedinUrl && <a className={iconBtn} style={link} href={c.linkedinUrl} target="_blank" rel="noreferrer" aria-label={`Open LinkedIn for ${c.name}`}><ExternalLink size={15} /></a>}
      <button className={iconBtn} style={link} onClick={() => onView(c)} aria-label={`View ${c.name}`}><Eye size={15} /></button>
      {mine ? (
        <>
          <button className={iconBtn} style={link} onClick={() => onEdit(c)} aria-label={`Edit ${c.name}`}><Pencil size={15} /></button>
          <button className={iconBtn} style={link} onClick={() => onStop(c)} aria-label={`Move ${c.name} to Personal`}><Lock size={15} /></button>
          <button className={iconBtn} style={{ color: 'var(--red)' }} onClick={() => onDelete(c)} aria-label={`Delete ${c.name}`}><Trash2 size={15} /></button>
        </>
      ) : c.alreadySaved ? (
        <span className="text-xs inline-flex items-center gap-1 px-2" style={{ color: 'var(--green)' }}><Check size={13} /> In your contacts</span>
      ) : (
        <button className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border min-h-[36px] disabled:opacity-50" style={{ borderColor: 'var(--border)', color: 'var(--brand)' }}
          disabled={busy} onClick={() => onSave(c)} aria-label={`Save ${c.name} to my contacts`}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Copy size={13} />} Save to Personal
        </button>
      )}
    </div>
  );
}

const ownerBadge = (c) => (c.kind === 'byMe' ? <Badge color="var(--brand)">Shared by Me</Badge> : <Badge color="var(--purple)">Shared with Me</Badge>);

function ContactCard({ c, ...a }) {
  return (
    <div className="rounded-xl border p-3.5 space-y-2.5" style={cardStyle}>
      <div className="flex items-start gap-3">
        <Avatar name={c.name} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{c.name}</p>
          <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{sub(c)}</p>
        </div>
        {ownerBadge(c)}
      </div>
      <div className="text-xs space-y-1" style={muted}>
        <p className="truncate">{c.email}</p><p>{c.phone}</p>
        <p>{c.kind === 'byMe' ? 'Shared by you' : `Shared by ${c.owner}`} · {formatDate(c.createdAt)}</p>
      </div>
      <div className="pt-2 border-t" style={{ borderColor: 'var(--border)' }}><Actions c={c} {...a} /></div>
    </div>
  );
}

function ContactTable({ rows, ...a }) {
  return (
    <div className="rounded-2xl border overflow-x-auto" style={cardStyle}>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((c) => (
            <tr key={c.key} className="border-t first:border-t-0" style={{ borderColor: 'var(--border)' }}>
              <td className="px-3 py-3"><div className="flex items-center gap-3 min-w-0"><Avatar name={c.name} /><div className="min-w-0"><p className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{c.name}</p><p className="text-xs truncate" style={muted}>{sub(c)}</p></div></div></td>
              <td className="px-3 py-3 max-w-[13rem] truncate" style={{ color: 'var(--text-secondary)' }}>{c.email}</td>
              <td className="px-3 py-3 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{c.phone}</td>
              <td className="px-3 py-3">{ownerBadge(c)}</td>
              <td className="px-3 py-3"><Actions c={c} {...a} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TeamContacts({ intent, onIntentDone, onNavigate }) {
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
  const [company, setCompany] = useState('all');
  const [peer, setPeer] = useState('all');
  const [sort, setSort] = useState('name');
  const [detail, setDetail] = useState(null);
  const [confirm, setConfirm] = useState(null); // { kind: 'delete' | 'stop', c }
  const [picker, setPicker] = useState(false);
  const [edit, setEdit] = useState({ open: false, contact: null });
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
    setErr('');
    try {
      const [m, s] = await Promise.all([fetchContacts(), fetchSharedContacts()]);
      setMine(m); setShared(s);
    } catch (e) { setErr(e.message || 'Could not load contacts.'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useSharedChanges(['contacts'], load); // reload live when peers change what they share with you
  useEffect(() => { if (intent === 'share') { setPicker(true); onIntentDone && onIntentDone(); } }, [intent, onIntentDone]);

  const rows = useMemo(() => [
    ...mine.filter((c) => c.visibility === 'peer').map((c) => ({ ...c, key: `m${c.id}`, kind: 'byMe', owner: 'You' })),
    ...shared.map((c) => ({ ...c, key: `s${c.id}`, kind: 'withMe', owner: c.owner || 'A peer' })),
  ], [mine, shared]);
  const counts = { all: rows.length, byMe: rows.filter((r) => r.kind === 'byMe').length, withMe: rows.filter((r) => r.kind === 'withMe').length };
  const companies = useMemo(() => [...new Set(rows.map((r) => r.company))].sort(), [rows]);
  const owners = useMemo(() => [...new Set(rows.filter((r) => r.kind === 'withMe').map((r) => r.owner))].sort(), [rows]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter((r) => (tab === 'all' || r.kind === tab) && (company === 'all' || r.company === company) && (peer === 'all' || r.owner === peer)
      && (!needle || `${r.name} ${r.email} ${r.company}`.toLowerCase().includes(needle)));
    out.sort((a, b) => sort === 'company' ? a.company.localeCompare(b.company) : sort === 'new' ? Date.parse(b.createdAt) - Date.parse(a.createdAt) : a.name.localeCompare(b.name));
    return out;
  }, [rows, tab, q, company, peer, sort]);

  async function run(id, fn, ok) {
    setBusyId(id); setErr(''); setNotice('');
    try { await fn(); setNotice(ok); await load(); } catch (e) { setErr(e.message || 'That did not work.'); } finally { setBusyId(null); }
  }
  function doConfirm() {
    const { kind, c } = confirm; setConfirm(null);
    return kind === 'delete'
      ? run(c.id, () => deleteContact(c.id), 'Contact deleted.')
      : run(c.id, () => updateContact(c.id, { visibility: 'personal' }), 'Moved back to Personal — peers can no longer see it.');
  }
  const doSave = (c) => run(c.id, () => duplicateContact(c.id), `Saved ${c.name} to your Personal contacts. It is your own copy — edit it freely.`);
  const doShare = (c) => run(c.id, () => updateContact(c.id, { visibility: 'peer' }), `Moved ${c.name} to Team. It left your Personal contacts.`);
  async function handleSave(form) {
    if (edit.contact) await updateContact(edit.contact.id, form); else await createContact(form);
    setNotice(edit.contact ? 'Contact updated.' : 'Contact added.');
    await load();
  }

  const a = { busy: false, onView: setDetail, onEdit: (c) => setEdit({ open: true, contact: c }), onDelete: (c) => setConfirm({ kind: 'delete', c }), onStop: (c) => setConfirm({ kind: 'stop', c }), onSave: doSave };
  const shareable = mine.filter((c) => c.visibility === 'personal');
  const doShareMany = async (contacts) => {
    setBusyId('many'); setErr(''); setNotice('');
    try {
      const n = await setContactsVisibility(contacts.map((c) => c.id), 'peer');
      setNotice(`Moved ${n} contact${n === 1 ? '' : 's'} to Team. ${n === 1 ? 'It' : 'They'} left your Personal contacts.`);
    } catch (e) { setErr(e.message || 'Could not move those contacts.'); }
    finally { setBusyId(null); await load(); }
  };
  const line = (label, value) => value ? <div><dt className="text-xs" style={muted}>{label}</dt><dd className="text-sm break-words" style={{ color: 'var(--text-primary)' }}>{value}</dd></div> : null;

  return (
    <div className="space-y-4">
      <PageHeader title="Team Contacts" subtitle="Professional contacts shared across your peer network.">
        <button onClick={() => setImportOpen(true)} className={`${ghostBtn} hidden sm:inline-flex`} style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}><Upload size={14} /> Import</button>
        <button onClick={() => setPicker(true)} className={primaryBtn} style={{ background: 'var(--brand)' }}><Share2 size={15} /> Move Contact to Team</button>
      </PageHeader>

      <PillTabs label="Contact categories" value={tab} onChange={setTab}
        tabs={[{ id: 'all', label: 'All', count: counts.all }, { id: 'byMe', label: 'Shared by Me', count: counts.byMe }, { id: 'withMe', label: 'Shared With Me', count: counts.withMe }]} />

      <SearchAndFilter search={q} onSearch={setQ} placeholder="Search by name, company, or email…" searchLabel="Search contacts">
        <button onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters} className={ghostBtn} style={{ borderColor: company !== 'all' || peer !== 'all' ? 'var(--brand)' : 'var(--border)', color: 'var(--text-secondary)' }}><SlidersHorizontal size={14} /> Filters</button>
        <FilterSelect icon={ArrowUpDown} value={sort} onChange={setSort} label="Sort contacts" options={SORTS} />
      </SearchAndFilter>
      {showFilters && (
        <div className="flex flex-wrap gap-2">
          <FilterSelect value={company} onChange={setCompany} label="Filter by company" options={[{ value: 'all', label: 'All companies' }, ...companies.map((c) => ({ value: c, label: c }))]} />
          <FilterSelect value={peer} onChange={setPeer} label="Filter by peer" options={[{ value: 'all', label: 'All peers' }, ...owners.map((o) => ({ value: o, label: o }))]} />
        </div>
      )}

      <Notice err={err} notice={notice} />

      {loading ? <LoadingSkeleton rows={5} label="Loading contacts" /> : list.length === 0 ? (
        rows.length === 0 ? (
          <EmptyState icon={ContactIcon} title="No shared contacts yet" action={<>
            <button onClick={() => setPicker(true)} className={primaryBtn} style={{ background: 'var(--brand)' }}><Share2 size={15} /> Move Contact to Team</button>
            <button onClick={() => onNavigate && onNavigate('peers', 'connect')} className={ghostBtn} style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}><UserPlus size={15} /> Connect Peer</button></>}>
            Move a contact to Team to share it with your peers, or connect with a peer to see theirs.
          </EmptyState>
        ) : <p className="text-sm text-center py-10" style={muted}>No contacts match your search or filters.</p>
      ) : isWide ? <ContactTable rows={list} {...a} /> : (
        <div className="space-y-3">{list.map((c) => <ContactCard key={c.key} c={c} {...a} busy={busyId === c.id} />)}</div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.name || ''}>
        {detail && (
          <dl className="grid grid-cols-2 gap-3">
            {line('Company', detail.company)}{line('Designation', detail.designation)}{line('Email', detail.email)}{line('Phone', detail.phone)}
            {line('LinkedIn', detail.linkedinUrl)}{line('Original owner', detail.kind === 'byMe' ? 'You' : detail.owner)}{line('Date shared', formatDate(detail.createdAt))}
            {detail.kind === 'byMe' && line('Notes (only you see these)', detail.notes)}
          </dl>
        )}
      </Modal>
      <ConfirmationDialog open={!!confirm} danger={confirm?.kind === 'delete'} confirmLabel={confirm?.kind === 'delete' ? 'Delete' : 'Move to Personal'}
        title={confirm?.kind === 'delete' ? 'Delete this contact?' : 'Move this contact back to Personal?'}
        message={confirm?.kind === 'delete' ? `Delete ${confirm.c.name}? This can't be undone. Peers who already saved a copy keep theirs.` : confirm ? `${confirm.c.name} becomes personal. Your peers lose access immediately; copies they already saved stay with them.` : ''}
        onConfirm={doConfirm} onCancel={() => setConfirm(null)} />
      <SharePicker open={picker} onClose={() => setPicker(false)} title="Move a contact to Team" items={shareable}
        getTitle={(c) => c.name} getSub={sub} onShare={doShare} onShareMany={doShareMany} noun="contacts" busyId={busyId} emptyText="You have no personal contacts to share."
        footer={<button onClick={() => { setPicker(false); setEdit({ open: true, contact: null }); }} className={ghostBtn} style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}><Plus size={14} /> Add a new contact</button>} />
      <ContactImportModal open={importOpen} onClose={() => setImportOpen(false)} existingEmails={mine.map((x) => x.email)} defaultVisibility="peer"
        onImported={async (n) => { setNotice(`Imported ${n} contact${n === 1 ? '' : 's'}.`); await load(); }} />
      <ContactModal open={edit.open} contact={edit.contact} defaultVisibility="peer" onClose={() => setEdit({ open: false, contact: null })} onSave={handleSave} />
    </div>
  );
}
