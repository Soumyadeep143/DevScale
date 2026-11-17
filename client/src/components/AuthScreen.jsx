import { useState } from 'react';
import { SignIn, SignUp, useAuth, useClerk } from '@clerk/clerk-react';
import { Loader2, AlertCircle } from 'lucide-react';
import { useJobs } from '../context/JobsContext';
import AuthShell from './AuthShell';

const linkBtn = 'underline hover:opacity-80';

// Signed-out screen. Clerk renders the forms and handles verification emails and password reset.
// The same screen also covers "signed in with Clerk but not yet usable" (the account is being
// set up in the database, or that failed).
export default function AuthScreen() {
  const [mode, setMode] = useState('signin');
  const { isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const { authError, retryAuth } = useJobs();

  if (isSignedIn && authError) {
    return (
      <AuthShell title="We couldn’t finish setting up your account" subtitle="You’re signed in, but DevScale couldn’t prepare your workspace.">
        <div className="space-y-4">
          <div role="alert" className="flex items-start gap-2 text-sm rounded-lg p-3"
            style={{ background: 'color-mix(in oklab, var(--red) 12%, var(--surface))', color: 'var(--red)' }}>
            <AlertCircle size={16} className="shrink-0 mt-0.5" /> <span>{authError}</span>
          </div>
          <button type="button" onClick={retryAuth} className="w-full rounded-lg py-2.5 text-sm font-medium text-white" style={{ background: 'var(--brand)' }}>Try again</button>
          <button type="button" onClick={() => signOut()} className="block mx-auto text-sm underline" style={{ color: 'var(--text-secondary)' }}>Sign out</button>
        </div>
      </AuthShell>
    );
  }

  if (isSignedIn) {
    return (
      <AuthShell title="Setting up your workspace…">
        <div role="status" className="flex justify-center py-6"><Loader2 className="animate-spin" size={22} style={{ color: 'var(--text-muted)' }} /></div>
      </AuthShell>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4" style={{ background: 'var(--page)' }}>
      {mode === 'signup' ? <SignUp routing="virtual" /> : <SignIn routing="virtual" />}
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        {mode === 'signup' ? 'Already have an account? ' : 'New here? '}
        <button type="button" onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')} className={linkBtn}>
          {mode === 'signup' ? 'Sign in' : 'Create an account'}
        </button>
      </p>
    </div>
  );
}
