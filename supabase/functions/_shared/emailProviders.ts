// Sends one email through a provider's HTTPS API. SMTP is deliberately not used from the Edge
// Function: Supabase documents no guarantee for outbound SMTP ports, while HTTPS always works.
// `fetchImpl` is injectable for tests.

export interface OutgoingEmail {
  to: string;
  from: string; // "Name <address>" or just "address"
  subject: string;
  html: string;
  text: string;
}

export type Provider = 'resend' | 'brevo';
type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number }>;

export class EmailSendError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function parseAddress(from: string): { name?: string; email: string } {
  const m = /^\s*(?:"?([^"<]*?)"?\s*)?<([^<>\s]+)>\s*$/.exec(from);
  if (m) return { name: m[1] ? m[1].trim() : undefined, email: m[2] };
  return { email: from.trim() };
}

export async function sendEmail(
  provider: Provider,
  apiKey: string,
  mail: OutgoingEmail,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<void> {
  let res: { ok: boolean; status: number };
  if (provider === 'resend') {
    res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: mail.from, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text }),
    });
  } else if (provider === 'brevo') {
    const sender = parseAddress(mail.from);
    res = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender, to: [{ email: mail.to }], subject: mail.subject, htmlContent: mail.html, textContent: mail.text }),
    });
  } else {
    throw new EmailSendError(`Unknown email provider "${provider}"`, 500);
  }
  // Never include the response body or key in the error: it can echo the recipient address.
  if (!res.ok) throw new EmailSendError(`${provider} rejected the email`, res.status);
}
