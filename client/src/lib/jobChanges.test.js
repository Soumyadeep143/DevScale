import { describe, expect, it } from 'vitest';
import { applyJobChange } from './jobChanges';

const leadRow = (id, over = {}) => ({ id, company: 'Acme', role: 'Dev', applied: false, visibility: 'personal', created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z', ...over });
const jobRow = (id, over = {}) => ({ id, company: 'Globex', role: 'SRE', status: 'applied', created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z', ...over });
const ev = (eventType, row, old) => ({ eventType, new: row, old });

describe('applyJobChange', () => {
  it('adds a new lead at the top, with the l- id the list uses', () => {
    const out = applyJobChange([{ id: 'j1' }], 'leads', ev('INSERT', leadRow('a1')));
    expect(out.map((j) => j.id)).toEqual(['l-a1', 'j1']);
    expect(out[0]).toMatchObject({ status: 'lead', company: 'Acme', visibility: 'personal' });
  });

  it('never shows the same row twice (our own change echoed back)', () => {
    const once = applyJobChange([], 'leads', ev('INSERT', leadRow('a1')));
    const twice = applyJobChange(once, 'leads', ev('INSERT', leadRow('a1')));
    expect(twice).toHaveLength(1);
  });

  it('updates a lead in place (e.g. shared with peers)', () => {
    const start = applyJobChange([], 'leads', ev('INSERT', leadRow('a1')));
    const out = applyJobChange(start, 'leads', ev('UPDATE', leadRow('a1', { visibility: 'peer', role: 'Lead Dev' })));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ visibility: 'peer', role: 'Lead Dev' });
  });

  it('removes a lead once it is applied (promoted to a job), and the job arrives as its own insert', () => {
    let list = applyJobChange([], 'leads', ev('INSERT', leadRow('a1')));
    list = applyJobChange(list, 'leads', ev('UPDATE', leadRow('a1', { applied: true })));
    expect(list).toEqual([]);
    list = applyJobChange(list, 'jobs', ev('INSERT', jobRow('j9', { company: 'Acme', role: 'Dev' })));
    expect(list.map((j) => [j.id, j.status])).toEqual([['j9', 'applied']]);
  });

  it('ignores an inserted lead that is already applied', () => {
    expect(applyJobChange([], 'leads', ev('INSERT', leadRow('a2', { applied: true })))).toEqual([]);
  });

  it('removes on delete using only the primary key', () => {
    const start = [...applyJobChange([], 'jobs', ev('INSERT', jobRow('j1'))), ...applyJobChange([], 'leads', ev('INSERT', leadRow('a1')))];
    expect(applyJobChange(start, 'leads', ev('DELETE', null, { id: 'a1' })).map((j) => j.id)).toEqual(['j1']);
    expect(applyJobChange(start, 'jobs', ev('DELETE', null, { id: 'j1' })).map((j) => j.id)).toEqual(['l-a1']);
  });

  it('is a no-op for malformed events', () => {
    const list = [{ id: 'j1' }];
    expect(applyJobChange(list, 'jobs', {})).toBe(list);
    expect(applyJobChange(list, 'jobs', ev('DELETE', null, {}))).toBe(list);
  });

  it('does not mix a lead id with a job that happens to share the uuid', () => {
    const list = applyJobChange(applyJobChange([], 'jobs', ev('INSERT', jobRow('same'))), 'leads', ev('INSERT', leadRow('same')));
    expect(list.map((j) => j.id).sort()).toEqual(['l-same', 'same']);
  });
});
