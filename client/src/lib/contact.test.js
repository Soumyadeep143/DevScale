import { describe, expect, it } from 'vitest';
import { contactHref, isEmailStr } from './contact';

describe('contact helpers (baseline regression)', () => {
  it('detects emails', () => {
    expect(isEmailStr('a@b.com')).toBe(true);
    expect(isEmailStr('not an email')).toBe(false);
  });
  it('builds hrefs', () => {
    expect(contactHref('a@b.com')).toBe('mailto:a@b.com');
    expect(contactHref('linkedin.com/in/x')).toBe('https://linkedin.com/in/x');
    expect(contactHref('')).toBe('');
  });
});
