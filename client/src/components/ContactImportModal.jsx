import { useMemo, useState } from 'react';
import { Loader2, CheckCircle2, ClipboardPaste, AlertTriangle, Sparkles } from 'lucide-react';
import Modal from './ui/Modal';
import { parseContacts, contactsToTsv, MAX_IMPORT_ROWS } from '../lib/parseContacts';
import { bulkCreateContacts, parseContactsWithAI } from '../lib/api';

const inputStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' };

// Paste name / email / phone / company rows straight from a spreadsheet.
export default function ContactImportModal({ open, onClose, existingEmails = [], defaultVisibility = 'personal', onImported }) {
  const [text, setText] = useState('');
  const [visibility, setVisibility] = useState(defaultVisibility);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(null); // { imported, skipped }
  const [err, setErr] = useState('');
  const [reading, setReading] = useState(false);
  const [aiMsg, setAiMsg] = useState('');

  const result = useMemo(() => parseContacts(text, { existingEmails }), [text, existingEmails]);

  // Messy text (a recruiter message, a signature, a LinkedIn post) -> rows. The rows replace the text so the
  // normal preview, checks and duplicate detection run on them; nothing is saved until Import.
  async function handleReadWithAI() {
    if (!text.trim() || reading) return;
    setReading(true); setErr(''); setAiMsg('');
    try {
      const { contacts, truncated } = await parseContactsWithAI(text);
      if (contacts.length === 0) { setErr('The AI could not find a contact in that text. Try pasting more of it.'); return; }
      setText(contactsToTsv(contacts));
      setAiMsg(`Found ${contacts.length} contact${contacts.length === 1 ? '' : 's'}. Check them below, then import.${truncated ? ' The text was long, so some may be missing.' : ''}`);
    } catch (error) {
      setErr(/GROQ_API_KEY|Groq/i.test(error.message || '') ? 'The AI isn’t set up yet: the server needs a GROQ_API_KEY.' : error.message || 'Could not read that text.');
    } finally {
      setReading(false);
    }
  }

  async function handleImport() {
    if (result.rows.length === 0 || result.tooMany || importing) return;
    setImporting(true);
    setErr('');
    try {
      const imported = await bulkCreateContacts(result.rows, visibility);
      setDone({ imported, skipped: result.skipped.length });
      if (onImported) onImported(imported);
    } catch (error) {
      setErr(error.message || 'Import failed. Nothing was added.');
    } finally {
      setImporting(false);
    }
  }

  function handleClose() {
    setText('');
    setVisibility(defaultVisibility);
    setDone(null);
    setErr('');
    setAiMsg('');
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Import contacts" maxWidth="max-w-2xl">
      {done ? (
        <div className="text-center py-8">
          <CheckCircle2 size={36} style={{ color: 'var(--status-offer)' }} className="mx-auto mb-3" />
          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
            Imported {done.imported} contact{done.imported === 1 ? '' : 's'}
          </p>
          {done.skipped > 0 && (
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{done.skipped} row{done.skipped === 1 ? '' : 's'} skipped</p>
          )}
          <button onClick={handleClose} className="mt-4 text-sm rounded-lg px-4 py-2 text-white" style={{ background: 'var(--brand)' }}>Done</button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Copy rows from your spreadsheet (or a CSV) and paste them below. Columns in this order:
            {' '}<strong>Name, Email, Phone, Company</strong>, then optionally Designation and LinkedIn URL.
            If your first row has headers (Name, Email, Phone, Company…), the columns can be in any order.
            Or paste any messy text, such as a recruiter’s message or an email signature, and press <strong>Read with AI</strong>.
          </p>

          <textarea
            aria-label="Paste contacts"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            placeholder={'Paste rows here, e.g.:\nPriya Sharma\tpriya@acme.com\t+91 98765 43210\tAcme Inc.\tRecruiter'}
            className="w-full rounded-lg px-3 py-2.5 text-xs font-mono outline-none border focus:ring-2 scrollbar-thin"
            style={inputStyle}
          />

          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={handleReadWithAI} disabled={!text.trim() || reading}
              className="text-xs rounded-lg px-3 py-1.5 border font-medium disabled:opacity-50 flex items-center gap-1.5"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
              {reading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {reading ? 'Reading…' : 'Read with AI'}
            </button>
            {aiMsg && <span role="status" className="text-xs" style={{ color: 'var(--text-secondary)' }}>{aiMsg}</span>}
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="contact-import-visibility" className="text-xs font-medium shrink-0" style={{ color: 'var(--text-muted)' }}>Visibility:</label>
            <select id="contact-import-visibility" value={visibility} onChange={(e) => setVisibility(e.target.value)}
              className="text-xs rounded-lg px-2 py-1.5 border outline-none flex-1" style={inputStyle}>
              <option value="personal">Personal — only me</option>
              <option value="peer">Peer — my accepted peers can see these contacts (not your notes)</option>
            </select>
          </div>

          {text.trim() && (
            <div className="rounded-lg border p-3 space-y-2.5" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: 'var(--text-secondary)' }}>
                  <strong>{result.rows.length}</strong> ready{result.skipped.length > 0 ? `, ${result.skipped.length} skipped` : ''}
                  {result.format === 'header' ? ' · headers detected' : ''}
                </span>
              </div>

              {result.tooMany && (
                <p role="alert" className="text-xs flex items-center gap-1.5" style={{ color: 'var(--status-rejected)' }}>
                  <AlertTriangle size={13} /> Too many rows — import at most {MAX_IMPORT_ROWS} at a time.
                </p>
              )}

              {result.rows.length > 0 && (
                <div className="max-h-36 overflow-y-auto scrollbar-thin space-y-1.5">
                  {result.rows.slice(0, 8).map((c) => (
                    <div key={c.email} className="flex items-center gap-2 text-xs">
                      <span className="truncate flex-1" style={{ color: 'var(--text-primary)' }}>{c.name}</span>
                      <span className="truncate flex-1" style={{ color: 'var(--text-secondary)' }}>{c.email}</span>
                      <span className="truncate flex-1" style={{ color: 'var(--text-muted)' }}>{c.company}</span>
                    </div>
                  ))}
                  {result.rows.length > 8 && <p className="text-xs pt-1" style={{ color: 'var(--text-muted)' }}>…and {result.rows.length - 8} more</p>}
                </div>
              )}

              {result.skipped.length > 0 && (
                <div className="pt-2 border-t space-y-1" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Skipped</p>
                  <ul className="max-h-28 overflow-y-auto scrollbar-thin space-y-1">
                    {result.skipped.slice(0, 20).map((s) => (
                      <li key={s.line} className="text-xs" style={{ color: 'var(--status-rejected)' }}>Line {s.line}: {s.reason}</li>
                    ))}
                  </ul>
                  {result.skipped.length > 20 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>…and {result.skipped.length - 20} more</p>}
                </div>
              )}
            </div>
          )}

          {err && (
            <div role="alert" className="text-sm rounded-lg p-2.5"
              style={{ background: 'color-mix(in oklab, var(--status-rejected) 12%, var(--surface))', color: 'var(--status-rejected)' }}>{err}</div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={handleClose} className="text-sm rounded-lg px-4 py-2 border" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>Cancel</button>
            <button onClick={handleImport} disabled={result.rows.length === 0 || result.tooMany || importing}
              className="text-sm rounded-lg px-4 py-2 font-medium text-white disabled:opacity-50 flex items-center gap-2" style={{ background: 'var(--brand)' }}>
              {importing ? <Loader2 size={14} className="animate-spin" /> : <ClipboardPaste size={14} />}
              Import {result.rows.length || ''} contact{result.rows.length === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
