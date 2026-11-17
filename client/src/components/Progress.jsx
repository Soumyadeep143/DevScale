import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CircleDot, Code2, ExternalLink, Loader2, RefreshCw, Target } from 'lucide-react';
import StatCard from './StatCard';
import Panel from './ui/Panel';
import PageHeader, { ghostBtn } from './ui/PageHeader';
import StatusDonut from './charts/StatusDonut';
import { timeAgo } from '../lib/analytics';
import { fetchLeetcodePage, fetchLeetcodeSummary, updateLeetcodeStatus } from '../lib/api';
import { useInfiniteList } from '../lib/useInfiniteList';
import InfiniteScrollSentinel from './ui/InfiniteScrollSentinel';

const PAGE_SIZE = 50;

const LEETCODE_STATUSES = ['Not Started', 'In Progress', 'Solved ✅'];

function difficultyColor(d) {
  if (d === 'Easy') return 'var(--green)';
  if (d === 'Hard') return 'var(--red)';
  return 'var(--amber)';
}

function statusColor(s) {
  if (s === 'Solved ✅') return 'var(--green)';
  if (s === 'In Progress') return 'var(--amber)';
  return 'var(--text-muted)';
}

function Bar({ solved, total, height = 8 }) {
  const pct = total ? Math.round((solved / total) * 100) : 0;
  return (
    <div className="rounded-full overflow-hidden" style={{ background: 'var(--surface-2)', height }}>
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, background: 'var(--green)' }}
      />
    </div>
  );
}

export default function Progress() {
  const [data, setData] = useState(null); // summary: totals, per-week, per-difficulty, recent
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [weekFilter, setWeekFilter] = useState('all');
  const [pending, setPending] = useState(null);

  // The problem list loads a page at a time (and starts over when the week filter changes).
  const week = weekFilter === 'all' ? null : weekFilter;
  const list = useInfiniteList(
    useCallback(({ offset, limit }) => fetchLeetcodePage({ offset, limit, week }), [week]),
    { pageSize: PAGE_SIZE, resetKey: weekFilter },
  );

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchLeetcodeSummary());
    } catch (err) {
      setError(err.message || 'Failed to load LeetCode progress');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const load = useCallback(() => { loadSummary(); list.reload(); }, [loadSummary, list]);

  async function changeStatus(problem, next) {
    if (next === problem.status) return;
    const previous = problem.status;
    const patch = (status) => list.setItems((items) => items.map((p) => (p.row === problem.row ? { ...p, status } : p)));
    setPending(problem.row);
    patch(next);
    try {
      await updateLeetcodeStatus(problem.row, next);
      await loadSummary(); // totals and charts only; the list keeps its place
    } catch {
      patch(previous); // the change did not save: put the old status back
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
      <div className="rounded-2xl border p-6 text-center" style={{ borderColor: 'var(--border)' }}>
        <p className="text-sm mb-3" style={{ color: 'var(--red)' }}>{error}</p>
        <button onClick={load} className="text-sm rounded-lg px-4 py-2 text-white" style={{ background: 'var(--brand)' }}>Retry</button>
      </div>
    );
  }

  if (!data) return null;

  const { byDifficulty, recent } = data;
  const problems = list.items;

  return (
    <div className="space-y-5">
      <PageHeader title="LeetCode Tracker" subtitle="Track your coding practice and progress.">
        <button onClick={load} className={ghostBtn} style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }} aria-label="Refresh progress">
          <RefreshCw size={14} className={loading || list.loading ? 'animate-spin' : ''} /> Refresh
        </button>
        <a href="https://leetcode.com/problemset/" target="_blank" rel="noreferrer" className={`${ghostBtn} text-white`} style={{ background: 'var(--brand)', borderColor: 'var(--brand)' }}>
          Open LeetCode <ExternalLink size={14} />
        </a>
      </PageHeader>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard label="Problems solved" value={data.solved} icon={CheckCircle2} color="var(--green)" sub={`of ${data.total} in your plan`} />
        <StatCard label="Plan completion" value={`${data.percent}%`} icon={Target} color="var(--brand)" />
        <StatCard label="In progress" value={data.inProgress} icon={CircleDot} color="var(--amber)" />
        <StatCard label="Not started" value={data.notStarted} icon={Code2} color="var(--purple)" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="Progress" className="lg:col-span-1">
          <div className="pt-3">
            <StatusDonut centerLabel="Problems" data={[
              { id: 'solved', label: 'Solved', color: 'var(--green)', count: data.solved },
              { id: 'progress', label: 'In progress', color: 'var(--amber)', count: data.inProgress },
              { id: 'todo', label: 'Not started', color: 'var(--text-muted)', count: data.notStarted },
            ]} />
          </div>
        </Panel>

        <Panel title="Difficulty distribution" subtitle="Solved / total by difficulty" className="lg:col-span-1">
          <ul className="space-y-4 pt-2">
            {byDifficulty.map((d) => (
              <li key={d.name}>
                <div className="flex justify-between text-sm mb-1.5"><span style={{ color: 'var(--text-secondary)' }}>{d.name}</span><span className="tabular-nums" style={{ color: 'var(--text-primary)' }}>{d.solved} / {d.total}</span></div>
                <div className="h-2 rounded-full" style={{ background: 'var(--surface-2)' }}>
                  <div className="h-full rounded-full" style={{ width: `${d.total ? (d.solved / d.total) * 100 : 0}%`, background: difficultyColor(d.name) }} />
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Recent activity" subtitle="Last problems you updated" className="lg:col-span-1">
          {recent.length === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: 'var(--text-muted)' }}>No activity yet. Mark a problem In progress or Solved.</p>
          ) : (
            <ul className="space-y-2.5">
              {recent.map((p) => (
                <li key={p.row} className="flex items-center gap-2.5 text-sm">
                  {p.status === 'Solved ✅' ? <CheckCircle2 size={15} style={{ color: 'var(--green)' }} /> : <CircleDot size={15} style={{ color: 'var(--amber)' }} />}
                  <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--text-primary)' }}>{p.problem}</span>
                  <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>{timeAgo(p.updatedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Acceptance rate, streaks and contest history aren’t tracked here: this page reflects only the problems in your own plan.
      </p>

      <div className="rounded-2xl border p-5" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}>
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
                <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{/^\d+$/.test(String(w.week)) ? `Week ${w.week}` : w.week}</span>
                <span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>{w.solved}/{w.total}</span>
              </div>
              <p className="text-[11px] mb-2 truncate" style={{ color: 'var(--text-muted)' }}>{w.theme}</p>
              <Bar solved={w.solved} total={w.total} />
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Problems {weekFilter !== 'all' && `— ${weekFilter}`}
          </h2>
          {weekFilter !== 'all' && (
            <button onClick={() => setWeekFilter('all')} className="text-xs underline" style={{ color: 'var(--text-muted)' }}>Show all</button>
          )}
        </div>
        {problems.length === 0 && !list.loading && !list.error && (
          <p className="text-sm text-center py-10" style={{ color: 'var(--text-muted)' }}>No problems {weekFilter !== 'all' ? 'in this week' : 'yet'}.</p>
        )}
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
        <InfiniteScrollSentinel hasMore={list.hasMore} loading={list.loading} error={list.error}
          onLoadMore={list.loadMore} loadedCount={problems.length} noun="problems" />
      </div>
    </div>
  );
}
