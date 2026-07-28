import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { fetchLeetcode, updateLeetcodeStatus } from '../lib/api';

const LEETCODE_STATUSES = ['Not Started', 'In Progress', 'Solved ✅'];

function difficultyColor(d) {
  if (d === 'Easy') return 'var(--status-offer)';
  if (d === 'Hard') return 'var(--status-rejected)';
  return 'var(--status-interviewing)';
}

function statusColor(s) {
  if (s === 'Solved ✅') return 'var(--status-offer)';
  if (s === 'In Progress') return 'var(--status-interviewing)';
  return 'var(--text-muted)';
}

function Bar({ solved, total, height = 8 }) {
  const pct = total ? Math.round((solved / total) * 100) : 0;
  return (
    <div className="rounded-full overflow-hidden" style={{ background: 'var(--surface-2)', height }}>
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, background: 'var(--status-offer)' }}
      />
    </div>
  );
}

export default function Progress() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [weekFilter, setWeekFilter] = useState('all');
  const [pending, setPending] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchLeetcode();
      setData(result);
    } catch (err) {
      setError(err.message || 'Failed to load LeetCode progress');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function changeStatus(problem, next) {
    if (next === problem.status) return;
    setPending(problem.row);
    setData((d) => ({
      ...d,
      problems: d.problems.map((p) => (p.row === problem.row ? { ...p, status: next } : p)),
    }));
    try {
      await updateLeetcodeStatus(problem.row, next);
      await load();
    } catch {
      // best-effort; next load() call (or manual refresh) will reconcile
    } finally {
      setPending(null);
    }
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24" style={{ color: 'var(--text-muted)' }}>
        <Loader2 size={20} className="animate-spin mr-2" /> Loading LeetCode progress…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-xl border p-6 text-center" style={{ borderColor: 'var(--border)' }}>
        <p className="text-sm mb-3" style={{ color: 'var(--status-rejected)' }}>{error}</p>
        <button onClick={load} className="text-sm rounded-lg px-4 py-2 text-white" style={{ background: 'var(--brand)' }}>Retry</button>
      </div>
    );
  }

  if (!data) return null;

  const problems = weekFilter === 'all' ? data.problems : data.problems.filter((p) => String(p.week) === weekFilter);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border p-5" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Overall progress</h2>
          <button onClick={load} className="w-9 h-9 rounded-lg flex items-center justify-center hover:opacity-70" style={{ color: 'var(--text-secondary)' }} aria-label="Refresh progress">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="flex items-end justify-between mb-2">
          <span className="text-3xl font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{data.solved}<span className="text-base font-normal" style={{ color: 'var(--text-muted)' }}> / {data.total} solved</span></span>
          <span className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--status-offer)' }}>{data.percent}%</span>
        </div>
        <Bar solved={data.solved} total={data.total} height={10} />
        <div className="flex items-center gap-4 mt-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: 'var(--status-offer)' }} /> {data.solved} solved</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: 'var(--status-interviewing)' }} /> {data.inProgress} in progress</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: 'var(--text-muted)' }} /> {data.notStarted} not started</span>
        </div>
      </div>

      <div className="rounded-xl border p-5" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>By week</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.byWeek.map((w) => (
            <button
              key={w.week}
              onClick={() => setWeekFilter(weekFilter === w.week ? 'all' : w.week)}
              className="text-left rounded-lg border p-3 transition-colors"
              style={{
                borderColor: weekFilter === w.week ? 'var(--brand)' : 'var(--border)',
                background: weekFilter === w.week ? 'color-mix(in oklab, var(--brand) 8%, var(--surface))' : 'var(--surface-2)',
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Week {w.week}</span>
                <span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>{w.solved}/{w.total}</span>
              </div>
              <p className="text-[11px] mb-2 truncate" style={{ color: 'var(--text-muted)' }}>{w.theme}</p>
              <Bar solved={w.solved} total={w.total} />
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Problems {weekFilter !== 'all' && `— Week ${weekFilter}`}
          </h2>
          {weekFilter !== 'all' && (
            <button onClick={() => setWeekFilter('all')} className="text-xs underline" style={{ color: 'var(--text-muted)' }}>Show all</button>
          )}
        </div>
        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {problems.map((p) => (
            <div key={p.row} className="flex items-center gap-3 px-4 py-2.5 text-sm" style={{ borderColor: 'var(--border)' }}>
              <span className="w-14 shrink-0 text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>{p.day}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate" style={{ color: 'var(--text-primary)' }}>{p.problem}</p>
                <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>{p.topic}</p>
              </div>
              <span
                className="shrink-0 text-xs font-medium rounded-full px-2 py-0.5"
                style={{ background: `color-mix(in oklab, ${difficultyColor(p.difficulty)} 16%, var(--surface))`, color: difficultyColor(p.difficulty) }}
              >
                {p.difficulty}
              </span>
              {p.link && (
                <a href={p.link} target="_blank" rel="noreferrer" className="shrink-0 hover:opacity-70" style={{ color: 'var(--text-muted)' }} aria-label="Open problem">
                  <ExternalLink size={13} />
                </a>
              )}
              <div
                className="shrink-0 relative w-32 text-xs font-medium rounded-full flex items-center gap-1.5 px-2.5 py-1"
                style={{ background: `color-mix(in oklab, ${statusColor(p.status)} 14%, var(--surface))`, color: statusColor(p.status), opacity: pending === p.row ? 0.5 : 1 }}
              >
                {pending === p.row ? <Loader2 size={11} className="animate-spin shrink-0" /> : <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: statusColor(p.status) }} />}
                <select
                  value={p.status}
                  disabled={pending === p.row}
                  onChange={(e) => changeStatus(p, e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default"
                  aria-label="Problem status"
                >
                  {LEETCODE_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <span className="truncate">{p.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
