import { describe, expect, it } from 'vitest';
import { buildActivity, initials, myStatusFor, relativeTime, weeklyBuckets } from './team';

const NOW = Date.parse('2026-11-16T12:00:00Z');

describe('team helpers', () => {
  it('makes initials', () => {
    expect(initials('Rahul Sharma')).toBe('RS');
    expect(initials('priya')).toBe('P');
    expect(initials('')).toBe('?');
  });

  it('buckets into 12 weeks, oldest first, ignoring old and future items', () => {
    const day = 86400000;
    const items = [
      { at: new Date(NOW - 1 * day).toISOString(), series: 'a' },
      { at: new Date(NOW - 2 * day).toISOString(), series: 'b' },
      { at: new Date(NOW - 8 * day).toISOString(), series: 'a' },
      { at: new Date(NOW - 200 * day).toISOString(), series: 'a' },
      { at: new Date(NOW + day).toISOString(), series: 'a' },
    ];
    const b = weeklyBuckets(items, ['a', 'b'], 12, NOW);
    expect(b).toHaveLength(12);
    expect(b[11]).toMatchObject({ label: 'W12', a: 1, b: 1 });
    expect(b[10].a).toBe(1);
    expect(b.reduce((n, x) => n + x.a + x.b, 0)).toBe(3);
  });

  it('formats relative time', () => {
    expect(relativeTime(new Date(NOW - 3 * 3600000).toISOString(), NOW)).toBe('3h ago');
    expect(relativeTime('nope', NOW)).toBe('');
  });

  it('finds my own status by company and role, case-insensitively', () => {
    const jobs = [{ company: 'Google', role: 'Software Engineer', status: 'interviewing' }];
    expect(myStatusFor({ company: 'google', role: 'software engineer ' }, jobs)).toBe('interviewing');
    expect(myStatusFor({ company: 'Acme', role: 'Dev' }, jobs)).toBeNull();
  });

  it('builds a newest-first timeline from readable records only', () => {
    const ev = buildActivity({
      peers: [
        { id: 'p1', status: 'accepted', direction: 'outgoing', name: 'Ankit', acceptedAt: '2026-11-15T10:00:00Z', createdAt: '2026-11-14T10:00:00Z' },
        { id: 'p2', status: 'pending', direction: 'incoming', name: 'Sneha', createdAt: '2026-11-16T09:00:00Z' },
      ],
      myLeads: [{ id: 'l1', company: 'Acme', role: 'Dev', visibility: 'peer', createdAt: '2026-11-10T00:00:00Z' }, { id: 'l2', company: 'Secret', role: 'X', visibility: 'personal', createdAt: '2026-11-16T00:00:00Z' }],
      sharedLeads: [{ id: 's1', owner: 'Rahul', company: 'Google', role: 'SWE', createdAt: '2026-11-12T00:00:00Z' }],
      myContacts: [{ id: 'c1', name: 'Mine', company: 'Z', visibility: 'personal', createdAt: '2026-11-16T00:00:00Z' }],
      sharedContacts: [{ id: 'sc1', owner: 'Priya', name: 'Neha', designation: 'HM', company: 'Microsoft', createdAt: '2026-11-13T00:00:00Z' }],
    });
    expect(ev.map((e) => e.id)).toEqual(['peer-p2', 'peer-p1', 'sc-sc1', 'sl-s1', 'ml-l1']);
    expect(JSON.stringify(ev)).not.toContain('Secret');
    expect(JSON.stringify(ev)).not.toContain('Mine');
    expect(ev.find((e) => e.id === 'peer-p1').text).toBe('accepted your peer request');
  });
});
