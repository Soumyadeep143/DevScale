import { useMemo, useState } from 'react';
import { Loader2, CheckCircle2, ClipboardPaste } from 'lucide-react';
import Modal from './ui/Modal';
import StatusBadge from './StatusBadge';
import { parsePastedJobs } from '../lib/parseImport';
import { useJobs } from '../context/JobsContext';

export default function ImportModal({ open, onClose }) {
  const { importJobs } = useJobs();
  const [text, setText] = useState('');
  const [format, setFormat] = useState('auto');
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(null);
  const [err, setErr] = useState('');

  const result = useMemo(() => parsePastedJobs(text, format), [text, format]);

  async function handleImport() {
    setImporting(true);
    setErr('');
    try {
      const count = await importJobs(result.jobs);
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
    setDone(null);
    setErr('');
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Import from Google Sheets" maxWidth="max-w-2xl">
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
            In your old spreadsheet, select your data rows (not the header) and copy (Ctrl+C), then paste below.
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
              onChange={(e) => setFormat(e.target.value)}
              className="text-xs rounded-lg px-2 py-1.5 border outline-none flex-1"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              <option value="auto">Auto-detect</option>
              <option value="sheet1">Applications sheet (6 columns)</option>
              <option value="sheet2">Job leads sheet (12 columns)</option>
            </select>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            placeholder={'Paste rows here, e.g.:\nPolygnan\tFull-Stack SDE Intern\tJuly 24, 2026\tSent\t-\tprajwal@polygnan.org'}
            className="w-full rounded-lg px-3 py-2.5 text-xs font-mono outline-none border focus:ring-2 scrollbar-thin"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />

          {text.trim() && (
            <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Detected format: <strong>{result.format === 'sheet2' ? 'Job leads sheet' : 'Applications sheet'}</strong>
                </span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {result.jobs.length} row{result.jobs.length === 1 ? '' : 's'} ready
                  {result.skipped > 0 ? `, ${result.skipped} skipped` : ''}
                </span>
              </div>
              <div className="max-h-40 overflow-y-auto scrollbar-thin space-y-1.5">
                {result.jobs.slice(0, 8).map((j, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="truncate flex-1" style={{ color: 'var(--text-primary)' }}>{j.company || '—'}</span>
                    <span className="truncate flex-1" style={{ color: 'var(--text-secondary)' }}>{j.role || '—'}</span>
                    <StatusBadge status={j.status} size="sm" />
                  </div>
                ))}
                {result.jobs.length > 8 && (
                  <p className="text-xs pt-1" style={{ color: 'var(--text-muted)' }}>…and {result.jobs.length - 8} more</p>
                )}
              </div>
            </div>
          )}

          {err && (
            <div className="text-sm rounded-lg p-2.5" style={{ background: 'color-mix(in oklab, var(--status-rejected) 12%, var(--surface))', color: 'var(--status-rejected)' }}>
              {err}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={handleClose} className="text-sm rounded-lg px-4 py-2 border" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={result.jobs.length === 0 || importing}
              className="text-sm rounded-lg px-4 py-2 font-medium text-white disabled:opacity-50 flex items-center gap-2"
              style={{ background: 'var(--brand)' }}
            >
              {importing ? <Loader2 size={14} className="animate-spin" /> : <ClipboardPaste size={14} />}
              Import {result.jobs.length || ''} job{result.jobs.length === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
