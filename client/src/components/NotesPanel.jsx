import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileText, Loader2, Plus, Save, StickyNote, Trash2, Users } from 'lucide-react';
import { fetchNotes, createNote, updateNote, deleteNote, setNoteVisibility } from '../lib/api';
import { noteVisibility, splitNote } from '../lib/noteText';
import { useSharedChanges } from '../lib/sharedUpdates';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useWindowedList } from '../lib/useWindowedList';
import InfiniteScrollSentinel from './ui/InfiniteScrollSentinel';
import PageHeader, { ghostBtn, primaryBtn } from './ui/PageHeader';
import { SearchField } from './ui/SearchAndFilter';
import EmptyState from './ui/EmptyState';
import LoadingSkeleton from './ui/LoadingSkeleton';
import ConfirmationDialog from './ui/ConfirmationDialog';
import { timeAgo } from '../lib/analytics';

function NoteCard({ note, active, onSelect }) {
  const { title, preview } = splitNote(note.content);
  return (
    <li>
      <button type="button" onClick={() => onSelect(note.id)} aria-current={active ? 'true' : undefined}
        className="w-full text-left rounded-xl border p-3 flex gap-3 transition-colors hover:bg-[var(--surface-2)]"
        style={{ background: active ? 'color-mix(in oklab, var(--brand) 12%, var(--surface))' : 'var(--surface)', borderColor: active ? 'var(--brand)' : 'var(--border)' }}>
        <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'color-mix(in oklab, var(--brand) 16%, var(--surface-2))', color: 'var(--brand)' }}><FileText size={16} /></span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>{title}</span>
            <span className="text-[11px] shrink-0" style={{ color: 'var(--text-muted)' }}>{timeAgo(note.updated_at || note.updatedAt || note.created_at)}</span>
          </span>
          {preview && <span className="block text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{preview}</span>}
        </span>
      </button>
    </li>
  );
}

