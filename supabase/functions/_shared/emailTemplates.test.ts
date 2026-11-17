// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { describeDevice, esc, signInAlertEmail, welcomeEmail } from './emailTemplates.ts';

const APP = 'https://devscale.example.app';

describe('esc', () => {
  it('escapes HTML metacharacters', () => {
    expect(esc(`<script>alert("x")</script> & 'y'`)).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;');
  });
  it('handles null and undefined', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
});

describe('describeDevice', () => {
  it.each([
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36', 'Chrome on macOS'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/121.0', 'Firefox on Windows'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Safari/604.1', 'Safari on iOS'],
    ['Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120 Safari/537.36 Edg/120', 'Edge on Windows'],
  ])('describes %s', (ua, expected) => expect(describeDevice(ua)).toBe(expected));
  it('copes with a missing user agent', () => {
    expect(describeDevice(null)).toBe('an unknown device');
    expect(describeDevice('')).toBe('an unknown device');
  });
});

describe('welcomeEmail', () => {
  it('has a static subject and a greeting', () => {
    const m = welcomeEmail({ name: 'Priya', appUrl: APP });
    expect(m.subject).toBe('Welcome to DevScale');
    expect(m.html).toContain('Hi Priya');
    expect(m.text).toContain('Hi Priya');
    expect(m.html).toContain(`href="${APP}"`);
    expect(m.text).toContain(APP);
  });
  it('escapes a hostile display name in the HTML', () => {
    const m = welcomeEmail({ name: '<img src=x onerror=alert(1)>', appUrl: APP });
    expect(m.html).not.toContain('<img src=x');
    expect(m.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
  it('never puts the name in the subject (no header injection)', () => {
    expect(welcomeEmail({ name: 'a\r\nBcc: evil@x.com', appUrl: APP }).subject).toBe('Welcome to DevScale');
  });
});

describe('signInAlertEmail', () => {
  const base = { name: 'Priya', appUrl: APP, at: '2026-11-16 09:30:00 UTC', ip: '203.0.113.7', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0 Safari/537.36' };
  it('shows when, device and IP, in HTML and text', () => {
    const m = signInAlertEmail(base);
    expect(m.subject).toBe('New sign-in to your DevScale account');
    for (const part of ['2026-11-16 09:30:00 UTC', 'Chrome on macOS', '203.0.113.7']) {
      expect(m.html).toContain(part);
      expect(m.text).toContain(part);
    }
  });
  it('tells the user what to do if it was not them', () => {
    const m = signInAlertEmail(base);
    expect(m.text).toMatch(/If it wasn't/);
    expect(m.html).toContain('Reset my password');
  });
  it('escapes hostile IP and user-agent values', () => {
    const m = signInAlertEmail({ ...base, ip: '<b>1.2.3.4</b>', userAgent: '"><script>x()</script>' });
    expect(m.html).not.toContain('<script>');
    expect(m.html).not.toContain('<b>1.2.3.4</b>');
  });
  it('copes with a missing IP and user agent', () => {
    const m = signInAlertEmail({ ...base, ip: null, userAgent: null });
    expect(m.text).toContain('IP address: unknown');
    expect(m.text).toContain('an unknown device');
  });
});
