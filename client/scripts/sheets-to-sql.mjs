// Builds a SQL file from CSV exports of the old Google Sheets. Nothing is sent anywhere and no
// secret is needed: you review the .sql and run it yourself in the Supabase SQL editor.
//
//   node scripts/sheets-to-sql.mjs (--clerk-user user_xxx | --user <uuid>) [--tracker tracker.csv] [--leads leads.csv] [--leetcode leetcode.csv] [--out import.sql]
//
// Export each tab in Google Sheets: File > Download > Comma-separated values (.csv).
import { readFileSync, writeFileSync } from 'node:fs';
import { buildSql, mapAppliedLeads, mapLeads, mapLeetcode, mapTracker } from '../src/lib/sheetsImport.js';

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : undefined; };
const userId = arg('user');
const clerkUserId = arg('clerk-user');
if (!userId && !clerkUserId) { console.error('Usage: node scripts/sheets-to-sql.mjs (--clerk-user user_xxx | --user <uuid>) [--tracker f.csv] [--leads f.csv] [--leetcode f.csv] [--applied-as-jobs] [--out import.sql]'); process.exit(2); }

let jobs = []; let leads = []; let problems = [];
if (arg('tracker')) { const t = mapTracker(readFileSync(arg('tracker'), 'utf8')); jobs = t.jobs; leads = leads.concat(t.leads); }
if (arg('leads')) {
  const csv = readFileSync(arg('leads'), 'utf8');
  leads = leads.concat(mapLeads(csv));
  // --applied-as-jobs: master-list rows marked Applied that the tracker lacks become Applied jobs.
  if (process.argv.includes('--applied-as-jobs')) jobs = jobs.concat(mapAppliedLeads(csv, jobs));
}
if (arg('leetcode')) problems = mapLeetcode(readFileSync(arg('leetcode'), 'utf8'));

const out = arg('out') || 'import.sql';
writeFileSync(out, buildSql({ userId, clerkUserId, jobs, leads, problems }));
const by = (k) => jobs.reduce((m, j) => ({ ...m, [j[k]]: (m[k === 'status' ? j[k] : j[k]] || 0) + 1 }), {});
console.log({ jobs: jobs.length, jobsByStatus: by('status'), leads: leads.length, leetcodeProblems: problems.length, solved: problems.filter((p) => p.status === 'Solved ✅').length });
console.log(`Wrote ${out}. Review it, then run it in the Supabase SQL editor.`);
