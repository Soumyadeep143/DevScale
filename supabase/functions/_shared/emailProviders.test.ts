// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { EmailSendError, parseAddress, sendEmail } from './emailProviders.ts';

const mail = { to: 'priya@acme.com', from: 'DevScale <hello@devscale.app>', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' };
const okFetch = () => vi.fn(async () => ({ ok: true, status: 200 }));

describe('parseAddress', () => {
  it('splits a display name and address', () => {
    expect(parseAddress('DevScale <hello@devscale.app>')).toEqual({ name: 'DevScale', email: 'hello@devscale.app' });
    expect(parseAddress('"Dev Scale" <hello@devscale.app>')).toEqual({ name: 'Dev Scale', email: 'hello@devscale.app' });
  });
  it('accepts a bare address', () => {
    expect(parseAddress('hello@devscale.app')).toEqual({ email: 'hello@devscale.app' });
  });
});

describe('sendEmail via Resend', () => {
  it('posts the message to the Resend API with a bearer key', async () => {
    const f = okFetch();
    await sendEmail('resend', 're_key', mail, f);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer re_key');
    expect(JSON.parse(init.body)).toEqual({ from: mail.from, to: ['priya@acme.com'], subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' });
  });
});

describe('sendEmail via Brevo', () => {
  it('posts the message to the Brevo API with an api-key header and parsed sender', async () => {
    const f = okFetch();
    await sendEmail('brevo', 'xkeysib-1', mail, f);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.headers['api-key']).toBe('xkeysib-1');
    expect(JSON.parse(init.body)).toEqual({
      sender: { name: 'DevScale', email: 'hello@devscale.app' }, to: [{ email: 'priya@acme.com' }],
      subject: 'Hi', htmlContent: '<p>Hi</p>', textContent: 'Hi',
    });
  });
});

describe('sendEmail errors', () => {
  it('throws with the provider status when the provider rejects', async () => {
    const f = vi.fn(async () => ({ ok: false, status: 422 }));
    await expect(sendEmail('resend', 'k', mail, f)).rejects.toMatchObject({ name: 'Error', status: 422 });
  });
  it('does not leak the key or the recipient in the error', async () => {
    const f = vi.fn(async () => ({ ok: false, status: 401 }));
    const err = await sendEmail('resend', 'super-secret-key', mail, f).catch((e) => e);
    expect(err).toBeInstanceOf(EmailSendError);
    expect(err.message).not.toContain('super-secret-key');
    expect(err.message).not.toContain('priya@acme.com');
  });
  it('rejects an unknown provider without making a request', async () => {
    const f = okFetch();
    // @ts-expect-error — deliberately invalid
    await expect(sendEmail('mailgun', 'k', mail, f)).rejects.toThrow(/Unknown email provider/);
    expect(f).not.toHaveBeenCalled();
  });
});
