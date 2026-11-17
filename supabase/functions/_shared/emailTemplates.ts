// Pure functions (no Deno or Node APIs) so they can be unit-tested from the client's Vitest setup.
// Every dynamic value is HTML-escaped. Subjects are static, so user-controlled text can never
// reach an email header.

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const BRAND = '#0148b5';

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// "Chrome on macOS" from a user-agent string. Deliberately coarse: it only needs to be
// recognisable to the account owner, not a fingerprint.
export function describeDevice(userAgent?: string | null): string {
  const ua = String(userAgent || '');
  if (!ua) return 'an unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : 'a browser';
  const os = /Windows/.test(ua) ? 'Windows'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iOS/.test(ua) ? 'iOS'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : '';
  return os ? `${browser} on ${os}` : browser;
}

function layout(title: string, bodyHtml: string, appUrl: string): string {
  return `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;background:#f4f4f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0b0b0b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e1e0d9" cellpadding="0" cellspacing="0">
<tr><td style="padding:28px 28px 8px"><span style="font-size:18px;font-weight:700;color:${BRAND}">DevScale</span></td></tr>
<tr><td style="padding:8px 28px 4px"><h1 style="margin:0;font-size:20px">${esc(title)}</h1></td></tr>
<tr><td style="padding:8px 28px 24px;font-size:15px;line-height:1.55;color:#33322f">${bodyHtml}</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #e1e0d9;font-size:12px;color:#898781">You are receiving this because of activity on your DevScale account. <a href="${esc(appUrl)}" style="color:#898781">${esc(appUrl)}</a></td></tr>
</table></td></tr></table></body></html>`;
}

function button(label: string, href: string): string {
  return `<p style="margin:20px 0"><a href="${esc(href)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600">${esc(label)}</a></p>`;
}

export function welcomeEmail(opts: { name: string; appUrl: string }): RenderedEmail {
  const name = opts.name || 'there';
  const html = layout('Welcome to DevScale', `
<p>Hi ${esc(name)}, your email is confirmed and your account is ready.</p>
<p>A good way to start:</p>
<ul style="padding-left:18px;margin:8px 0">
<li>Add the jobs you are chasing, or paste them in with <strong>Import</strong>.</li>
<li>Keep recruiters and referrers in <strong>Contacts</strong>.</li>
<li>Share your <strong>peer code</strong> (Team &rarr; Peers) to swap leads with people you trust.</li>
</ul>${button('Open DevScale', opts.appUrl)}`, opts.appUrl);
  const text = `Hi ${name}, your email is confirmed and your DevScale account is ready.

Add the jobs you are chasing (or paste them in with Import), keep recruiters in Contacts, and share your peer code (Team > Peers) to swap leads with people you trust.

Open DevScale: ${opts.appUrl}`;
  return { subject: 'Welcome to DevScale', html, text };
}

export function signInAlertEmail(opts: { name: string; appUrl: string; at: string; ip?: string | null; userAgent?: string | null }): RenderedEmail {
  const name = opts.name || 'there';
  const device = describeDevice(opts.userAgent);
  const when = opts.at;
  const ip = opts.ip ? String(opts.ip) : 'unknown';
  const html = layout('New sign-in to your account', `
<p>Hi ${esc(name)}, your DevScale account was just signed in to.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px 0;font-size:14px">
<tr><td style="padding:3px 16px 3px 0;color:#898781">When</td><td>${esc(when)}</td></tr>
<tr><td style="padding:3px 16px 3px 0;color:#898781">Device</td><td>${esc(device)}</td></tr>
<tr><td style="padding:3px 16px 3px 0;color:#898781">IP address</td><td>${esc(ip)}</td></tr>
</table>
<p>If this was you, there is nothing to do. <strong>If it wasn't</strong>, reset your password right away — that signs out every other session.</p>
${button('Reset my password', opts.appUrl)}`, opts.appUrl);
  const text = `Hi ${name}, your DevScale account was just signed in to.

When: ${when}
Device: ${device}
IP address: ${ip}

If this was you, there is nothing to do. If it wasn't, reset your password right away (use "Forgot password?" on the sign-in page) - that signs out every other session.

${opts.appUrl}`;
  return { subject: 'New sign-in to your DevScale account', html, text };
}
