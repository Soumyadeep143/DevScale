import { describe, expect, it } from 'vitest';
import { activitySeries, conversion, filterByRange, greeting, jobDate, monthlySeries, rangeBounds, topBy } from './analytics';

const NOW = new Date(2026, 10, 16, 15, 0, 0); // 16 Nov 2026
const job = (o) => ({ id: Math.random(), company: 'A', role: 'R', status: 'applied', source: 'LinkedIn', dateApplied: '', createdAt: '2026-11-10T10:00:00Z', ...o });

describe('analytics', () => {
  it('uses dateApplied, falling back to createdAt', () => {
    expect(jobDate(job({ dateApplied: '2026-11-01' }))).toBe('2026-11-01');
    expect(jobDate(job())).toBe('2026-11-10');
    expect(jobDate({ createdAt: '' })).toBe('');
  });

  it('computes inclusive day ranges and custom ranges', () => {
    expect(rangeBounds({ days: 7 }, NOW)).toEqual({ from: '2026-11-10', to: '2026-11-16' });
    expect(rangeBounds({ from: '2026-01-01', to: '2026-02-01' }, NOW)).toEqual({ from: '2026-01-01', to: '2026-02-01' });
  });

  it('filters jobs by range', () => {
    const jobs = [job({ dateApplied: '2026-11-15' }), job({ dateApplied: '2026-09-01' })];
    expect(filterByRange(jobs, { days: 7 }, NOW)).toHaveLength(1);
  });

  it('buckets daily for short ranges and weekly for long ones', () => {
    const jobs = [job({ dateApplied: '2026-11-15' }), job({ dateApplied: '2026-11-15', status: 'lead' })];
    const d = activitySeries(jobs, { days: 7 }, NOW);
    expect(d.weekly).toBe(false);
    expect(d.points).toHaveLength(7);
    expect(d.points.at(-2)).toMatchObject({ total: 2, applied: 1 });
    const w = activitySeries(jobs, { days: 84 }, NOW);
    expect(w.weekly).toBe(true);
    expect(w.points.reduce((s, p) => s + p.total, 0)).toBe(2);
  });

  it('builds a rolling monthly series', () => {
    const m = monthlySeries([job({ dateApplied: '2026-10-03' }), job({ dateApplied: '2026-11-03' })], 3, NOW);
    expect(m.map((x) => x.count)).toEqual([0, 1, 1]);
  });

  it('ranks top companies and labels blanks Unknown', () => {
    const t = topBy([job({ company: 'X' }), job({ company: 'X' }), job({ company: ' ' })], 'company');
    expect(t[0]).toEqual({ name: 'X', count: 2 });
    expect(t[1].name).toBe('Unknown');
  });

  it('withholds conversion rates until there are enough applications', () => {
    expect(conversion([job(), job({ status: 'interviewing' })])).toBeNull();
    const jobs = [job(), job(), job(), job({ status: 'interviewing' }), job({ status: 'rejected' }), job({ status: 'lead' })];
    const c = conversion(jobs);
    expect(c.applications).toBe(5);
    expect(c.interviewRate).toBe(20);
    expect(c.responseRate).toBe(40);
  });

  it('greets by time of day', () => {
    expect(greeting(new Date(2026, 0, 1, 9))).toBe('Good morning');
    expect(greeting(new Date(2026, 0, 1, 15))).toBe('Good afternoon');
    expect(greeting(new Date(2026, 0, 1, 20))).toBe('Good evening');
  });
});
