import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Trash2, Sparkles } from 'lucide-react';
import Modal from './ui/Modal';
import { STATUSES, SOURCES } from '../lib/statusConfig';
import { useJobs } from '../context/JobsContext';
import { analyzeJob, ApiError, parseJobsWithAI } from '../lib/api';
import { jobUrlError, leadError } from '../lib/leadRules';

const EMPTY = {
  company: '', role: '', location: '', experience: '', status: 'lead',
  dateApplied: '', interviewStatus: '', contact: '', source: 'Manual',
  postedTime: '', notes: '', description: '', jobUrl: '', visibility: 'personal',
};

// Fields persisted on a still-a-lead row. Promoting a lead (the promote_lead()
// function) copies the row as it is stored, so edits made in the same save have
// to land on the lead *before* the promote call, or the new job would be built
// from stale values.
const LEAD_EDITABLE_FIELDS = [
  'company', 'role', 'location', 'experience', 'contact', 'source',
  'description', 'jobUrl', 'visibility',
];

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
  // "Paste a posting" auto-fill (new jobs only): the AI reads free text and fills the form for review.
  const [paste, setPaste] = useState('');
  const [filling, setFilling] = useState(false);
  const [fillMsg, setFillMsg] = useState('');
  const [fillErr, setFillErr] = useState('');
  const isEdit = !!job;
  const isLead = form.status === 'lead';

  useEffect(() => {
    if (open) {
      setForm(job ? { ...EMPTY, ...job } : { ...EMPTY, dateApplied: '' });
      setErr('');
      setAnalysis(null);
      setAnalyzeErr('');
      setConfirmingDelete(false);
      setPaste('');
      setFillMsg('');
      setFillErr('');
    }
  }, [open, job]);

  async function handleAutoFill() {
    setFilling(true);
    setFillErr('');
    setFillMsg('');
    try {
      const { jobs, notices = [] } = await parseJobsWithAI(paste);
      if (jobs.length === 0) { setFillErr('The AI could not find a job in that text. Try pasting more of it.'); return; }
      const j = jobs[0];
      const known = SOURCES.find((x) => x.toLowerCase() === String(j.source || '').toLowerCase());
      // Only fields the AI actually found are filled; nothing already typed is blanked.
      setForm((f) => {
        const next = { ...f };
        for (const k of ['company', 'role', 'location', 'experience', 'jobUrl', 'contact', 'description', 'interviewStatus']) if (j[k]) next[k] = j[k];
        if (known) next.source = known;
        if (j.status) next.status = j.status;
        if (j.dateApplied) next.dateApplied = j.dateApplied;
        if (j.notes && !f.notes) next.notes = j.notes;
        return next;
      });
      setFillMsg([jobs.length > 1
        ? `Found ${jobs.length} jobs and filled in the first. Use Import to add them all. Check the fields, then add.`
        : 'Filled in from your text. Check the fields, then add the job.', ...notices].join(' '));
    } catch (error) {
      setFillErr(/GROQ_API_KEY|Groq/i.test(error.message || '')
        ? 'The AI isn’t set up yet: the server needs a GROQ_API_KEY.'
        : error.message || 'Could not read that text.');
    } finally {
      setFilling(false);
    }
  }

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
      // A new lead also needs a link or email: say everything that is missing in one message.
      setErr(!isEdit && form.status === 'lead' ? leadError(form) : 'Company and role are required.');
      return;
    }
    if (!isEdit) {
      // New leads must have a company, a role and a link or email before they are added.
      const problem = leadError(form) || jobUrlError(form);
      if (problem) { setErr(problem); return; }
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
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
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
        {!isEdit && (
          <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: 'var(--border)', background: 'color-mix(in oklab, var(--brand) 6%, var(--surface))' }}>
            <label htmlFor="job-paste" className="text-xs font-medium flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
              <Sparkles size={13} style={{ color: 'var(--brand)' }} /> Paste a job posting, an email, or just a link — the AI fills the form
            </label>
            <textarea id="job-paste" value={paste} onChange={(e) => setPaste(e.target.value)} rows={3}
              placeholder="Paste anything here, then press Auto-fill…" className={`${inputClass()} resize-y`} style={inputStyle()} />
            <div className="flex items-center gap-3">
              <button type="button" onClick={handleAutoFill} disabled={!paste.trim() || filling}
                className="text-sm rounded-lg px-3 py-1.5 font-medium text-white flex items-center gap-1.5 disabled:opacity-50" style={{ background: 'var(--brand)' }}>
                {filling ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {filling ? 'Reading…' : 'Auto-fill'}
              </button>
              {fillMsg && <p role="status" className="text-xs" style={{ color: 'var(--text-secondary)' }}>{fillMsg}</p>}
              {fillErr && <p role="alert" className="text-xs" style={{ color: 'var(--red)' }}>{fillErr}</p>}
            </div>
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

        <Field label={!isEdit && isLead ? 'Contact (job link or recruiter email) *' : 'Contact (job link or recruiter email)'}>
          <input value={form.contact} onChange={set('contact')} className={inputClass()} style={inputStyle()} placeholder="https://… or name@company.com" />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Source">
            <select value={form.source} onChange={set('source')} className={inputClass()} style={inputStyle()}>
              {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Job URL">
            <input type="url" value={form.jobUrl || ''} onChange={set('jobUrl')} className={inputClass()} style={inputStyle()} placeholder="https://company.com/careers/123" />
          </Field>
        </div>

        <Field label="Description">
          <textarea value={form.description || ''} onChange={set('description')} rows={3} className={inputClass()} style={inputStyle()} placeholder="Paste the job description or the parts worth remembering" />
        </Field>

        {isLead && (
          <Field label="Visibility">
            <select value={form.visibility || 'personal'} onChange={set('visibility')} className={inputClass()} style={inputStyle()}>
              <option value="personal">Personal — only me</option>
              <option value="peer">Peer — my accepted peers can see this lead</option>
            </select>
            <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
              Peers only see the lead itself. Your application status is never shared, and you can switch back to Personal any time.
            </p>
          </Field>
        )}

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
          <div role="alert" className="text-sm rounded-lg p-2.5" style={{ background: 'color-mix(in oklab, var(--status-rejected) 12%, var(--surface))', color: 'var(--status-rejected)' }}>
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
