import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, Plus, Pencil, Trash2, Mail, Phone, ExternalLink, Lock, Users, Check, Copy, Contact, Upload } from 'lucide-react';
import {
  fetchContacts, createContact, updateContact, deleteContact, fetchSharedContacts, duplicateContact,
} from '../lib/api';
import ContactModal from './ContactModal';
import ContactImportModal from './ContactImportModal';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useWindowedList } from '../lib/useWindowedList';
import InfiniteScrollSentinel from './ui/InfiniteScrollSentinel';
import CompanyAvatar from './ui/CompanyAvatar';
import { useSharedChanges } from '../lib/sharedUpdates';

const card = { background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' };
const muted = { color: 'var(--text-muted)' };
const iconBtn = 'w-9 h-9 rounded-lg flex items-center justify-center hover:opacity-70 disabled:opacity-50';
const linkStyle = { color: 'var(--text-secondary)' };

function matches(c, q) {
  if (!q) return true;
  return `${c.name} ${c.email} ${c.company}`.toLowerCase().includes(q);
}

function ContactCard({ contact, owner, children, showVisibility = true }) {
  return (
    <div className="rounded-xl border p-3.5 space-y-2" style={card}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{contact.name}</p>
          <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
            {[contact.designation, contact.company].filter(Boolean).join(' · ')}
          </p>
        </div>
        {!owner && showVisibility && (
          <span className="shrink-0 text-[11px] rounded-md px-1.5 py-0.5 flex items-center gap-1"
            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            {contact.visibility === 'peer' ? <><Users size={11} /> Peer</> : <><Lock size={11} /> Personal</>}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 text-xs">
        <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 truncate hover:underline" style={linkStyle}><Mail size={12} /> {contact.email}</a>
        <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 truncate hover:underline" style={linkStyle}><Phone size={12} /> {contact.phone}</a>
        {contact.linkedinUrl && (
          <a href={contact.linkedinUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 truncate hover:underline" style={linkStyle}>
            <ExternalLink size={12} /> LinkedIn
          </a>
        )}
      </div>
      {contact.notes && <p className="text-xs whitespace-pre-wrap line-clamp-3" style={{ color: 'var(--text-secondary)' }}>{contact.notes}</p>}
      <div className="flex items-center justify-between gap-2 pt-2 border-t min-h-[2.75rem]" style={{ borderColor: 'var(--border)' }}>
        <span className="text-xs" style={muted}>{owner ? `Shared by ${owner}` : ''}</span>
        <div className="flex items-center gap-1">{children}</div>
      </div>
    </div>
  );
}

function MoveToTeamButton({ contact, busy, onMove }) {
  return (
    <button onClick={() => onMove(contact)} disabled={busy} aria-label={`Move ${contact.name} to Team`}
      className="inline-flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 border hover:bg-[var(--surface-2)] disabled:opacity-50 min-h-[32px] whitespace-nowrap"
      style={{ borderColor: 'var(--border)', color: 'var(--purple)' }}>
      {busy ? <Loader2 size={12} className="animate-spin" /> : <Users size={12} />} Move to Team
    </button>
  );
}

const VIEWS_BY_MODE = {
  personal: [{ id: 'mine', label: 'My contacts' }],
  team: [{ id: 'byMe', label: 'Shared by me' }, { id: 'shared', label: 'Shared with me' }],
};

export default function ContactsPanel({ mode = 'personal' }) {
  const views = VIEWS_BY_MODE[mode] || VIEWS_BY_MODE.personal;
  const [view, setView] = useState(views[0].id); // mine | byMe | shared
  const [mine, setMine] = useState([]);
  const [shared, setShared] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name');
  const wide = useMediaQuery('(min-width: 768px)');
  const [busyId, setBusyId] = useState(null);
  const [modal, setModal] = useState({ open: false, contact: null });
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
    setErr('');
    try {
      const [m, s] = await Promise.all([fetchContacts(), fetchSharedContacts()]);
      setMine(m);
      setShared(s);
    } catch (error) {
      setErr(error.message || 'Could not load contacts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useSharedChanges(['contacts'], load); // reload live when peers change what they share with you

  const existingEmails = useMemo(() => mine.map((x) => x.email), [mine]);

  const q = search.trim().toLowerCase();
  const sorter = useMemo(() => {
    const by = (f) => (a, b) => String(f(a) || '').localeCompare(String(f(b) || ''), undefined, { sensitivity: 'base' });
    return { name: by((c) => c.name), company: by((c) => c.company), email: by((c) => c.email), recent: (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') }[sort];
  }, [sort]);
  // In Personal, a contact moved to Team has left (it lives under Team → Contacts until moved back).
  const personalMine = useMemo(() => (mode === 'team' ? mine : mine.filter((c) => c.visibility !== 'peer')), [mine, mode]);
  const myList = useMemo(
    () => personalMine.filter((c) => matches(c, q)).sort(sorter),
    [personalMine, q, sorter],
  );
  const byMeList = useMemo(() => mine.filter((x) => x.visibility === 'peer' && matches(x, q)).sort(sorter), [mine, q, sorter]);
  const sharedList = useMemo(() => shared.filter((c) => matches(c, q)).sort(sorter), [shared, q, sorter]);

  async function handleSave(form) {
    const wasEdit = !!modal.contact;
    if (wasEdit) await updateContact(modal.contact.id, form);
    else await createContact(form);
    setNotice(wasEdit ? 'Contact updated.' : 'Contact added.');
    await load();
  }

  async function handleDelete(contact) {
    if (!confirm(`Delete ${contact.name}? This can't be undone. Peers who already saved a copy keep theirs.`)) return;
    setBusyId(contact.id);
    setErr('');
    setNotice('');
    try {
      await deleteContact(contact.id);
      setNotice('Contact deleted.');
      await load();
    } catch (error) {
      setErr(error.message || 'Could not delete this contact.');
    } finally {
      setBusyId(null);
    }
  }

  // Moves a personal contact to Team: peers can see it (never its notes), and it leaves Personal.
  async function moveToTeam(contact) {
    setBusyId(contact.id);
    setErr('');
    setNotice('');
    try {
      await updateContact(contact.id, { visibility: 'peer' });
      setNotice(`Moved ${contact.name} to Team. It now lives under Team → Contacts; move it back from there any time.`);
      await load();
    } catch (error) {
      setErr(error.message || 'Could not move this contact.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleSaveCopy(contact) {
    setBusyId(contact.id);
    setErr('');
    setNotice('');
    try {
      await duplicateContact(contact.id);
      setNotice(`Saved ${contact.name} to your contacts. It is your own copy — edit it freely.`);
      await load();
    } catch (error) {
      setErr(error.message || 'Could not save this contact.');
    } finally {
      setBusyId(null);
    }
  }

  const empty = view === 'mine'
    ? (mine.length === 0 ? 'No contacts yet. Add recruiters, referrers and hiring managers you talk to.' : 'No contacts match your filters.')
    : view === 'byMe'
      ? 'You are not sharing any contacts. Mark a contact as Peer to share it.'
      : (shared.length === 0 ? 'Nothing shared with you yet. Connect with a peer on the Peers tab.' : 'No shared contacts match your search.');
  const list = view === 'mine' ? myList : view === 'byMe' ? byMeList : sharedList;
  const win = useWindowedList(list, { pageSize: 30, resetKey: `${view}|${q}|${sort}` });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Contact size={20} style={{ color: 'var(--brand)' }} /> {mode === 'team' ? 'Team contacts' : 'My Contacts'}
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {mode === 'team' ? 'Contacts shared with your accepted peers. Save a copy to make it your own.' : 'Manage your professional contacts and recruiters. Mark one as Peer to share it with your team.'}
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <button onClick={() => setImportOpen(true)}
            className="text-sm rounded-lg px-3 py-2 border flex items-center gap-1.5 hover:opacity-80" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            <Upload size={14} /> Import
          </button>
          <button onClick={() => setModal({ open: true, contact: null })}
            className="text-sm rounded-lg px-3 py-2 font-medium text-white flex items-center gap-1.5 hover:opacity-90" style={{ background: 'var(--brand)' }}>
            <Plus size={15} /> Add contact
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {views.length > 1 && <div role="tablist" aria-label="Contact views" className="flex gap-1 rounded-lg p-1 border" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
          {views.map(({ id, label }) => { const n = id === 'mine' ? personalMine.length : id === 'byMe' ? mine.filter((x) => x.visibility === 'peer').length : shared.length; return (
            <button key={id} role="tab" aria-selected={view === id} onClick={() => setView(id)} className="text-sm rounded-md px-3 py-1.5 font-medium"
              style={{ background: view === id ? 'var(--brand)' : 'transparent', color: view === id ? '#fff' : 'var(--text-secondary)' }}>
              {label} <span className="opacity-75">· {n}</span>
            </button>
          ); })}
        </div>}
        <div className="relative flex-1 min-w-[12rem]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={muted} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, company…" aria-label="Search contacts"
            className="w-full rounded-lg pl-8 pr-3 py-1.5 text-sm outline-none border focus:ring-2"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort contacts"
          className="text-sm rounded-lg px-2 py-1.5 border outline-none min-h-[40px]"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
          <option value="name">Sort: Name</option>
          <option value="company">Sort: Company</option>
          <option value="email">Sort: Email</option>
          <option value="recent">Sort: Recently added</option>
        </select>
      </div>

      {err && (
        <div role="alert" className="text-sm rounded-lg p-3"
          style={{ background: 'color-mix(in oklab, var(--red) 12%, var(--surface))', color: 'var(--red)' }}>{err}</div>
      )}
      {notice && (
        <div role="status" className="text-sm rounded-lg p-3"
          style={{ background: 'color-mix(in oklab, var(--status-offer) 12%, var(--surface))', color: 'var(--text-primary)' }}>{notice}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12" style={muted}><Loader2 size={18} className="animate-spin mr-2" /> Loading contacts…</div>
      ) : list.length === 0 ? (
        <p className="text-sm text-center py-10" style={muted}>{empty}</p>
      ) : wide && view !== 'shared' ? (
        <div className="rounded-2xl border overflow-hidden" style={card}>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm" style={{ minWidth: 900 }}>
              <thead>
                <tr className="border-b text-left" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                  {['Name', 'Company', 'Designation', 'Email', 'Phone', 'Actions'].map((h) => <th key={h} className="px-3 py-3 font-medium whitespace-nowrap">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {win.visible.map((c) => (
                  <tr key={c.id} className="border-b last:border-b-0 hover:bg-[var(--surface-2)] transition-colors" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-3 py-2.5 whitespace-nowrap"><span className="flex items-center gap-2.5"><CompanyAvatar name={c.name} size={28} /><span className="font-medium" style={{ color: 'var(--text-primary)' }}>{c.name}</span></span></td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--text-secondary)' }}>{c.company}</td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--text-secondary)' }}>{c.designation || '—'}</td>
                    <td className="px-3 py-2.5"><a href={`mailto:${c.email}`} className="hover:underline" style={linkStyle}>{c.email}</a></td>
                    <td className="px-3 py-2.5 whitespace-nowrap"><a href={`tel:${c.phone}`} className="hover:underline" style={linkStyle}>{c.phone}</a></td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {c.linkedinUrl && <a href={c.linkedinUrl} target="_blank" rel="noreferrer" aria-label={`LinkedIn for ${c.name}`} className={`${iconBtn} inline-flex`} style={{ color: 'var(--text-muted)' }}><ExternalLink size={14} /></a>}
                      {mode === 'personal' && <MoveToTeamButton contact={c} busy={busyId === c.id} onMove={moveToTeam} />}
                      <button onClick={() => setModal({ open: true, contact: c })} className={iconBtn} style={{ color: 'var(--text-secondary)' }} aria-label={`Edit ${c.name}`}><Pencil size={14} /></button>
                      <button onClick={() => handleDelete(c)} disabled={busyId === c.id} className={iconBtn} style={{ color: 'var(--red)' }} aria-label={`Delete ${c.name}`}>
                        {busyId === c.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {view !== 'shared' ? win.visible.map((c) => (
            <ContactCard key={c.id} contact={c} showVisibility={mode !== 'personal'}>
              {mode === 'personal' && <MoveToTeamButton contact={c} busy={busyId === c.id} onMove={moveToTeam} />}
              <button onClick={() => setModal({ open: true, contact: c })} className={iconBtn} style={{ color: 'var(--text-secondary)' }} aria-label={`Edit ${c.name}`}>
                <Pencil size={14} />
              </button>
              <button onClick={() => handleDelete(c)} disabled={busyId === c.id} className={iconBtn} style={{ color: 'var(--red)' }} aria-label={`Delete ${c.name}`}>
                {busyId === c.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </ContactCard>
          )) : win.visible.map((c) => (
            <ContactCard key={c.id} contact={c} owner={c.owner || 'a peer'}>
              {c.alreadySaved ? (
                <span className="text-xs flex items-center gap-1" style={{ color: 'var(--status-offer)' }}><Check size={13} /> In your contacts</span>
              ) : (
                <button onClick={() => handleSaveCopy(c)} disabled={busyId === c.id}
                  className="text-sm rounded-lg px-3 py-1.5 font-medium border flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50"
                  style={{ borderColor: 'var(--border)', color: 'var(--brand)' }}>
                  {busyId === c.id ? <Loader2 size={13} className="animate-spin" /> : <Copy size={14} />} Save to my contacts
                </button>
              )}
            </ContactCard>
          ))}
        </div>
      )}

      {!loading && list.length > 0 && (
        <InfiniteScrollSentinel hasMore={win.hasMore} loading={false} onLoadMore={win.loadMore} loadedCount={win.visible.length} noun="contacts" />
      )}

      <ContactImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        existingEmails={existingEmails}
        defaultVisibility={mode === 'team' ? 'peer' : 'personal'}
        onImported={async (n) => { setNotice(`Imported ${n} contact${n === 1 ? '' : 's'}.`); await load(); }}
      />
      <ContactModal open={modal.open} contact={modal.contact} defaultVisibility={mode === 'team' ? 'peer' : 'personal'} onClose={() => setModal({ open: false, contact: null })} onSave={handleSave} />
    </div>
  );
}
