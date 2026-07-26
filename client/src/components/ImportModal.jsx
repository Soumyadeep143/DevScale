import { useMemo, useState } from 'react';
import { Loader2, CheckCircle2, ClipboardPaste } from 'lucide-react';
import Modal from './ui/Modal';
import StatusBadge from './StatusBadge';
import { parsePastedJobs } from '../lib/parseImport';
import { useJobs } from '../context/JobsContext';

export default function ImportModal({ open, onClose }) {
  const { importJobs } = useJobs();
  const [text, setText] = useState('');
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(null);
  const [err, setErr] = useState('');

  const result = useMemo(() => parsePastedJobs(text), [text]);

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
            In your old spreadsheet, select your data rows and copy (Ctrl+C), then paste below.
            Works with either of your two sheet layouts — auto-detected.
          </p>
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
