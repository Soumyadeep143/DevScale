import { useMemo, useState } from 'react';
import { Loader2, CheckCircle2, ClipboardCopy, ClipboardPaste, Sparkles, X } from 'lucide-react';
import Modal from './ui/Modal';
import StatusBadge from './StatusBadge';
import { parsePastedJobs } from '../lib/parseImport';
import { useJobs } from '../context/JobsContext';
import { parseJobsWithAI } from '../lib/api';
import { looksLikeRows, recordsToTsv } from '../lib/aiJobs';
import { isLead, missingLeadFields } from '../lib/leadRules';

export default function ImportModal({ open, onClose }) {
  const { importJobs } = useJobs();
  const [text, setText] = useState('');
  const [format, setFormat] = useState('auto');
  const [visibility, setVisibility] = useState('personal');
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(null);
  const [err, setErr] = useState('');
  // AI mode: free text (a posting, an email, a snippet) is read by the AI, shown for review, then imported.
  const [aiRows, setAiRows] = useState(null);
  const [aiRecords, setAiRecords] = useState([]); // the same rows as 12-column records, for "Copy as TSV"
  const [copied, setCopied] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState('');

  const aiMode = format === 'ai';
  const rowsLike = useMemo(() => looksLikeRows(text), [text]);
  const parsed = useMemo(() => parsePastedJobs(text, aiMode ? 'auto' : format), [text, format, aiMode]);
  // What will actually be imported: the reviewed AI rows, or the exact spreadsheet parse.
  const result = aiMode ? { jobs: aiRows || [], format: 'ai', skipped: 0 } : parsed;
  // Leads need a company, a role and a link or email. Rows that lack them are flagged and never imported.
  const checked = result.jobs.map((job, i) => ({ job, i, missing: isLead(job) ? missingLeadFields(job) : [] }));
  const validJobs = checked.filter((c) => c.missing.length === 0).map((c) => c.job);
  const invalidCount = checked.length - validJobs.length;
  const hasLeadRows = validJobs.some((j) => j.status === 'lead');
  const suggestAi = !aiMode && text.trim() && !rowsLike;

  async function runAi() {
    setAiBusy(true);
    setErr('');
    setAiNote('');
    try {
      const { jobs, records = [], truncated, notices = [] } = await parseJobsWithAI(text);
      setFormat('ai');
      setAiRows(jobs);
      setAiRecords(records);
      if (jobs.length === 0) setErr('The AI could not find a job in that text. Try pasting more of it.');
      else setAiNote([truncated && 'That was a lot of text, so only the first part was read. Import these, then paste the rest.', ...notices].filter(Boolean).join(' '));
    } catch (error) {
      setErr(/GROQ_API_KEY|Groq/i.test(error.message || '')
        ? 'The AI isn’t set up yet: the server needs a GROQ_API_KEY.'
        : error.message || 'Could not read that text.');
    } finally {
      setAiBusy(false);
    }
  }

  const removeAiRow = (i) => { setAiRows((rows) => rows.filter((_, k) => k !== i)); setAiRecords((rs) => rs.filter((_, k) => k !== i)); };

  // The reviewed rows as tab-separated text in the fixed 12 columns, to paste into Google Sheets.
  async function copyTsv() {
    try { await navigator.clipboard.writeText(recordsToTsv(aiRecords)); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { setErr('Could not copy. Your browser blocked the clipboard.'); }
  }

  async function handleImport() {
    setImporting(true);
    setErr('');
    try {
      // Visibility only applies to lead rows; tracked applications are always private.
      const rows = validJobs.map((j) => (j.status === 'lead' ? { ...j, visibility } : j));
      const count = await importJobs(rows);
      setDone(count);
    } catch (error) {
      setErr(error.message || 'Import failed.');
    } finally {
      setImporting(false);
    }
  }

  function handleClose() {
    setText('');
    setFormat('auto');
    setAiRows(null);
    setAiRecords([]);
    setAiNote('');
    setVisibility('personal');
    setDone(null);
    setErr('');
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Import jobs" maxWidth="max-w-2xl">
      {done !== null ? (
        <div className="text-center py-8">
          <CheckCircle2 size={36} style={{ color: 'var(--status-offer)' }} className="mx-auto mb-3" />
          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>Imported {done} job{done === 1 ? '' : 's'}</p>
          <button onClick={handleClose} className="mt-4 text-sm rounded-lg px-4 py-2 text-white" style={{ background: 'var(--brand)' }}>
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Paste spreadsheet rows, <strong>or any text</strong> (a job posting, an email, a LinkedIn snippet, or just a link to the job). The AI can read free text and fill in the fields for you.
          </p>

          <details className="rounded-lg border p-3 text-xs" style={{ borderColor: 'var(--border)' }}>
            <summary className="cursor-pointer font-medium select-none" style={{ color: 'var(--text-secondary)' }}>
              Not sure what to paste? See the expected format
            </summary>
            <div className="mt-2.5 space-y-3">
              <div>
                <p className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Applications sheet — 6 columns</p>
                <p className="mb-1" style={{ color: 'var(--text-muted)' }}>Company · Role · Date Applied · Status · Interview Status · Job Link/Mail</p>
                <code className="block rounded px-2 py-1.5 font-mono whitespace-pre-wrap break-all" style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}>
                  {'Acme Inc.\tFrontend Engineer\tJuly 24, 2026\tSent\t-\tjobs@acme.com'}
                </code>
              </div>
              <div>
                <p className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Job leads sheet — 12 columns</p>
                <p style={{ color: 'var(--text-muted)' }}>
                  Company · Recruitment Email · Job Title · Experience · Location · Posted Time · LinkedIn URL ·
                  Careers URL · Email Source URL · Applied · (unused) · Posted Timestamp
                </p>
              </div>
              <p style={{ color: 'var(--text-muted)' }}>
                Columns must be tab-separated (copying directly from Google Sheets does this automatically). If
                auto-detect picks the wrong one, choose the format explicitly below.
              </p>
            </div>
          </details>

          <div className="flex items-center gap-2">
            <label className="text-xs font-medium shrink-0" style={{ color: 'var(--text-muted)' }}>Format:</label>
            <select
              value={format}
              onChange={(e) => { setFormat(e.target.value); setAiRows(null); setAiNote(''); setErr(''); }}
              className="text-xs rounded-lg px-2 py-1.5 border outline-none flex-1"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              <option value="auto">Auto-detect (spreadsheet rows)</option>
              <option value="ai">Smart — read any text with AI</option>
              <option value="sheet1">Applications sheet (6 columns)</option>
              <option value="sheet2">Job leads sheet (12 columns)</option>
            </select>
          </div>

          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setAiRows(null); setAiNote(''); }}
            rows={7}
            placeholder={'Paste rows here, e.g.:\nPolygnan\tFull-Stack SDE Intern\tJuly 24, 2026\tSent\t-\tprajwal@polygnan.org'}
            className="w-full rounded-lg px-3 py-2.5 text-xs font-mono outline-none border focus:ring-2 scrollbar-thin"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />

          {suggestAi && (
            <p className="text-xs rounded-lg px-3 py-2" style={{ background: 'color-mix(in oklab, var(--amber) 14%, var(--surface))', color: 'var(--text-primary)' }}>
              This looks like free text, not spreadsheet rows. Use <strong>Read with AI</strong> to fill in the fields automatically.
            </p>
          )}
          {text.trim() && (!aiMode || !aiRows?.length) && (
            <button type="button" onClick={runAi} disabled={aiBusy}
              className="w-full text-sm rounded-lg px-4 py-2.5 font-medium border flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ borderColor: 'var(--brand)', color: 'var(--brand-strong)', background: suggestAi ? 'color-mix(in oklab, var(--brand) 12%, var(--surface))' : 'transparent' }}>
              {aiBusy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {aiBusy ? 'Reading…' : 'Read with AI'}
            </button>
          )}
          {aiNote && <p role="status" className="text-xs" style={{ color: 'var(--text-secondary)' }}>{aiNote}</p>}

          {hasLeadRows && (
            <div className="flex items-center gap-2">
              <label htmlFor="import-visibility" className="text-xs font-medium shrink-0" style={{ color: 'var(--text-muted)' }}>Lead visibility:</label>
              <select
                id="import-visibility"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
                className="text-xs rounded-lg px-2 py-1.5 border outline-none flex-1"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                <option value="personal">Personal — only me</option>
                <option value="peer">Peer — my accepted peers can see these leads</option>
              </select>
            </div>
          )}

          {text.trim() && (!aiMode || aiRows?.length > 0) && (
            <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  {aiMode ? <>Read by AI: <strong>check these before importing</strong></> : <>Detected format: <strong>{result.format === 'sheet2' ? 'Job leads sheet' : 'Applications sheet'}</strong></>}
                </span>
                {aiMode && aiRecords.length > 0 && (
                  <button type="button" onClick={copyTsv} className="text-xs inline-flex items-center gap-1 rounded-md px-2 py-1 border hover:bg-[var(--surface-2)]" style={{ borderColor: 'var(--border)', color: 'var(--brand)' }}>
                    <ClipboardCopy size={12} /> {copied ? 'Copied' : 'Copy as 12-column TSV'}
                  </button>
                )}
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {result.jobs.length} row{result.jobs.length === 1 ? '' : 's'} ready
                  {result.skipped > 0 ? `, ${result.skipped} skipped` : ''}
                </span>
              </div>
              <div className="max-h-56 overflow-y-auto scrollbar-thin space-y-1.5">
                {[...checked].sort((a, b) => (b.missing.length > 0) - (a.missing.length > 0)).slice(0, aiMode ? 200 : 8).map(({ job: j, i, missing }) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="truncate flex-1" style={{ color: 'var(--text-primary)' }}>{j.company || '—'}</span>
                    <span className="truncate flex-1" style={{ color: 'var(--text-secondary)' }}>{j.role || '—'}{aiMode && j.location ? ` · ${j.location}` : ''}</span>
                    {missing.length > 0 ? (
                      <span role="note" className="shrink-0 rounded-full px-2 py-0.5" style={{ background: 'color-mix(in oklab, var(--red) 14%, var(--surface))', color: 'var(--red)' }}>Missing: {missing.join(', ')}</span>
                    ) : <StatusBadge status={j.status} size="sm" />}
                    {aiMode && (
                      <button type="button" onClick={() => removeAiRow(i)} aria-label={`Remove ${j.company || j.role}`} className="shrink-0 w-6 h-6 rounded flex items-center justify-center hover:bg-[var(--surface-2)]" style={{ color: 'var(--text-muted)' }}>
                        <X size={13} />
                      </button>
                    )}
                  </div>
                ))}
                {!aiMode && result.jobs.length > 8 && (
                  <p className="text-xs pt-1" style={{ color: 'var(--text-muted)' }}>…and {result.jobs.length - 8} more</p>
                )}
              </div>
            </div>
          )}

          {invalidCount > 0 && (
            <div role="alert" className="text-sm rounded-lg p-2.5" style={{ background: 'color-mix(in oklab, var(--red) 12%, var(--surface))', color: 'var(--red)' }}>
              {invalidCount} row{invalidCount === 1 ? ' is' : 's are'} missing required fields (company, role, link or email) and will not be imported. Add the missing details in your text, or remove {invalidCount === 1 ? 'it' : 'them'}.
            </div>
          )}

          {err && (
            <div role="alert" className="text-sm rounded-lg p-2.5" style={{ background: 'color-mix(in oklab, var(--status-rejected) 12%, var(--surface))', color: 'var(--status-rejected)' }}>
              {err}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={handleClose} className="text-sm rounded-lg px-4 py-2 border" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={validJobs.length === 0 || importing}
              className="text-sm rounded-lg px-4 py-2 font-medium text-white disabled:opacity-50 flex items-center gap-2"
              style={{ background: 'var(--brand)' }}
            >
              {importing ? <Loader2 size={14} className="animate-spin" /> : <ClipboardPaste size={14} />}
              Import {validJobs.length || ''} job{validJobs.length === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
