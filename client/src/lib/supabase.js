import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — see client/.env.example');
}

// Authentication is handled by Clerk. Supabase only receives Clerk's session token (a short-lived
// JWT) on every request and checks it through its third-party-auth integration. The anon key is
// public by design; all access control is enforced by RLS policies keyed on the token's subject.
// `window.Clerk` is the global Clerk JS instance, available once <ClerkProvider> has loaded.
export const supabase = createClient(url || 'http://localhost', anonKey || 'missing', {
  accessToken: async () => {
    const session = typeof window !== 'undefined' ? window.Clerk?.session : null;
    return session ? session.getToken() : null;
  },
});
