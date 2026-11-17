import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Loader2, Lock, Plus, Share2, StickyNote } from 'lucide-react';
import { createNote, fetchNotes, fetchSharedNotes, importSharedNote, setNoteVisibility, setNotesVisibility } from '../../lib/api';
import { noteVisibility, splitNote } from '../../lib/noteText';
import { timeAgo } from '../../lib/analytics';
import { useSharedChanges } from '../../lib/sharedUpdates';
import { useWindowedList } from '../../lib/useWindowedList';
import PageHeader, { ghostBtn, primaryBtn } from '../ui/PageHeader';
import { SearchField } from '../ui/SearchAndFilter';
import EmptyState from '../ui/EmptyState';
import LoadingSkeleton from '../ui/LoadingSkeleton';
import ConfirmationDialog from '../ui/ConfirmationDialog';
import InfiniteScrollSentinel from '../ui/InfiniteScrollSentinel';
import Modal from '../ui/Modal';
import SharePicker from './SharePicker';
import { Avatar, Badge, Notice, PillTabs, cardStyle, muted } from './parts';

// Notes moved to Team. A note lives in exactly one workspace: moving it to Team removes it from
// Personal, and moving it back removes it from Team. Peers read the whole note; a saved copy is
// independent of the original.
export default function TeamNotes({ intent, onIntentDone }) {
  const [mine, setMine] = useState([]);
  const [shared, setShared] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [picker, setPicker] = useState(false);
  const [detail, setDetail] = useState(null);
  const [confirmMove, setConfirmMove] = useState(null);
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState('');

  const load = useCallback(async () => {
    setErr('');
    // Each half loads on its own, so a problem with peers' notes never hides your own.
    const [m, s] = await Promise.allSettled([fetchNotes(), fetchSharedNotes()]);
    if (m.status === 'fulfilled') setMine(m.value);
    if (s.status === 'fulfilled') setShared(s.value);
    const failed = m.status === 'rejected' ? m.reason : s.status === 'rejected' ? s.reason : null;
    if (failed) {
      const text = String(failed.message || '');
      setErr(/shared_notes_with_me|schema cache|visibility/i.test(text)
        ? 'Team notes aren’t set up in the database yet. Run the migration 20261116001000_notes_sharing.sql in the Supabase SQL editor, then reload.'
        : text || 'Could not load notes.');
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useSharedChanges(['notes'], load); // a peer moved a note to Team (or back): update live
  useEffect(() => { if (intent === 'share') { setPicker(true); onIntentDone && onIntentDone(); } }, [intent, onIntentDone]);

  const rows = useMemo(() => [
    ...mine.filter((n) => noteVisibility(n) === 'peer').map((n) => ({ key: `m${n.id}`, id: n.id, kind: 'byMe', owner: 'You', content: n.content, updatedAt: n.updated_at || n.updatedAt })),
    ...shared.map((n) => ({ key: `s${n.id}`, id: n.id, kind: 'withMe', owner: n.owner || 'A peer', content: n.content, updatedAt: n.updatedAt, alreadySaved: n.alreadySaved })),
  ], [mine, shared]);
  const counts = { all: rows.length, byMe: rows.filter((r) => r.kind === 'byMe').length, withMe: rows.filter((r) => r.kind === 'withMe').length };
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => (tab === 'all' || r.kind === tab) && (!needle || `${r.content} ${r.owner}`.toLowerCase().includes(needle)))
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  }, [rows, tab, q]);
  const win = useWindowedList(shown, { pageSize: 30, resetKey: `${tab}|${q.trim().toLowerCase()}` });
  const personalNotes = useMemo(() => mine.filter((n) => noteVisibility(n) === 'personal'), [mine]);

  async function run(id, fn, ok) {
    setBusyId(id); setErr(''); setNotice('');
    try { await fn(); setNotice(ok); await load(); } catch (e) { setErr(e.message || 'That did not work.'); } finally { setBusyId(null); }
  }
  const addTeamNote = () => {
    const text = draft.trim();
    if (!text) return;
    run('new', () => createNote(text, 'peer'), 'Added to Team. Your peers can read it.').then(() => { setWriting(false); setDraft(''); });
  };
  const moveToTeam = (n) => run(n.id, () => setNoteVisibility(n.id, 'peer'), `Moved “${splitNote(n.content).title}” to Team. It left your Personal notes.`);
  const moveManyToTeam = async (notes) => {
    setBusyId('many'); setErr(''); setNotice('');
    try {
      const n = await setNotesVisibility(notes.map((x) => x.id), 'peer');
      setNotice(`Moved ${n} note${n === 1 ? '' : 's'} to Team. ${n === 1 ? 'It' : 'They'} left your Personal notes.`);
    } catch (e) { setErr(e.message || 'Could not move those notes.'); }
    finally { setBusyId(null); await load(); }
  };
  const moveToPersonal = (row) => run(row.id, () => setNoteVisibility(row.id, 'personal'), 'Moved back to Personal — peers can no longer see it.').then(() => setDetail(null));
  const saveToPersonal = (row) => run(row.id, () => importSharedNote(row.id), 'Saved to your Personal notes. It is your own copy — edit it freely.').then(() => setDetail(null));

  const Actions = ({ row }) => (row.kind === 'byMe' ? (
    <button onClick={() => setConfirmMove(row)} disabled={busyId === row.id} aria-label={`Move ${splitNote(row.content).title} to Personal`}
      className={`${ghostBtn} !min-h-[34px] !py-1 text-xs`} style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
      {busyId === row.id ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />} Move to Personal
    </button>
  ) : row.alreadySaved ? (
    <span className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--green)' }}><Check size={13} /> In your notes</span>
  ) : (
    <button onClick={() => saveToPersonal(row)} disabled={busyId === row.id} aria-label={`Save ${splitNote(row.content).title} to Personal`}
      className={`${ghostBtn} !min-h-[34px] !py-1 text-xs`} style={{ borderColor: 'var(--border)', color: 'var(--brand)' }}>
      {busyId === row.id ? <Loader2 size={13} className="animate-spin" /> : <Copy size={13} />} Save to Personal
    </button>
  ));

  return (
    <div className="space-y-4">
      <PageHeader title="Team Notes" subtitle="Notes you've moved to Team, and notes your peers share with you.">
        <button onClick={() => setPicker(true)} className={ghostBtn} style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}><Share2 size={15} /> Move a personal note here</button>
        <button onClick={() => setWriting(true)} className={primaryBtn} style={{ background: 'var(--brand)' }}><Plus size={15} /> New team note</button>
      </PageHeader>

      <PillTabs label="Note views" value={tab} onChange={setTab} tabs={[
        { id: 'all', label: 'All', count: counts.all }, { id: 'byMe', label: 'Shared by me', count: counts.byMe }, { id: 'withMe', label: 'Shared with me', count: counts.withMe },
      ]} />
      <SearchField value={q} onChange={setQ} placeholder="Search team notes…" label="Search team notes" />
      <Notice err={err} notice={notice} />

      {loading ? <LoadingSkeleton rows={4} label="Loading notes" /> : shown.length === 0 ? (
        <EmptyState icon={StickyNote} title={rows.length === 0 ? 'No team notes yet' : 'No notes match'}>
          {rows.length === 0 ? 'Write a new team note, or wait for a peer to share one with you.' : 'Try a different tab or search.'}
        </EmptyState>
      ) : (
        <>
          <ul className="space-y-2.5">
            {win.visible.map((r) => {
              const { title, preview } = splitNote(r.content);
              return (
                <li key={r.key} className="rounded-2xl border p-3.5 flex flex-wrap items-center gap-3" style={cardStyle}>
                  <button type="button" onClick={() => setDetail(r)} className="flex-1 min-w-[14rem] text-left flex items-start gap-3">
                    <Avatar name={r.owner} size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>{title}</span>
                        <Badge color={r.kind === 'byMe' ? 'var(--brand)' : 'var(--purple)'}>{r.kind === 'byMe' ? 'Shared by you' : `From ${r.owner}`}</Badge>
                      </span>
                      {preview && <span className="block text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{preview}</span>}
                      <span className="block text-[11px] mt-1" style={muted}>{timeAgo(r.updatedAt)}</span>
                    </span>
                  </button>
                  <Actions row={r} />
                </li>
              );
            })}
          </ul>
          <InfiniteScrollSentinel hasMore={win.hasMore} loading={false} onLoadMore={win.loadMore} loadedCount={win.visible.length} noun="notes" />
        </>
      )}

      <Modal open={writing} onClose={() => setWriting(false)} title="New team note" maxWidth="max-w-xl">
        <div className="space-y-3">
          <label htmlFor="team-note-text" className="text-xs font-medium" style={muted}>The first line is the title. Your accepted peers can read the whole note.</label>
          <textarea id="team-note-text" autoFocus rows={7} value={draft} onChange={(e) => setDraft(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none border focus:ring-2"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} placeholder="Interview prep for Acme…" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setWriting(false)} className={ghostBtn} style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>Cancel</button>
            <button type="button" onClick={addTeamNote} disabled={!draft.trim() || busyId === 'new'} className={`${primaryBtn} disabled:opacity-50`} style={{ background: 'var(--brand)' }}>
              {busyId === 'new' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add to Team
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? splitNote(detail.content).title : ''} maxWidth="max-w-2xl">
        {detail && (
          <div className="space-y-4">
            <p className="text-xs" style={muted}>{detail.kind === 'byMe' ? 'Shared by you' : `Shared by ${detail.owner}`} · updated {timeAgo(detail.updatedAt)}</p>
            <p className="text-sm whitespace-pre-wrap break-words" style={{ color: 'var(--text-primary)' }}>{detail.content}</p>
            <div className="flex justify-end"><Actions row={detail} /></div>
          </div>
        )}
      </Modal>

      <SharePicker open={picker} onClose={() => setPicker(false)} title="Move a note to Team" items={personalNotes}
        getTitle={(n) => splitNote(n.content).title} getSub={(n) => splitNote(n.content).preview.slice(0, 80)}
        onShare={moveToTeam} onShareMany={moveManyToTeam} noun="notes" busyId={busyId} emptyText="You have no personal notes to move. Create one under Personal → Notes."
        footer={<p className="text-xs" style={muted}>Peers will be able to read the whole note. It leaves your Personal notes until you move it back.</p>} />

      <ConfirmationDialog open={!!confirmMove} title="Move this note back to Personal?"
        message="Your peers will lose access immediately. Anyone who already saved a copy keeps theirs." confirmLabel="Move to Personal"
        onConfirm={() => { const r = confirmMove; setConfirmMove(null); moveToPersonal(r); }} onCancel={() => setConfirmMove(null)} />
    </div>
  );
}
