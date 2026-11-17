import { describe, expect, it } from 'vitest';
import { isPersonalJob, personalJobs } from './personal';

describe('what belongs to Personal', () => {
  const jobs = [
    { id: 1, status: 'lead' },                          // older rows without visibility: personal
    { id: 2, status: 'lead', visibility: 'personal' },
    { id: 3, status: 'lead', visibility: 'peer' },      // moved to Team
    { id: 4, status: 'applied' },
    { id: 5, status: 'interviewing', visibility: 'peer' }, // never happens, but jobs are always personal
  ];
  it('leaves out only leads that were moved to Team', () => {
    expect(personalJobs(jobs).map((j) => j.id)).toEqual([1, 2, 4, 5]);
    expect(isPersonalJob({ status: 'lead', visibility: 'peer' })).toBe(false);
  });
});
