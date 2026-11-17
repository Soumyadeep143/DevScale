import { describe, expect, it } from 'vitest';
import { MAX_IMPORT_ROWS, parseContacts } from './parseContacts';

describe('parseContacts', () => {
  it('parses tab-separated rows in the default column order', () => {
    const r = parseContacts('Priya Sharma\tpriya@acme.com\t+91 98765 43210\tAcme Inc.\tRecruiter\thttps://linkedin.com/in/priya');
    expect(r.skipped).toEqual([]);
    expect(r.rows).toEqual([{
      name: 'Priya Sharma', email: 'priya@acme.com', phone: '+91 98765 43210', company: 'Acme Inc.',
      designation: 'Recruiter', linkedinUrl: 'https://linkedin.com/in/priya',
    }]);
  });

  it('parses CSV, including quoted cells containing commas', () => {
    const r = parseContacts('Bob,bob@globex.com,555-0200,"Globex, Inc.",Manager');
    expect(r.rows[0]).toMatchObject({ name: 'Bob', company: 'Globex, Inc.', designation: 'Manager' });
  });

  it('handles escaped quotes and spreadsheet-quoted tab cells', () => {
    const r = parseContacts('"Ann ""AJ"" Lee"\tann@x.com\t1\t"Acme, Inc."');
    expect(r.rows[0]).toMatchObject({ name: 'Ann "AJ" Lee', company: 'Acme, Inc.' });
  });

  it('handles Windows line endings and blank lines', () => {
    const r = parseContacts('A\ta@x.com\t1\tCo\r\n\r\nB\tb@x.com\t2\tCo\r\n');
    expect(r.rows.map((c) => c.name)).toEqual(['A', 'B']);
  });

  it('detects a header row and accepts columns in any order', () => {
    const r = parseContacts('Company\tEmail\tName\tMobile\nAcme\tp@acme.com\tPriya\t12345');
    expect(r.format).toBe('header');
    expect(r.rows[0]).toMatchObject({ name: 'Priya', email: 'p@acme.com', phone: '12345', company: 'Acme' });
  });

  it('accepts common header synonyms', () => {
    const r = parseContacts('Full Name,E-mail,Phone Number,Organization,Job Title\nA B,a@b.co,9,Org,Dev');
    expect(r.rows[0]).toMatchObject({ name: 'A B', email: 'a@b.co', phone: '9', company: 'Org', designation: 'Dev' });
  });

  it('does not mistake a normal data row for a header', () => {
    const r = parseContacts('Name Smith\tn@x.com\t1\tCo');
    expect(r.format).toBe('columns');
    expect(r.rows).toHaveLength(1);
  });

  it('reports missing and invalid fields with line numbers and reasons', () => {
    const r = parseContacts([
      'No Email\t\t1\tCo',
      'Bad Email\tnot-an-email\t1\tCo',
      '\ta@x.com\t1\tCo',
      'No Phone\tb@x.com\t\tCo',
      'No Company\tc@x.com\t1\t',
      'Good\tg@x.com\t1\tCo',
    ].join('\n'));
    expect(r.rows.map((c) => c.name)).toEqual(['Good']);
    expect(r.skipped.map((s) => [s.line, s.reason])).toEqual([
      [1, 'Missing email'],
      [2, 'Invalid email "not-an-email"'],
      [3, 'Missing name'],
      [4, 'Missing phone number'],
      [5, 'Missing company'],
    ]);
  });

  it('reports the physical line number even with blank lines in between', () => {
    const r = parseContacts('A\ta@x.com\t1\tCo\n\n\nB\tbad\t1\tCo');
    expect(r.skipped[0].line).toBe(4);
  });

  it('skips duplicates within the paste, case-insensitively', () => {
    const r = parseContacts('A\tdup@x.com\t1\tCo\nB\tDUP@x.com\t2\tCo');
    expect(r.rows).toHaveLength(1);
    expect(r.skipped[0]).toMatchObject({ line: 2, reason: 'Duplicate email in the pasted data' });
  });

  it('skips emails the user already has', () => {
    const r = parseContacts('A\tHave@x.com\t1\tCo\nB\tnew@x.com\t2\tCo', { existingEmails: ['have@x.com'] });
    expect(r.rows.map((c) => c.email)).toEqual(['new@x.com']);
    expect(r.skipped[0].reason).toBe('Already in your contacts');
  });

  it('adds https:// to a scheme-less LinkedIn URL but rejects other schemes', () => {
    const ok = parseContacts('A\ta@x.com\t1\tCo\t\twww.linkedin.com/in/a');
    expect(ok.rows[0].linkedinUrl).toBe('https://www.linkedin.com/in/a');
    const bad = parseContacts('A\ta@x.com\t1\tCo\t\tjavascript:alert(1)');
    expect(bad.rows).toHaveLength(0);
    expect(bad.skipped[0].reason).toMatch(/LinkedIn/);
  });

  it('rejects over-long values like the database does', () => {
    const r = parseContacts(`${'x'.repeat(201)}\ta@x.com\t1\tCo`);
    expect(r.skipped[0].reason).toBe('Name is too long');
  });

  it('flags more rows than one import allows', () => {
    const many = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `N${i}\tn${i}@x.com\t1\tCo`).join('\n');
    expect(parseContacts(many).tooMany).toBe(true);
    expect(parseContacts(many.split('\n').slice(0, MAX_IMPORT_ROWS).join('\n')).tooMany).toBe(false);
  });

  it('returns nothing for empty input', () => {
    expect(parseContacts('  \n ')).toMatchObject({ rows: [], skipped: [] });
    expect(parseContacts(undefined).rows).toEqual([]);
  });
});
