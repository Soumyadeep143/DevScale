import { useState } from 'react';
import { Link2, KeyRound, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useJobs } from '../context/JobsContext';

export default function Setup() {
  const { connect } = useJobs();
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [status, setStatus] = useState('idle'); // idle | connecting | error
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('connecting');
    setError('');
    try {
      await connect(url, token);
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Could not connect. Check the URL and token.');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6" style={{ background: 'var(--page)' }}>
      <div className="w-full max-w-lg rounded-2xl border p-6 sm:p-8" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg" style={{ background: 'var(--brand)' }}>D</div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Connect your Google Sheet</h1>
        </div>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          Your job data lives in a Google Sheet, wired up through a free Apps
          Script Web App. Paste in the URL and token from{' '}
          <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--surface-2)' }}>SETUP.md</code>{' '}
          to connect this device.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium uppercase tracking-wide flex items-center gap-1.5 mb-1.5" style={{ color: 'var(--text-muted)' }}>
              <Link2 size={13} /> Apps Script Web App URL
            </label>
            <input
              required
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none border focus:ring-2"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide flex items-center gap-1.5 mb-1.5" style={{ color: 'var(--text-muted)' }}>
              <KeyRound size={13} /> Secret token
            </label>
            <input
              required
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="your-secret-token"
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none border focus:ring-2 font-mono"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          </div>

          {status === 'error' && (
            <div className="flex items-start gap-2 text-sm rounded-lg p-3" style={{ background: 'color-mix(in oklab, var(--status-rejected) 12%, var(--surface))', color: 'var(--status-rejected)' }}>
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={status === 'connecting'}
            className="w-full rounded-lg py-2.5 text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity"
            style={{ background: 'var(--brand)' }}
          >
            {status === 'connecting' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {status === 'connecting' ? 'Connecting…' : 'Connect'}
          </button>
        </form>

        <p className="text-xs mt-5 text-center" style={{ color: 'var(--text-muted)' }}>
          First time? Open <code className="text-[11px]">SETUP.md</code> in the project for the 5-minute walkthrough.
        </p>
      </div>
    </div>
  );
}
