import AuthShell from './AuthShell';

// Shown instead of the app when the build has no Clerk key, so the failure is explained
// rather than a blank page.
export default function MissingConfig() {
  return (
    <AuthShell title="Sign-in isn’t configured" subtitle="This build has no Clerk publishable key.">
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Set <code>VITE_CLERK_PUBLISHABLE_KEY</code> in <code>client/.env.local</code> (copy it from the Clerk dashboard,
        API keys), then restart the dev server.
      </p>
    </AuthShell>
  );
}
