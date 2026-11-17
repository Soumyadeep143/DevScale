import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: false, userId: null },
  user: null,
  signOut: vi.fn(() => Promise.resolve()),
}));
vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => h.auth,
  useUser: () => ({ user: h.user }),
  useClerk: () => ({ signOut: h.signOut }),
}));
vi.mock('../lib/api', () => ({ fetchJobs: vi.fn(() => Promise.resolve([])), ensureIdentity: vi.fn(), subscribeToJobChanges: vi.fn(() => () => {}) }));

import * as api from '../lib/api';
import { JobsProvider, useJobs } from './JobsContext';

let ctx;
function Probe() { ctx = useJobs(); return <p>{`configured:${ctx.configured} session:${ctx.session === undefined ? 'loading' : ctx.session ? 'yes' : 'no'}`}</p>; }
const renderProbe = () => render(<JobsProvider><Probe /></JobsProvider>);
const signedIn = () => {
  h.auth = { isLoaded: true, isSignedIn: true, userId: 'user_1' };
  h.user = { fullName: 'Priya Sharma', primaryEmailAddress: { emailAddress: 'priya@acme.com' } };
};

beforeEach(() => {
  vi.clearAllMocks();
  h.auth = { isLoaded: true, isSignedIn: false, userId: null };
  h.user = null;
  api.ensureIdentity.mockResolvedValue();
});
afterEach(() => cleanup());

describe('JobsContext with Clerk', () => {
  it('is loading until Clerk has loaded', () => {
    h.auth = { isLoaded: false, isSignedIn: false, userId: null };
    renderProbe();
    expect(screen.getByText(/session:loading/)).toBeTruthy();
  });

  it('is signed out without calling the database', () => {
    renderProbe();
    expect(screen.getByText('configured:false session:no')).toBeTruthy();
    expect(api.ensureIdentity).not.toHaveBeenCalled();
    expect(api.fetchJobs).not.toHaveBeenCalled();
  });

  it('sets up the database account before opening the app, and passes the display name', async () => {
    signedIn();
    renderProbe();
    expect(screen.getByText(/session:loading/)).toBeTruthy(); // not usable until the identity exists
    await waitFor(() => expect(screen.getByText('configured:true session:yes')).toBeTruthy());
    expect(api.ensureIdentity).toHaveBeenCalledWith('Priya Sharma');
    await waitFor(() => expect(api.fetchJobs).toHaveBeenCalled());
    expect(ctx.session.user).toMatchObject({ id: 'user_1', email: 'priya@acme.com', user_metadata: { display_name: 'Priya Sharma' } });
  });

  it('never fetches data when account setup fails, and can retry', async () => {
    signedIn();
    api.ensureIdentity.mockRejectedValueOnce(new Error('boom'));
    renderProbe();
    await waitFor(() => expect(ctx.authError).toBe('boom'));
    expect(screen.getByText('configured:false session:no')).toBeTruthy();
    expect(api.fetchJobs).not.toHaveBeenCalled();
    act(() => ctx.retryAuth());
    await waitFor(() => expect(screen.getByText('configured:true session:yes')).toBeTruthy());
    expect(api.ensureIdentity).toHaveBeenCalledTimes(2);
  });

  it('signs out through Clerk', async () => {
    signedIn();
    renderProbe();
    await waitFor(() => expect(ctx.configured).toBe(true));
    await act(() => ctx.signOut());
    expect(h.signOut).toHaveBeenCalled();
  });
});