export default function NotesPanel() {
  const wide = useMediaQuery('(min-width: 768px)');
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null); // note id | 'new' | null
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmMove, setConfirmMove] = useState(false);
  const [notice, setNotice] = useState('');

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setErr('');
    try {
      setNotes(await fetchNotes());
    } catch (error) {
      setErr(error.message || 'Could not load notes.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);
  // Another tab or device of yours changed a note (e.g. moved one to Team): keep this list current.
  useSharedChanges(['notes'], () => load(true));

  // A note moved to Team has left Personal (it lives under Team → Notes until moved back).
  const personal = useMemo(() => notes.filter((n) => noteVisibility(n) === 'personal'), [notes]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? personal.filter((n) => (n.content || '').toLowerCase().includes(q)) : personal;
  }, [personal, search]);

  const win = useWindowedList(filtered, { pageSize: 30, resetKey: search.trim().toLowerCase() });
  const selected = personal.find((n) => n.id === selectedId) || null;
  const dirty = selectedId === 'new' ? text.trim().length > 0 : selected ? text !== selected.content : false;

  function select(id) {
    setSelectedId(id);
    setText(personal.find((n) => n.id === id)?.content || '');
    setErr('');
  }
  function startNew() { setSelectedId('new'); setText(''); setErr(''); }

  async function save() {
    if (!text.trim() || saving) return;
    setSaving(true);
    setErr('');
    try {
      if (selectedId === 'new') {
        const note = await createNote(text.trim());
        setNotes((prev) => [note, ...prev]);
        setSelectedId(note.id);
        setText(note.content);
      } else {
        const updated = await updateNote(selectedId, text.trim());
        setNotes((prev) => prev.map((n) => (n.id === selectedId ? updated : n)));
        setText(updated.content);
      }
    } catch (error) {
      setErr(error.message || 'Could not save note.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    setErr('');
    try {
      await deleteNote(selectedId);
      setNotes((prev) => prev.filter((n) => n.id !== selectedId));
      setSelectedId(null);
      setText('');
      setConfirmDelete(false);
    } catch (error) {
      setErr(error.message || 'Could not delete note.');
      setConfirmDelete(false);
    } finally {
      setSaving(false);
    }
  }

  // Moves the open note to Team: peers can read all of it, and it leaves the Personal list.
  async function moveToTeam() {
    const note = selected;
    if (!note) return;
    setSaving(true);
    setErr('');
    try {
      const moved = await setNoteVisibility(note.id, 'peer');
      setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, ...moved } : n)));
      setSelectedId(null);
      setText('');
      setNotice(`Moved “${splitNote(note.content).title}” to Team. It now lives under Team → Notes; move it back from there any time.`);
    } catch (error) {
      setErr(error.message || 'Could not move this note.');
    } finally {
      setSaving(false);
      setConfirmMove(false);
    }
  }

  const list = (
    <div className="space-y-3 min-w-0">
      <SearchField value={search} onChange={setSearch} placeholder="Search notes…" label="Search notes" />
      {loading ? <LoadingSkeleton rows={4} label="Loading notes" /> : filtered.length === 0 ? (
        <p className="text-sm text-center py-10" style={{ color: 'var(--text-muted)' }}>{personal.length === 0 ? 'No notes yet.' : 'No notes match your search.'}</p>
      ) : (
        <>
          <ul className="space-y-2">{win.visible.map((n) => <NoteCard key={n.id} note={n} active={n.id === selectedId} onSelect={select} />)}</ul>
          <InfiniteScrollSentinel hasMore={win.hasMore} loading={false} onLoadMore={win.loadMore} loadedCount={win.visible.length} noun="notes" />
        </>
      )}
    </div>
  );

  const editor = selectedId ? (
    <div className="rounded-2xl border flex flex-col min-h-[22rem]" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
        {!wide && <button onClick={() => setSelectedId(null)} aria-label="Back to notes" className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-[var(--surface-2)]" style={{ color: 'var(--text-secondary)' }}><ArrowLeft size={17} /></button>}
        <span className="text-sm font-medium truncate flex-1" style={{ color: 'var(--text-primary)' }}>{selectedId === 'new' ? 'New note' : splitNote(text).title}</span>
        {selectedId !== 'new' && (
          <button onClick={() => setConfirmMove(true)} disabled={saving || dirty} aria-label="Move to Team" title={dirty ? 'Save your changes first' : 'Move to Team'}
            className="inline-flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 border hover:bg-[var(--surface-2)] disabled:opacity-50 min-h-[36px]" style={{ borderColor: 'var(--border)', color: 'var(--purple)' }}>
            <Users size={13} /> <span className="hidden sm:inline">Move to Team</span>
          </button>
        )}
        {selectedId !== 'new' && <button onClick={() => setConfirmDelete(true)} aria-label="Delete note" className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-[var(--surface-2)]" style={{ color: 'var(--red)' }}><Trash2 size={16} /></button>}
        <button onClick={save} disabled={!dirty || saving} className={primaryBtn} style={{ background: 'var(--brand)' }}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
        </button>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} autoFocus aria-label="Note content" placeholder="Start with a title on the first line, then write your note…"
        className="flex-1 w-full resize-none bg-transparent p-4 text-sm outline-none min-h-[18rem]" style={{ color: 'var(--text-primary)' }} />
    </div>
  ) : (
    <div className="rounded-2xl border hidden md:flex items-center justify-center min-h-[22rem]" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <EmptyState icon={StickyNote} title="Select a note" action={<button onClick={startNew} className={ghostBtn} style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>Create one</button>}>Pick a note from the list or start a new one.</EmptyState>
    </div>
  );

  return (
    <div className="space-y-4">
      {(wide || !selectedId) && (
        <PageHeader title="My Notes" subtitle="Keep track of interview prep, company research and more.">
          <button onClick={startNew} className={primaryBtn} style={{ background: 'var(--brand)' }}><Plus size={16} /> New Note</button>
        </PageHeader>
      )}
      {notice && <div role="status" className="text-sm rounded-lg px-4 py-2.5" style={{ background: 'color-mix(in oklab, var(--green) 12%, var(--surface))', color: 'var(--text-primary)' }}>{notice}</div>}
      {err && <div role="alert" className="text-sm rounded-lg px-4 py-2.5" style={{ background: 'color-mix(in oklab, var(--red) 12%, var(--surface))', color: 'var(--red)' }}>{err}</div>}

      {wide ? (
        <div className="grid grid-cols-[minmax(18rem,22rem)_1fr] gap-4 items-start">{list}{editor}</div>
      ) : selectedId ? editor : list}

      <ConfirmationDialog open={confirmMove} busy={saving} title="Move this note to Team?"
        message="Your accepted peers will be able to read the whole note. It will leave your Personal notes until you move it back. People who already saved a copy keep theirs."
        confirmLabel="Move to Team" onConfirm={moveToTeam} onCancel={() => setConfirmMove(false)} />
      <ConfirmationDialog open={confirmDelete} danger busy={saving} title="Delete this note?" message="This permanently deletes the note. It can’t be undone."
        confirmLabel="Delete" onConfirm={remove} onCancel={() => setConfirmDelete(false)} />
    </div>
  );
}
