import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
import { supabase } from './supabase';
import { fetchContacts, fetchJobs, fetchMyLeads, fetchNotes } from './api';

// Each table serves `total` rows, honouring .range() like the real API (but never more than asked for).
function serve(totals) {
  const ranges = {};
  supabase.from.mockImplementation((table) => {
    const q = {
      select: () => q, order: () => q, eq: () => q,
      range: (a, b) => { (ranges[table] ||= []).push([a, b]); q.slice = [a, b]; return q; },
      then: (res, rej) => {
        const [a, b] = q.slice;
        const n = Math.max(0, Math.min(b + 1, totals[table] ?? 0) - a);
        const rows = Array.from({ length: n }, (_, k) => ({ id: `${table}${a + k}`, company: 'C', role: 'R', status: table === 'jobs' ? 'applied' : undefined, name: 'N', content: 'x' }));
        return Promise.resolve({ data: rows, error: null }).then(res, rej);
      },
    };
    return q;
  });
  return ranges;
}

beforeEach(() => vi.resetAllMocks());

describe('list loaders read past the API row cap', () => {
  it('fetchJobs returns every job and lead, not just the first 1000 of each', async () => {
    const ranges = serve({ jobs: 2300, leads: 1500 });
    const all = await fetchJobs();
    expect(all).toHaveLength(3800);
    expect(ranges.jobs).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(ranges.leads).toEqual([[0, 999], [1000, 1999]]);
  });

  it('a list that is exactly a full page makes one extra (empty) request and stops', async () => {
    const ranges = serve({ notes: 1000 });
    expect(await fetchNotes()).toHaveLength(1000);
    expect(ranges.notes).toEqual([[0, 999], [1000, 1999]]);
  });

  it('notes, own leads and contacts page the same way', async () => {
    serve({ notes: 1200, leads: 1100, contacts: 1050 });
    expect(await fetchNotes()).toHaveLength(1200);
    expect(await fetchMyLeads()).toHaveLength(1100);
    expect(await fetchContacts()).toHaveLength(1050);
  });
});
