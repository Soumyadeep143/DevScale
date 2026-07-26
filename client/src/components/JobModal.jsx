import { useEffect, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import Modal from './ui/Modal';
import { STATUSES, SOURCES } from '../lib/statusConfig';
import { useJobs } from '../context/JobsContext';

const EMPTY = {
  company: '', role: '', location: '', experience: '', status: 'lead',
  dateApplied: '', interviewStatus: '', contact: '', source: 'Manual',
  postedTime: '', notes: '',
};

function inputClass() {
  return 'w-full rounded-lg px-3 py-2 text-sm outline-none border focus:ring-2';
}
function inputStyle() {
  return { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' };
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>{label}</label>
      {children}
    </div>
  );
}

export default function JobModal({ open, onClose, job }) {
  const { addJob, editJob, promoteLead, removeJob } = useJobs();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState('');
  const isEdit = !!job;
  const isLead = form.status === 'lead';

  useEffect(() => {
    if (open) {
      setForm(job ? { ...EMPTY, ...job } : { ...EMPTY, dateApplied: '' });
      setErr('');
    }
  }, [open, job]);

  function set(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.company.trim() || !form.role.trim()) {
      setErr('Company and role are required.');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      if (isEdit) {
        if (job.status === 'lead' && form.status !== 'lead') {
          // Promoting a lead is a cross-sheet move (see JobsContext) — it
          // only takes the new status, not the rest of the form's edits.
          await promoteLead(job.id, form.status);
        } else {
          await editJob(job.id, form);
        }
      } else {
        await addJob(form);
      }
      onClose();
    } catch (error) {
      setErr(error.message || 'Failed to save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete ${job.company} — ${job.role}? This can't be undone.`)) return;
    setDeleting(true);
    try {
      await removeJob(job.id);
      onClose();
    } catch (error) {
      setErr(error.message || 'Failed to delete.');
      setDeleting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit job' : 'Add a job'} maxWidth="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Company *">
            <input required autoFocus value={form.company} onChange={set('company')} className={inputClass()} style={inputStyle()} placeholder="Acme Inc." />
          </Field>
          <Field label="Role *">
            <input required value={form.role} onChange={set('role')} className={inputClass()} style={inputStyle()} placeholder="Frontend Engineer" />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Location">
            <input value={form.location} onChange={set('location')} className={inputClass()} style={inputStyle()} placeholder="Bengaluru, India" />
          </Field>
          <Field label="Experience level">
            <input value={form.experience} onChange={set('experience')} className={inputClass()} style={inputStyle()} placeholder="Entry-level" />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Status">
            <select value={form.status} onChange={set('status')} className={inputClass()} style={inputStyle()}>
              {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </Field>
          {!isLead && (
            <Field label="Date applied">
              <input type="date" value={form.dateApplied || ''} onChange={set('dateApplied')} className={inputClass()} style={inputStyle()} />
            </Field>
          )}
        </div>

        {!isLead && (
          <Field label="Interview status / notes on stage">
            <input value={form.interviewStatus} onChange={set('interviewStatus')} className={inputClass()} style={inputStyle()} placeholder="e.g. Round 2 scheduled Tue" />
          </Field>
        )}

        <Field label="Contact (job link or recruiter email)">
          <input value={form.contact} onChange={set('contact')} className={inputClass()} style={inputStyle()} placeholder="https://… or name@company.com" />
        </Field>

        <Field label="Source">
          <select value={form.source} onChange={set('source')} className={inputClass()} style={inputStyle()}>
            {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>

        {!isLead && (
          <Field label="Notes / comments">
            <textarea value={form.notes} onChange={set('notes')} rows={3} className={inputClass()} style={inputStyle()} placeholder="Anything worth remembering… the AI assistant can read this too" />
          </Field>
        )}
        {isLead && (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Notes and interview status show up once this moves out of Lead.
          </p>
        )}

        {err && (
          <div className="text-sm rounded-lg p-2.5" style={{ background: 'color-mix(in oklab, var(--status-rejected) 12%, var(--surface))', color: 'var(--status-rejected)' }}>
            {err}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          {isEdit ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="text-sm flex items-center gap-1.5 rounded-lg px-3 py-2 hover:opacity-75 disabled:opacity-50"
              style={{ color: 'var(--status-rejected)' }}
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Delete
            </button>
          ) : <span />}

          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="text-sm rounded-lg px-4 py-2 border" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="text-sm rounded-lg px-4 py-2 font-medium text-white disabled:opacity-60 flex items-center gap-2"
              style={{ background: 'var(--brand)' }}
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {isEdit ? 'Save changes' : 'Add job'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
