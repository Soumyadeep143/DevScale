// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

describe.each(['confirmation.html', 'recovery.html'])('%s', (file) => {
  const html = read(file);
  it('contains the one-time link, as a button and as plain text', () => {
    expect(html.match(/\{\{ \.ConfirmationURL \}\}/g)?.length).toBe(2);
    expect(html).toContain('href="{{ .ConfirmationURL }}"');
  });
  it('only uses Supabase variables that exist for this template', () => {
    const vars = [...html.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1]);
    for (const v of vars) expect(['.ConfirmationURL', '.Email']).toContain(v);
  });
  it('has no scripts or remote assets', () => {
    expect(html).not.toMatch(/<script|<img|<link|@import|src=/i);
  });
  it('tells people what to do if they did not ask for it', () => {
    expect(html).toMatch(/did not/i);
  });
});
