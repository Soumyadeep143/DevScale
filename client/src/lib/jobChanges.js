import { jobFromRow, leadFromRow } from './api';

// Applies one live database change to the in-memory list of jobs + leads.
// Leads and jobs live in separate tables but share one list; a lead's id is 'l-<uuid>'.
//  * a lead that becomes `applied` has been promoted to a job: it leaves the list (its new job row
//    arrives as its own insert), exactly like fetchJobs, which only returns unapplied leads
//  * inserts and updates replace a row already present, so a change we made ourselves (which the
//    server echoes back) never shows up twice
//  * deletes only carry the primary key
export function applyJobChange(jobs, table, payload) {
  const { eventType, new: row, old } = payload || {};
  const idOf = (r) => (table === 'leads' ? `l-${r.id}` : r.id);

  if (eventType === 'DELETE') {
    return old?.id == null ? jobs : jobs.filter((j) => j.id !== idOf(old));
  }
  if (!row || row.id == null) return jobs;
  if (table === 'leads' && row.applied) return jobs.filter((j) => j.id !== idOf(row));

  const next = table === 'leads' ? leadFromRow(row) : jobFromRow(row);
  return jobs.some((j) => j.id === next.id)
    ? jobs.map((j) => (j.id === next.id ? next : j))
    : [next, ...jobs];
}
