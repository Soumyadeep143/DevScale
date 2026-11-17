import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
import { supabase } from './supabase';
import { fetchLeetcodePage, fetchLeetcodeSummary } from './api';

// A chainable stand-in for a PostgREST query that resolves with `responder(range)`.
function mockTable(responder) {
  const calls = { range: [], eq: [] };
  const q = {
    select: () => q, order: () => q,
    range: (a, b) => { calls.range.push([a, b]); q.rows = responder(a, b); return q; },
    eq: (k, v) => { calls.eq.push([k, v]); return q; },
    then: (res, rej) => Promise.resolve({ data: q.rows, error: null }).then(res, rej),
  };
  supabase.from.mockReturnValue(q);
  return calls;
}
const row = (i, over = {}) => ({ id: i, position: i, week: `Week ${1 + Math.floor(i / 10)}`, day: 'Day 1', week_theme: 'T', topic: 't', day_focus: 'f',
  problem: `P${i}`, link: '', difficulty: ['Easy', 'Medium', 'Hard'][i % 3], concept: '', status: 'Not Started', updated_at: '2026-01-01T00:00:00Z', ...over });
const rows = (from, to, total) => Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, k) => row(from + k));

beforeEach(() => vi.resetAllMocks());

describe('fetchLeetcodePage', () => {
  it('asks for one extra row and reports whether more exist', async () => {
    const calls = mockTable((a, b) => rows(a, b, 120));
    const p1 = await fetchLeetcodePage({ offset: 0, limit: 50 });
    expect(calls.range).toEqual([[0, 50]]);
    expect(p1.items).toHaveLength(50);
    expect(p1.hasMore).toBe(true);
    const last = await fetchLeetcodePage({ offset: 100, limit: 50 });
    expect(last.items).toHaveLength(20);
    expect(last.hasMore).toBe(false);
  });

  it('says there is no more when the data ends exactly on a page boundary', async () => {
    mockTable((a, b) => rows(a, b, 50));
    const p = await fetchLeetcodePage({ offset: 0, limit: 50 });
    expect(p.items).toHaveLength(50);
    expect(p.hasMore).toBe(false);
  });

  it('filters by week', async () => {
    const calls = mockTable(() => []);
    await fetchLeetcodePage({ offset: 0, limit: 50, week: 'Week 2' });
    expect(calls.eq).toEqual([['week', 'Week 2']]);
  });
});

describe('fetchLeetcodeSummary', () => {
  it('reads past the API 1000-row cap instead of silently stopping', async () => {
    const calls = mockTable((a, b) => rows(a, b, 1200).map((r) => ({ ...r, status: r.id < 5 ? 'Solved ✅' : 'Not Started' })));
    const s = await fetchLeetcodeSummary();
    expect(calls.range).toEqual([[0, 999], [1000, 1999]]);
    expect(s.total).toBe(1200);
    expect(s.solved).toBe(5);
  });

  it('computes totals, per-difficulty and naturally sorted weeks, and the latest activity', async () => {
    mockTable(() => [
      row(0, { week: 'Week 10', status: 'Solved ✅', difficulty: 'Easy', updated_at: '2026-03-01T00:00:00Z' }),
      row(1, { week: 'Week 2', status: 'In Progress', difficulty: 'Hard', updated_at: '2026-04-01T00:00:00Z' }),
      row(2, { week: 'Week 2', status: 'Not Started', difficulty: 'Hard' }),
    ]);
    const s = await fetchLeetcodeSummary();
    expect(s).toMatchObject({ total: 3, solved: 1, inProgress: 1, notStarted: 1, percent: 33.3 });
    expect(s.byWeek.map((w) => w.week)).toEqual(['Week 2', 'Week 10']);
    expect(s.byDifficulty.find((d) => d.name === 'Hard')).toMatchObject({ total: 2, solved: 0 });
    expect(s.recent.map((r) => r.problem)).toEqual(['P1', 'P0']);
  });

  it('handles an empty plan', async () => {
    mockTable(() => []);
    expect(await fetchLeetcodeSummary()).toMatchObject({ total: 0, percent: 0, byWeek: [], recent: [] });
  });
});
