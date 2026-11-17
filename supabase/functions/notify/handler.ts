import { signInAlertEmail, welcomeEmail } from '../_shared/emailTemplates.ts';
import { EmailSendError, sendEmail, type Provider } from '../_shared/emailProviders.ts';

export interface NotifyUser {
  email?: string | null;
  user_metadata?: { display_name?: string } | null;
}
export interface NotifyDeps {
  env: (key: string) => string | undefined;
  getUser: (id: string) => Promise<NotifyUser | null>;
  send: typeof sendEmail;
  now?: () => Date;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Reserved by RFC 2606 / 6761: never deliverable, so mail to them can only bounce and hurt the
// sender's reputation (our own test accounts use example.com).
const UNDELIVERABLE = /(^|\.)(example\.(com|org|net)|invalid|test|localhost)$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Compares in constant time (for equal-length inputs) so the secret can't be guessed byte by byte.
export function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i += 1) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function handleNotify(req: Request, deps: NotifyDeps): Promise<Response> {
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  const secret = deps.env('NOTIFY_SECRET');
  if (!secret) return json({ ok: false, error: 'not_configured' }, 500);
  const presented = req.headers.get('x-notify-secret') || '';
  if (!safeEqual(presented, secret)) return json({ ok: false, error: 'unauthorized' }, 401);

  let body: { kind?: string; user_id?: string; ip?: string | null; user_agent?: string | null; at?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'bad_request' }, 400);
  }
  if (body.kind !== 'welcome' && body.kind !== 'sign_in_alert') return json({ ok: false, error: 'bad_kind' }, 400);
  if (!body.user_id || !UUID.test(body.user_id)) return json({ ok: false, error: 'bad_user' }, 400);

  const provider = deps.env('EMAIL_PROVIDER') as Provider | undefined;
  const apiKey = deps.env('EMAIL_API_KEY');
  const from = deps.env('EMAIL_FROM');
  const appUrl = deps.env('APP_URL');
  if (!provider || !apiKey || !from || !appUrl) return json({ ok: false, error: 'not_configured' }, 500);

  // The recipient always comes from the auth database, never from the request.
  const user = await deps.getUser(body.user_id);
  const to = user?.email?.trim();
  if (!user || !to) return json({ ok: false, error: 'no_recipient' }, 404);
  if (UNDELIVERABLE.test(to.split('@').pop() || '')) return json({ ok: true, skipped: 'undeliverable_domain' });

  const name = user.user_metadata?.display_name?.trim() || to.split('@')[0];
  const mail = body.kind === 'welcome'
    ? welcomeEmail({ name, appUrl })
    : signInAlertEmail({
      name,
      appUrl,
      ip: body.ip ?? null,
      userAgent: body.user_agent ?? null,
      at: `${(body.at ? new Date(body.at) : (deps.now ?? (() => new Date()))()).toISOString().replace('T', ' ').slice(0, 19)} UTC`,
    });

  try {
    await deps.send(provider, apiKey, { to, from, ...mail });
  } catch (e) {
    const status = e instanceof EmailSendError ? e.status : 0;
    return json({ ok: false, error: 'send_failed', provider_status: status }, 502);
  }
  return json({ ok: true });
}
