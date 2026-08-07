import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Trash2, Sparkles } from 'lucide-react';
import Modal from './ui/Modal';
import { STATUSES, SOURCES } from '../lib/statusConfig';
import { useJobs } from '../context/JobsContext';
import { analyzeJob, ApiError } from '../lib/api';

const EMPTY = {
  company: '', role: '', location: '', experience: '', status: 'lead',
  dateApplied: '', interviewStatus: '', contact: '', source: 'Manual',
  postedTime: '', notes: '',
};

// Fields the Apps Script backend actually persists for a still-a-lead row
// (see the `update` action's non-promoting branch in apps-script/Code.gs —
// it writes company/role/location/experience directly to the leads sheet;
// contact/source aren't wired up there, a pre-existing backend gap outside
// this fix's scope). Promoting a lead re-reads the row straight from that
// sheet to build the new tracker row, so these have to land on the sheet
// *before* the promote call, or promoteLead would copy over stale values.
const LEAD_EDITABLE_FIELDS = ['company', 'role', 'location', 'experience'];

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

export default function JobModal({ open, onClose, job, hasPrev, hasNext, onPrev, onNext, onPromoted }) {
  const { addJob, editJob, promoteLead, removeJob } = useJobs();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [err, setErr] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [analyzeErr, setAnalyzeErr] = useState('');
  const [savingAnalysis, setSavingAnalysis] = useState(false);
  const isEdit = !!job;
  const isLead = form.status === 'lead';

  useEffect(() => {
    if (open) {
      setForm(job ? { ...EMPTY, ...job } : { ...EMPTY, dateApplied: '' });
      setErr('');
      setAnalysis(null);
      setAnalyzeErr('');
      setConfirmingDelete(false);
    }
  }, [open, job]);

  async function handleAnalyze() {
    setAnalyzing(true);
    setAnalyzeErr('');
    setAnalysis(null);
    try {
      const result = await analyzeJob({ company: form.company, role: form.role, status: form.status, notes: form.notes });
      setAnalysis(result);
    } catch (error) {
      const isConfig = error instanceof ApiError && /GROQ_API_KEY|Groq/i.test(error.message);
      setAnalyzeErr(isConfig ? error.message : (error.message || 'Could not analyze this job.'));
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSaveAnalysis() {
    if (!analysis || !job) return;
    const stamp = new Date().toLocaleDateString();
    const appended = `${form.notes ? form.notes.trim() + '\n\n' : ''}--- AI analysis (${stamp}) ---\n${analysis}`;
    setSavingAnalysis(true);
    try {
      await editJob(job.id, { notes: appended });
      setForm((f) => ({ ...f, notes: appended }));
      setAnalysis(null);
    } catch (error) {
      setAnalyzeErr(error.message || 'Could not save to notes.');
    } finally {
      setSavingAnalysis(false);
    }
  }

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
          // Promoting a lead is a cross-sheet move (see JobsContext) that
          // only takes the new status — any other field edits made in this
          // same save have to be persisted to the still-a-lead row first,
          // or they'd be silently lost when the row gets copied over.
          const fieldPatch = {};
          LEAD_EDITABLE_FIELDS.forEach((key) => {
            if (form[key] !== job[key]) fieldPatch[key] = form[key];
          });
          if (Object.keys(fieldPatch).length > 0) {
            await editJob(job.id, fieldPatch);
          }
          await promoteLead(job.id, form.status);
          // Give the caller a chance to jump to the next lead in the same
          // queue instead of closing — e.g. Board passes this when the
          // modal was opened from the Lead column, so marking one applied
          // moves straight on to the next one to process. Falls back to
          // closing like any other save when there's no queue to advance
          // through (opened without list context, or none left).
          if (onPromoted) onPromoted(job.id); else onClose();
        } else {
          await editJob(job.id, form);
          onClose();
        }
      } else {
        await addJob(form);
        onClose();
      }
    } catch (error) {
      setErr(error.message || 'Failed to save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await removeJob(job.id);
      onClose();
    } catch (error) {
      setErr(error.message || 'Failed to delete.');
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit job' : 'Add a job'} maxWidth="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {(hasPrev || hasNext) && (
          <div className="flex items-center justify-between -mt-1">
            <button
              type="button"
              onClick={onPrev}
              disabled={!hasPrev}
              className="text-xs flex items-center gap-1 rounded-lg px-2 py-1 hover:opacity-70 disabled:opacity-25"
              style={{ color: 'var(--text-secondary)' }}
              aria-label="Previous job"
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!hasNext}
              className="text-xs flex items-center gap-1 rounded-lg px-2 py-1 hover:opacity-70 disabled:opacity-25"
              style={{ color: 'var(--text-secondary)' }}
              aria-label="Next job"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        )}
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
            <textarea value={form.notes} onChange={set('notes')} rows={3} className={inputClass()} style={inputStyle()} placeholder="Anything worth remembering… paste a rejection email here and ask the AI to analyze it" />
          </Field>
        )}

        {!isLead && isEdit && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={analyzing}
              className="text-xs flex items-center gap-1.5 rounded-lg px-3 py-1.5 border hover:opacity-80 disabled:opacity-50"
              style={{ borderColor: 'var(--border)', color: 'var(--brand)' }}
            >
              {analyzing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              Analyze with AI
            </button>

            {analyzeErr && (
              <p className="text-xs" style={{ color: 'var(--status-rejected)' }}>{analyzeErr}</p>
            )}

            {analysis && (
              <div className="rounded-lg border p-3 text-xs space-y-2" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                <p className="whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{analysis}</p>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setAnalysis(null)} className="text-xs px-2 py-1 rounded hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveAnalysis}
                    disabled={savingAnalysis}
                    className="text-xs px-3 py-1.5 rounded-lg text-white flex items-center gap-1.5 disabled:opacity-60"
                    style={{ background: 'var(--brand)' }}
                  >
                    {savingAnalysis && <Loader2 size={12} className="animate-spin" />}
                    Save to notes
                  </button>
                </div>
              </div>
            )}
          </div>
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

        {confirmingDelete && job ? (
          <div
            className="rounded-lg p-3 text-sm space-y-2.5"
            style={{ background: 'color-mix(in oklab, var(--status-rejected) 10%, var(--surface))', border: '1px solid var(--status-rejected)' }}
          >
            <p style={{ color: 'var(--text-primary)' }}>
              Delete <strong>{job.company}</strong> — {job.role}? This can't be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
                className="text-sm px-3 py-1.5 rounded-lg border hover:opacity-80 disabled:opacity-50"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="text-sm px-3 py-1.5 rounded-lg text-white flex items-center gap-1.5 disabled:opacity-60"
                style={{ background: 'var(--status-rejected)' }}
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Delete job
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between pt-1">
            {isEdit ? (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="text-sm flex items-center gap-1.5 rounded-lg px-3 py-2 hover:opacity-75"
                style={{ color: 'var(--status-rejected)' }}
              >
                <Trash2 size={14} />
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
        )}
      </form>
    </Modal>
  );
}
