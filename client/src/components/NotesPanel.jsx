import { useEffect, useState } from 'react';
import { Loader2, Plus, Pencil, Trash2, Check, X, StickyNote } from 'lucide-react';
import { fetchNotes, createNote, updateNote, deleteNote } from '../lib/api';

function timeAgo(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export default function NotesPanel() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [busyId, setBusyId] = useState(null);

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const data = await fetchNotes();
      setNotes(data);
    } catch (error) {
      setErr(error.message || 'Could not load notes.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleAdd() {
    if (!draft.trim() || saving) return;
    setSaving(true);
    setErr('');
    try {
      const note = await createNote(draft.trim());
      setNotes((prev) => [note, ...prev]);
      setDraft('');
    } catch (error) {
      setErr(error.message || 'Could not save note.');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(note) {
    setEditingId(note.id);
    setEditText(note.content || '');
  }

  async function saveEdit(id) {
    setBusyId(id);
    try {
      const updated = await updateNote(id, editText.trim());
      setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
      setEditingId(null);
    } catch (error) {
      setErr(error.message || 'Could not save changes.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this note? This can\'t be undone.')) return;
    setBusyId(id);
    try {
      await deleteNote(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (error) {
      setErr(error.message || 'Could not delete note.');
    } finally {
      setBusyId(null);
    }
  }

  const isConfigError = err && /SUPABASE_URL|SUPABASE_SERVICE_KEY|Not set up/i.test(err);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h2 className="text-base font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <StickyNote size={18} style={{ color: 'var(--brand)' }} /> Notes
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          General job-search strategy notes — not tied to a single job. Stored in Supabase, and the AI assistant
          reads these too when you ask things like "where am I failing" or "what should my strategy be".
        </p>
      </div>

      <div className="rounded-xl border p-3" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="e.g. Tailoring my resume per-role is getting better responses than mass-applying. Focus more on referrals this week."
          className="w-full rounded-lg px-3 py-2.5 text-sm outline-none border focus:ring-2 scrollbar-thin"
          style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={handleAdd}
            disabled={!draft.trim() || saving}
            className="text-sm rounded-lg px-4 py-2 font-medium text-white disabled:opacity-50 flex items-center gap-2"
            style={{ background: 'var(--brand)' }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add note
          </button>
        </div>
      </div>

      {err && (
        <div className="text-sm rounded-lg p-3" style={{ background: 'color-mix(in oklab, var(--status-rejected) 12%, var(--surface))', color: 'var(--status-rejected)' }}>
          {isConfigError
            ? "Notes aren't set up yet — add SUPABASE_URL and SUPABASE_SERVICE_KEY as Script Properties in Apps Script. See SETUP.md."
            : err}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16" style={{ color: 'var(--text-muted)' }}>
          <Loader2 size={18} className="animate-spin mr-2" /> Loading notes…
        </div>
      ) : notes.length === 0 && !err ? (
        <p className="text-sm text-center py-10" style={{ color: 'var(--text-muted)' }}>No notes yet — jot down a strategy thought above.</p>
      ) : (
        <div className="space-y-2.5">
          {notes.map((note) => (
            <div key={note.id} className="rounded-xl border p-3" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}>
              {editingId === note.id ? (
                <div className="space-y-2">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={3}
                    autoFocus
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none border focus:ring-2 scrollbar-thin"
                    style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditingId(null)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:opacity-70" style={{ color: 'var(--text-muted)' }} aria-label="Cancel">
                      <X size={14} />
                    </button>
                    <button
                      onClick={() => saveEdit(note.id)}
                      disabled={busyId === note.id}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-white disabled:opacity-50"
                      style={{ background: 'var(--brand)' }}
                      aria-label="Save"
                    >
                      {busyId === note.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{note.content}</p>
                  <div className="flex items-center justify-between mt-2.5 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{timeAgo(note.updated_at || note.created_at)}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => startEdit(note)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:opacity-70" style={{ color: 'var(--text-secondary)' }} aria-label="Edit">
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(note.id)}
                        disabled={busyId === note.id}
                        className="w-7 h-7 rounded-lg flex items-center justify-center hover:opacity-70 disabled:opacity-50"
                        style={{ color: 'var(--status-rejected)' }}
                        aria-label="Delete"
                      >
                        {busyId === note.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
