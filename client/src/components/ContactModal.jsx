import { useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import Modal from './ui/Modal';
import { parseContactsWithAI } from '../lib/api';

const EMPTY = {
  name: '', email: '', phone: '', company: '', designation: '', linkedinUrl: '', notes: '', visibility: 'personal',
};

const inputClass = 'w-full rounded-lg px-3 py-2 text-sm outline-none border focus:ring-2';
const inputStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' };

function Field({ label, htmlFor, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>{label}</label>
      {children}
    </div>
  );
}

// Add or edit one of MY contacts. The server (RLS + CHECK constraints) is the
// authority on what is valid; the HTML attributes here are just early feedback.
export default function ContactModal({ open, onClose, contact, onSave, defaultVisibility = 'personal' }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [paste, setPaste] = useState('');
  const [filling, setFilling] = useState(false);
  const [fillMsg, setFillMsg] = useState('');
  const [fillErr, setFillErr] = useState('');
  const isEdit = !!contact;

  useEffect(() => {
    if (open) {
      setForm(contact ? { ...EMPTY, ...contact } : { ...EMPTY, visibility: defaultVisibility });
      setErr('');
      setPaste(''); setFillMsg(''); setFillErr('');
    }
  }, [open, contact, defaultVisibility]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // Pasted text -> the form fields. Only what the AI actually found is filled; nothing typed is blanked.
  async function handleAutoFill() {
    setFilling(true); setFillErr(''); setFillMsg('');
    try {
      const { contacts } = await parseContactsWithAI(paste);
      if (contacts.length === 0) { setFillErr('The AI could not find a contact in that text. Try pasting more of it.'); return; }
      const c = contacts[0];
      setForm((f) => {
        const next = { ...f };
        for (const k of ['name', 'email', 'phone', 'company', 'designation', 'linkedinUrl']) if (c[k]) next[k] = c[k];
        return next;
      });
      setFillMsg(contacts.length > 1
        ? `Found ${contacts.length} people and filled in the first. Use Import to add them all. Check the fields, then add.`
        : 'Filled in from your text. Check the fields, then add the contact.');
    } catch (error) {
      setFillErr(/GROQ_API_KEY|Groq/i.test(error.message || '') ? 'The AI isn’t set up yet: the server needs a GROQ_API_KEY.' : error.message || 'Could not read that text.');
    } finally {
      setFilling(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      await onSave(form);
      onClose();
    } catch (error) {
      setErr(error.message || 'Could not save this contact.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit contact' : 'Add a contact'} maxWidth="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {!isEdit && (
          <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: 'var(--border)', background: 'color-mix(in oklab, var(--brand) 6%, var(--surface))' }}>
            <label htmlFor="ct-paste" className="text-xs font-medium flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
              <Sparkles size={13} style={{ color: 'var(--brand)' }} /> Paste a recruiter’s message or an email signature — the AI fills the form
            </label>
            <textarea id="ct-paste" value={paste} onChange={(e) => setPaste(e.target.value)} rows={3}
              placeholder="Paste anything here, then press Auto-fill…" className={`${inputClass} resize-y`} style={inputStyle} />
            <div className="flex items-center gap-3">
              <button type="button" onClick={handleAutoFill} disabled={!paste.trim() || filling}
                className="text-sm rounded-lg px-3 py-1.5 font-medium text-white flex items-center gap-1.5 disabled:opacity-50" style={{ background: 'var(--brand)' }}>
                {filling ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {filling ? 'Reading…' : 'Auto-fill'}
              </button>
              {fillMsg && <p role="status" className="text-xs" style={{ color: 'var(--text-secondary)' }}>{fillMsg}</p>}
              {fillErr && <p role="alert" className="text-xs" style={{ color: 'var(--status-rejected)' }}>{fillErr}</p>}
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name *" htmlFor="ct-name">
            <input id="ct-name" required autoFocus value={form.name} onChange={set('name')} className={inputClass} style={inputStyle} placeholder="Priya Sharma" />
          </Field>
          <Field label="Company *" htmlFor="ct-company">
            <input id="ct-company" required value={form.company} onChange={set('company')} className={inputClass} style={inputStyle} placeholder="Acme Inc." />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Email *" htmlFor="ct-email">
            <input id="ct-email" required type="email" value={form.email} onChange={set('email')} className={inputClass} style={inputStyle} placeholder="priya@acme.com" />
          </Field>
          <Field label="Phone number *" htmlFor="ct-phone">
            <input id="ct-phone" required type="tel" value={form.phone} onChange={set('phone')} className={inputClass} style={inputStyle} placeholder="+91 98765 43210" />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Designation" htmlFor="ct-designation">
            <input id="ct-designation" value={form.designation} onChange={set('designation')} className={inputClass} style={inputStyle} placeholder="Engineering Recruiter" />
          </Field>
          <Field label="LinkedIn URL" htmlFor="ct-linkedin">
            <input id="ct-linkedin" type="url" value={form.linkedinUrl} onChange={set('linkedinUrl')} className={inputClass} style={inputStyle} placeholder="https://linkedin.com/in/…" />
          </Field>
        </div>
        <Field label="Notes" htmlFor="ct-notes">
          <textarea id="ct-notes" value={form.notes} onChange={set('notes')} rows={3} className={inputClass} style={inputStyle} placeholder="How you met, what they said, follow-ups…" />
        </Field>
        <Field label="Workspace" htmlFor="ct-visibility">
          <select id="ct-visibility" value={form.visibility} onChange={set('visibility')} className={inputClass} style={inputStyle}>
            <option value="personal">Personal — only me</option>
            <option value="peer">Team — my accepted peers can see this contact</option>
          </select>
          <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
            Peers see name, email, phone, company, designation and LinkedIn — never your notes. They can save a copy, but can't change or delete yours.
          </p>
        </Field>

        {err && (
          <div role="alert" className="text-sm rounded-lg p-2.5"
            style={{ background: 'color-mix(in oklab, var(--status-rejected) 12%, var(--surface))', color: 'var(--status-rejected)' }}>
            {err}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="text-sm rounded-lg px-4 py-2 border" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className="text-sm rounded-lg px-4 py-2 font-medium text-white disabled:opacity-60 flex items-center gap-2" style={{ background: 'var(--brand)' }}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            {isEdit ? 'Save changes' : 'Add contact'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
