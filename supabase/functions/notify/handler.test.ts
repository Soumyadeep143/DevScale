// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleNotify, safeEqual, type NotifyDeps } from './handler.ts';
import { EmailSendError } from '../_shared/emailProviders.ts';

const UID = 'bbbbbbbb-0000-0000-0000-000000000002';
const ENV: Record<string, string> = {
  NOTIFY_SECRET: 's3cret', EMAIL_PROVIDER: 'resend', EMAIL_API_KEY: 'key', EMAIL_FROM: 'DevScale <hello@devscale.app>', APP_URL: 'https://devscale.app',
};

let send: ReturnType<typeof vi.fn>;
let getUser: ReturnType<typeof vi.fn>;
const deps = (over: Partial<NotifyDeps> = {}, env: Record<string, string | undefined> = ENV): NotifyDeps => ({
  env: (k) => env[k], send: send as unknown as NotifyDeps['send'], getUser: getUser as unknown as NotifyDeps['getUser'],
  now: () => new Date('2026-11-16T09:30:00Z'), ...over,
});
const post = (body: unknown, headers: Record<string, string> = { 'x-notify-secret': 's3cret' }, method = 'POST') =>
  new Request('http://fn/notify', { method, headers: { 'content-type': 'application/json', ...headers }, body: method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });

beforeEach(() => {
  send = vi.fn(async () => undefined);
  getUser = vi.fn(async () => ({ email: 'priya@acme.com', user_metadata: { display_name: 'Priya' } }));
});

describe('safeEqual', () => {
  it('compares strings', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', 'a')).toBe(false);
  });
});

describe('handleNotify: access control', () => {
  it('only accepts POST', async () => {
    expect((await handleNotify(post({}, {}, 'GET'), deps())).status).toBe(405);
  });
  it('refuses to run without a configured secret', async () => {
    const res = await handleNotify(post({ kind: 'welcome', user_id: UID }), deps({}, { ...ENV, NOTIFY_SECRET: undefined }));
    expect(res.status).toBe(500);
  });
  it('rejects a missing or wrong secret and sends nothing', async () => {
    for (const headers of [{}, { 'x-notify-secret': 'wrong' }, { 'x-notify-secret': 'S3CRET' }, { 'x-notify-secret': 's3cre' }]) {
      const res = await handleNotify(post({ kind: 'welcome', user_id: UID }, headers), deps());
      expect(res.status).toBe(401);
    }
    expect(getUser).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('handleNotify: validation', () => {
  it('rejects malformed JSON', async () => {
    expect((await handleNotify(post('{nope'), deps())).status).toBe(400);
  });
  it('rejects an unknown kind', async () => {
    expect((await handleNotify(post({ kind: 'password_reset', user_id: UID }), deps())).status).toBe(400);
  });
  it('rejects a bad user id', async () => {
    expect((await handleNotify(post({ kind: 'welcome', user_id: 'not-a-uuid' }), deps())).status).toBe(400);
    expect((await handleNotify(post({ kind: 'welcome' }), deps())).status).toBe(400);
  });
  it('reports missing provider configuration', async () => {
    const res = await handleNotify(post({ kind: 'welcome', user_id: UID }), deps({}, { ...ENV, EMAIL_API_KEY: undefined }));
    expect(res.status).toBe(500);
    expect(send).not.toHaveBeenCalled();
  });
  it('returns 404 when the user has no email', async () => {
    getUser.mockResolvedValue({ email: null });
    expect((await handleNotify(post({ kind: 'welcome', user_id: UID }), deps())).status).toBe(404);
    getUser.mockResolvedValue(null);
    expect((await handleNotify(post({ kind: 'welcome', user_id: UID }), deps())).status).toBe(404);
  });
});

describe('handleNotify: sending', () => {
  it('sends the welcome email to the address stored for that user', async () => {
    const res = await handleNotify(post({ kind: 'welcome', user_id: UID }), deps());
    expect(res.status).toBe(200);
    expect(getUser).toHaveBeenCalledWith(UID);
    const [provider, key, mail] = send.mock.calls[0];
    expect(provider).toBe('resend');
    expect(key).toBe('key');
    expect(mail.to).toBe('priya@acme.com');
    expect(mail.from).toBe('DevScale <hello@devscale.app>');
    expect(mail.subject).toBe('Welcome to DevScale');
    expect(mail.html).toContain('Hi Priya');
  });

  it('ignores a recipient supplied in the request body', async () => {
    await handleNotify(post({ kind: 'welcome', user_id: UID, email: 'attacker@evil.com', to: 'attacker@evil.com' }), deps());
    expect(send.mock.calls[0][2].to).toBe('priya@acme.com');
  });

  it('falls back to the email name when there is no display name', async () => {
    getUser.mockResolvedValue({ email: 'sam@acme.com', user_metadata: {} });
    await handleNotify(post({ kind: 'welcome', user_id: UID }), deps());
    expect(send.mock.calls[0][2].html).toContain('Hi sam');
  });

  it('sends a sign-in alert with the device, IP and time', async () => {
    const res = await handleNotify(post({ kind: 'sign_in_alert', user_id: UID, ip: '203.0.113.7', user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0 Safari/537.36', at: '2026-11-16T09:15:42Z' }), deps());
    expect(res.status).toBe(200);
    const mail = send.mock.calls[0][2];
    expect(mail.subject).toBe('New sign-in to your DevScale account');
    expect(mail.text).toContain('2026-11-16 09:15:42 UTC');
    expect(mail.text).toContain('Chrome on macOS');
    expect(mail.text).toContain('203.0.113.7');
  });

  it('never emails reserved, undeliverable domains', async () => {
    for (const email of ['x@example.com', 'x@mail.example.org', 'x@foo.invalid', 'x@site.test', 'x@localhost']) {
      getUser.mockResolvedValue({ email, user_metadata: {} });
      const res = await handleNotify(post({ kind: 'welcome', user_id: UID }), deps());
      expect(res.status).toBe(200);
      expect((await res.json()).skipped).toBe('undeliverable_domain');
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('answers 502 without leaking details when the provider fails', async () => {
    send.mockRejectedValue(new EmailSendError('resend rejected the email', 422));
    const res = await handleNotify(post({ kind: 'welcome', user_id: UID }), deps());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: 'send_failed', provider_status: 422 });
    expect(JSON.stringify(body)).not.toContain('priya@acme.com');
  });
});
