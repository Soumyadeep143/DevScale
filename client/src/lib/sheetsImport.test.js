import { describe, expect, it } from 'vitest';
import { buildSql, mapAppliedLeads, mapLeads, mapLeetcode, mapTracker, normalizeStatus, parseCsv, toDate } from './sheetsImport';

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, commas and newlines in fields', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi""\nbye"\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"\nbye']]);
  });
  it('drops blank lines and a BOM', () => {
    expect(parseCsv('﻿a,b\n\n,\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('normalizeStatus (mirrors the old tracker)', () => {
  it.each([['Sent', 'applied'], ['Applied', 'applied'], ['In Progress', 'interviewing'], ['Selected', 'offer'], ['Rejected', 'rejected'], ['', 'lead'], ['Rejected by email', 'rejected'], ['???', 'lead']])('%s -> %s', (raw, want) => {
    expect(normalizeStatus(raw)).toBe(want);
  });
});

describe('toDate', () => {
  it('reads ISO and spelled-out dates, and rejects junk', () => {
    expect(toDate('2026-07-24 10:00')).toBe('2026-07-24');
    expect(toDate('July 24, 2026')).toBe('2026-07-24');
    expect(toDate('n/a')).toBeNull();
  });
});

describe('mapTracker', () => {
  const csv = 'Company,Role,Date Applied,Status,Interview Status,Job Link/Mail,ID,Notes\n'
    + 'Acme,Dev,July 24 2026,Sent,-,https://acme.com/jobs,,hello\n'
    + 'acme,DEV,2026-07-25,Applied,,,,dup\n'
    + 'Globex,SRE,,In Progress,Round 2,jobs@globex.com,,\n'
    + 'Initech,QA,,,,,,\n';
  const { jobs, leads } = mapTracker(csv);
  it('keeps one job per company+role, with normalised status', () => {
    expect(jobs.map((j) => [j.company, j.status])).toEqual([['Acme', 'applied'], ['Globex', 'interviewing']]);
    expect(jobs[0]).toMatchObject({ dateApplied: '2026-07-24', interviewStatus: '', notes: 'hello' });
  });
  it('sends status-less rows to leads', () => expect(leads.map((l) => l.company)).toEqual(['Initech']));
});

describe('mapLeads', () => {
  const csv = 'Company,Recruitment Email,Job Title,Experience,Location,Posted Time,LinkedIn Job URL,Careers Page URL,Email Source URL,Applied,,Posted Timestamp (Base)\n'
    + 'Open Co,hr@o.com,Dev,Not stated,Pune,#REF!,https://in.linkedin.com/jobs/view/1,https://o.com/careers,,FALSE,,2026-07-24 22:40:18\n'
    + 'Done Co,,Dev,Entry-level,Pune,,,,,TRUE,,2026-07-24 22:00:00\n'
    + 'Mail Co,x@m.com,Dev,,Pune,,,,,FALSE,,\n';
  const out = mapLeads(csv);
  it('skips already-applied rows', () => expect(out.map((l) => l.company)).toEqual(['Open Co', 'Mail Co']));
  it('maps source, contact, url and cleans placeholders', () => {
    expect(out[0]).toMatchObject({ source: 'LinkedIn', contact: 'https://in.linkedin.com/jobs/view/1', jobUrl: 'https://in.linkedin.com/jobs/view/1', experience: '', postedTime: '' });
    expect(out[0].createdAt).toBe('2026-07-24T22:40:18.000Z');
    expect(out[1]).toMatchObject({ source: 'Email', contact: 'x@m.com', jobUrl: '' });
  });
});

describe('URL columns that hold notes instead of links', () => {
  const csv = 'Company,Recruitment Email,Job Title,Experience,Location,Posted Time,LinkedIn Job URL,Careers Page URL,Email Source URL,Applied,,Posted Timestamp (Base)\n'
    + 'Ringg AI,,No open role,,,Bengaluru,,"Checked Sep 4, 2026",,FALSE,,2026-09-04T09:32:57.281Z\n';
  it('never puts non-URL text in job_url, and does not call it a careers page', () => {
    const [l] = mapLeads(csv);
    expect(l.jobUrl).toBe('');
    expect(l.contact).toBe('');
    expect(l.source).toBe('Scraped');
  });
  it('keeps the same rule for applied rows', () => {
    const [j] = mapAppliedLeads(csv.replace('FALSE', 'TRUE'));
    expect(j).toMatchObject({ contact: '', source: 'Scraped' });
  });
});

describe('mapAppliedLeads', () => {
  const csv = 'Company,Recruitment Email,Job Title,Experience,Location,Posted Time,LinkedIn Job URL,Careers Page URL,Email Source URL,Applied,,Posted Timestamp (Base)\n'
    + 'Known Co,,Dev,,Pune,,,https://k.com,,TRUE,,2026-07-24 10:00:00\n'
    + 'New Co,,Dev,Not stated,Pune,,https://in.linkedin.com/jobs/view/9,,,TRUE,,2026-07-24 11:00:00\n'
    + 'New Co,,Dev,,Pune,,,,,TRUE,,2026-07-24 12:00:00\n'
    + 'Open Co,,Dev,,Pune,,,,,FALSE,,\n';
  it('adds only applied rows the tracker lacks, once each, as Applied jobs', () => {
    const out = mapAppliedLeads(csv, [{ company: 'known co', role: 'DEV' }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ company: 'New Co', status: 'applied', dateApplied: null, source: 'LinkedIn', experience: '' });
    expect(out[0].createdAt).toBe('2026-07-24T11:00:00.000Z');
  });
});

describe('mapLeetcode', () => {
  const csv = 'Week #,Day #,Week Theme,Topic Category,Day Focus,Problem Name,🔗 Open Problem,Difficulty,ML/AI Connection,Status,Time Taken (min),Notes,Date Completed\n'
    + 'Week 1,Day 1,Week 1 - Python,Arrays,Foundations,Two Sum,https://leetcode.com/problems/two-sum/,Easy,Python,Solved ✅,,,\n'
    + 'Week 1,Day 2,Week 1 - Python,Arrays,Pointers,3Sum,https://leetcode.com/problems/3sum/,Medium,Two pointer,weird,,,\n';
  it('keeps order, links and valid statuses', () => {
    const p = mapLeetcode(csv);
    expect(p.map((x) => [x.position, x.problem, x.status])).toEqual([[0, 'Two Sum', 'Solved ✅'], [1, '3Sum', 'Not Started']]);
    expect(p[0].link).toBe('https://leetcode.com/problems/two-sum/');
  });
});

describe('buildSql', () => {
  const uid = '33e3c6b9-ad3e-4f85-96ec-b88697d3e0bf';
  it('escapes quotes and makes inserts skip existing rows', () => {
    const sql = buildSql({
      userId: uid,
      jobs: [{ company: "O'Reilly", role: 'Dev', status: 'applied', dateApplied: '2026-07-24', interviewStatus: '', contact: '', source: 'Tracker', location: '', experience: '', postedTime: '', notes: "it's; drop table x; --", createdAt: null, updatedAt: null }],
      leads: [{ company: 'L', role: 'R', location: '', experience: '', contact: '', source: 'Scraped', postedTime: '', jobUrl: '', createdAt: null }],
      problems: [{ position: 0, week: 'Week 1', day: 'Day 1', weekTheme: 't', topic: 't', dayFocus: 'd', problem: 'Two Sum', link: '', difficulty: 'Easy', concept: '', status: 'Not Started' }],
    });
    expect(sql).toContain("'O''Reilly'");
    expect(sql).toContain("'it''s; drop table x; --'");
    expect(sql).toContain('on conflict do nothing');
    expect(sql.match(/where not exists/g)).toHaveLength(2);
    expect(sql.startsWith('-- Generated')).toBe(true);
    expect(sql).toContain('begin;');
    expect(sql).toContain('create temp table _target');
    expect(sql.trimEnd().endsWith('commit;')).toBe(true);
  });
  it('can target an account by Clerk user id, resolved in SQL, and stops if it does not exist', () => {
    const sql = buildSql({ clerkUserId: 'user_3ABCdef', leads: [{ company: 'L', role: 'R', location: '', experience: '', contact: '', source: 'Scraped', postedTime: '', jobUrl: '', createdAt: null }] });
    expect(sql).toContain("from public.clerk_identities where clerk_user_id = 'user_3ABCdef'");
    expect(sql).toContain('No account found for user_3ABCdef');
    expect(() => buildSql({ clerkUserId: "user_1'; drop" })).toThrow();
  });
  it('refuses a non-uuid user', () => expect(() => buildSql({ userId: "x'; drop" })).toThrow());
});
