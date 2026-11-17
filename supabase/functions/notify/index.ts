// Sends the welcome and new-sign-in emails. Called by database triggers (see the
// notifications migration) with a shared secret; never called from the browser.
//
// Deploy:   supabase functions deploy notify --no-verify-jwt
// Secrets:  supabase secrets set NOTIFY_SECRET=... EMAIL_PROVIDER=resend|brevo EMAIL_API_KEY=... \
//                                EMAIL_FROM="DevScale <hello@yourdomain.com>" APP_URL=https://your-app
import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendEmail } from '../_shared/emailProviders.ts';
import { handleNotify } from './handler.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve((req) =>
  handleNotify(req, {
    env: (k) => Deno.env.get(k),
    send: sendEmail,
    getUser: async (id) => {
      const { data, error } = await admin.auth.admin.getUserById(id);
      return error ? null : data.user;
    },
  })
);
