import { describe, expect, it } from 'vitest';
import { toCsv } from './exportCsv';

describe('toCsv', () => {
  const cols = [{ label: 'Company', value: (r) => r.c }, { label: 'Notes', value: (r) => r.n }];
  it('quotes commas, quotes and newlines', () => {
    expect(toCsv(cols, [{ c: 'A, Inc', n: 'say "hi"\nbye' }])).toBe('Company,Notes\r\n"A, Inc","say ""hi""\nbye"');
  });
  it('neutralises spreadsheet formulas', () => {
    expect(toCsv(cols, [{ c: '=SUM(A1)', n: '+1' }])).toBe("Company,Notes\r\n'=SUM(A1),'+1");
  });
  it('handles empty values', () => {
    expect(toCsv(cols, [{ c: null, n: undefined }])).toBe('Company,Notes\r\n,');
  });
});
