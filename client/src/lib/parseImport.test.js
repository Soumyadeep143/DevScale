import { describe, expect, it } from 'vitest';
import { parsePastedJobs } from './parseImport';

describe('parsePastedJobs: trailing empty cells', () => {
  // A 12-column "Job leads sheet" row whose last columns are blank, as copied from Google Sheets.
  const row12 = ['KLA', '', 'Software Engineer', '2-3 years', 'Chennai, India', 'Posted Today', 'https://in.linkedin.com/jobs/view/1', '', '', '', '', ''].join('\t');

  it('still reads a 12-column row as the leads sheet when it ends in blank cells', () => {
    const r = parsePastedJobs(row12, 'auto');
    expect(r.format).toBe('sheet2');
    expect(r.jobs[0]).toMatchObject({ company: 'KLA', role: 'Software Engineer', location: 'Chennai, India', source: 'LinkedIn', contact: 'https://in.linkedin.com/jobs/view/1', status: 'lead' });
  });

  it('still reads the 6-column applications sheet', () => {
    const r = parsePastedJobs('Acme\tDev\tJuly 24, 2026\tSent\t-\thr@acme.com', 'auto');
    expect(r.format).toBe('sheet1');
    expect(r.jobs[0]).toMatchObject({ company: 'Acme', role: 'Dev', status: 'applied', contact: 'hr@acme.com' });
  });

  it('ignores blank lines, CRLF line ends and stray spaces around rows', () => {
    const r = parsePastedJobs(`  ${row12}  \r\n\r\n\t\t\r\n${row12.replace('KLA', 'Entrata')}\r\n`, 'auto');
    expect(r.jobs.map((j) => j.company)).toEqual(['KLA', 'Entrata']);
  });

  it('skips rows with neither company nor role', () => {
    const r = parsePastedJobs(`${row12}\n\t\t\t\t\t\thttps://x.com`, 'auto');
    expect(r.jobs).toHaveLength(1);
    expect(r.skipped).toBe(1);
  });
});
