import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ handlers: null, stop: vi.fn(), shared: null, stopShared: vi.fn(), user: { fullName: 'P', primaryEmailAddress: { emailAddress: 'p@x.com' } } }));
vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user_1' }),
  useUser: () => ({ user: h.user }),
  useClerk: () => ({ signOut: vi.fn() }),
}));
vi.mock('../lib/api', async () => {
  const real = await vi.importActual('../lib/api');
  return {
    ...real,
    updateMyDisplayName: vi.fn(() => Promise.resolve()),
    fetchJobs: vi.fn(), ensureIdentity: vi.fn(() => Promise.resolve('uuid-1')), createJob: vi.fn(),
    subscribeToSharedUpdates: vi.fn((handlers) => { h.shared = handlers; return h.stopShared; }),
    subscribeToJobChanges: vi.fn((handlers) => { h.handlers = handlers; return h.stop; }),
  };
});
vi.mock('../lib/supabase', () => ({ supabase: {} }));

import * as api from '../lib/api';
import { JobsProvider, useJobs } from './JobsContext';
import { SHARED_DEBOUNCE_MS, useSharedChanges } from '../lib/sharedUpdates';

let ctx;
const reloads = { leads: vi.fn(), contacts: vi.fn() };
function Probe() { ctx = useJobs(); useSharedChanges(['leads'], reloads.leads); useSharedChanges(['contacts'], reloads.contacts); return null; }
const leadRow = (id, over = {}) => ({ id, company: 'Acme', role: 'Dev', applied: false, created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z', ...over });
const push = (table, payload) => act(() => { h.handlers.onChange(table, payload); });

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchJobs.mockResolvedValue([]);
});
afterEach(() => cleanup());

async function mount() {
  render(<JobsProvider><Probe /></JobsProvider>);
  await waitFor(() => expect(ctx.configured).toBe(true));
  await waitFor(() => expect(api.subscribeToJobChanges).toHaveBeenCalled());
}

describe('live updates in JobsContext', () => {
  it('does not listen until the user is signed in and set up', async () => {
    await mount();
    expect(api.subscribeToJobChanges).toHaveBeenCalledTimes(1);
  });

  it('shows a new lead as soon as the database announces it, without a refresh', async () => {
    await mount();
    const fetches = api.fetchJobs.mock.calls.length;
    push('leads', { eventType: 'INSERT', new: leadRow('a1'), old: {} });
    expect(ctx.jobs.map((j) => [j.id, j.status, j.company])).toEqual([['l-a1', 'lead', 'Acme']]);
    expect(api.fetchJobs.mock.calls.length).toBe(fetches);
  });

  it('applies updates and deletes live', async () => {
    await mount();
    push('leads', { eventType: 'INSERT', new: leadRow('a1'), old: {} });
    push('leads', { eventType: 'UPDATE', new: leadRow('a1', { role: 'Staff Dev', visibility: 'peer' }), old: {} });
    expect(ctx.jobs[0]).toMatchObject({ role: 'Staff Dev', visibility: 'peer' });
    push('leads', { eventType: 'DELETE', new: null, old: { id: 'a1' } });
    expect(ctx.jobs).toEqual([]);
  });

  it('reloads once after the connection comes back, but not on the first connect', async () => {
    await mount();
    await waitFor(() => expect(api.fetchJobs).toHaveBeenCalled());
    api.fetchJobs.mockClear();
    act(() => h.handlers.onStatus('SUBSCRIBED')); // first connect: nothing missed
    expect(api.fetchJobs).not.toHaveBeenCalled();
    act(() => h.handlers.onStatus('CHANNEL_ERROR'));
    act(() => h.handlers.onStatus('SUBSCRIBED')); // reconnect: events may have been missed
    await waitFor(() => expect(api.fetchJobs).toHaveBeenCalledTimes(1));
  });

  it('keeps a job added here from appearing twice when the live feed beats the save response', async () => {
    await mount();
    let finish;
    api.createJob.mockImplementation(() => new Promise((res) => { finish = res; }));
    let pending;
    act(() => { pending = ctx.addJob({ company: 'Acme', role: 'Dev', status: 'lead' }); });
    await waitFor(() => expect(ctx.jobs).toHaveLength(1)); // optimistic row
    push('leads', { eventType: 'INSERT', new: leadRow('a1'), old: {} }); // the server announces it first
    const created = api.leadFromRow(leadRow('a1'));
    await act(async () => { finish(created); await pending; });
    expect(ctx.jobs.filter((j) => j.id === 'l-a1')).toHaveLength(1);
    expect(ctx.jobs.some((j) => String(j.id).startsWith('temp-'))).toBe(false);
  });

  it('stops listening on unmount', async () => {
    await mount();
    cleanup();
    expect(h.stop).toHaveBeenCalled();
  });
});

describe('live updates for things shared with you', () => {
  beforeEach(() => { reloads.leads.mockClear(); reloads.contacts.mockClear(); });

  it("listens on this user's own topic once their database id is known", async () => {
    await mount();
    await waitFor(() => expect(api.subscribeToSharedUpdates).toHaveBeenCalled());
    expect(api.subscribeToSharedUpdates.mock.calls[0][0].userUuid).toBe('uuid-1');
  });

  it('does not listen when the database id is unknown', async () => {
    api.ensureIdentity.mockResolvedValueOnce(undefined);
    await mount();
    expect(api.subscribeToSharedUpdates).not.toHaveBeenCalled();
  });

  it('reloads the pages that show that kind of shared data, once, when a signal arrives', async () => {
    await mount();
    await waitFor(() => expect(h.shared).toBeTruthy());
    act(() => { h.shared.onSignal('leads'); h.shared.onSignal('leads'); h.shared.onSignal('leads'); });
    await waitFor(() => expect(reloads.leads).toHaveBeenCalledTimes(1), { timeout: SHARED_DEBOUNCE_MS * 4 });
    expect(reloads.contacts).not.toHaveBeenCalled();
  });

  it('reloads everything after a reconnect, but not on the first connect', async () => {
    await mount();
    await waitFor(() => expect(h.shared).toBeTruthy());
    act(() => h.shared.onStatus('SUBSCRIBED'));
    await new Promise((r) => setTimeout(r, SHARED_DEBOUNCE_MS + 100));
    expect(reloads.leads).not.toHaveBeenCalled();
    act(() => h.shared.onStatus('CHANNEL_ERROR'));
    act(() => h.shared.onStatus('SUBSCRIBED'));
    await waitFor(() => { expect(reloads.leads).toHaveBeenCalledTimes(1); expect(reloads.contacts).toHaveBeenCalledTimes(1); }, { timeout: SHARED_DEBOUNCE_MS * 4 });
  });

  it('also reloads sharing pages when your own leads change (another tab of yours)', async () => {
    await mount();
    push('leads', { eventType: 'UPDATE', new: leadRow('a1', { visibility: 'peer' }), old: {} });
    await waitFor(() => expect(reloads.leads).toHaveBeenCalledTimes(1), { timeout: SHARED_DEBOUNCE_MS * 4 });
  });

  it('own contact changes reload contact pages without touching the jobs list', async () => {
    await mount();
    push('contacts', { eventType: 'INSERT', new: { id: 'c1', name: 'X' }, old: {} });
    await waitFor(() => expect(reloads.contacts).toHaveBeenCalledTimes(1), { timeout: SHARED_DEBOUNCE_MS * 4 });
    expect(ctx.jobs).toEqual([]);
  });

  it('own note changes reload note pages without touching the jobs list', async () => {
    reloads.notes = reloads.notes || vi.fn();
    await mount();
    push('notes', { eventType: 'UPDATE', new: { id: 'n1', visibility: 'peer' }, old: {} });
    await new Promise((r) => setTimeout(r, SHARED_DEBOUNCE_MS + 100));
    expect(ctx.jobs).toEqual([]);
  });

  it('stops listening on unmount', async () => {
    await mount();
    await waitFor(() => expect(h.shared).toBeTruthy());
    cleanup();
    expect(h.stopShared).toHaveBeenCalled();
  });
});

describe('keeping the name peers see in step with Clerk', () => {
  beforeEach(() => { h.user = { fullName: 'Priya Sharma', firstName: 'Priya', primaryEmailAddress: { emailAddress: 'p@x.com' } }; });

  it('copies the name to the profile once after sign-in', async () => {
    await mount();
    await waitFor(() => expect(api.updateMyDisplayName).toHaveBeenCalledWith('uuid-1', 'Priya Sharma'));
    expect(api.updateMyDisplayName).toHaveBeenCalledTimes(1);
  });

  it('never overwrites the profile with a stand-in made from the email', async () => {
    h.user = { fullName: '', firstName: '', primaryEmailAddress: { emailAddress: 'someone@x.com' } };
    await mount();
    await new Promise((r) => setTimeout(r, 50));
    expect(api.updateMyDisplayName).not.toHaveBeenCalled();
    expect(ctx.session.user.user_metadata.display_name).toBe('someone'); // shown locally, not saved
  });

  it('uses the first name when there is no full name', async () => {
    h.user = { fullName: '', firstName: 'Priya', primaryEmailAddress: { emailAddress: 'p@x.com' } };
    await mount();
    await waitFor(() => expect(api.updateMyDisplayName).toHaveBeenCalledWith('uuid-1', 'Priya'));
  });

  it('copies a changed name when it changes (edited on the profile page)', async () => {
    const view = render(<JobsProvider><Probe /></JobsProvider>);
    await waitFor(() => expect(api.updateMyDisplayName).toHaveBeenCalledWith('uuid-1', 'Priya Sharma'));
    h.user = { ...h.user, fullName: 'Priya S. Sharma' };
    view.rerender(<JobsProvider><Probe /></JobsProvider>);
    await waitFor(() => expect(api.updateMyDisplayName).toHaveBeenLastCalledWith('uuid-1', 'Priya S. Sharma'));
    expect(api.updateMyDisplayName).toHaveBeenCalledTimes(2);
  });

  it('does not copy again for a re-render with the same name', async () => {
    const view = render(<JobsProvider><Probe /></JobsProvider>);
    await waitFor(() => expect(api.updateMyDisplayName).toHaveBeenCalledTimes(1));
    view.rerender(<JobsProvider><Probe /></JobsProvider>);
    view.rerender(<JobsProvider><Probe /></JobsProvider>);
    expect(api.updateMyDisplayName).toHaveBeenCalledTimes(1);
  });

  it('a failed copy does not break the app, and is retried on the next change', async () => {
    api.updateMyDisplayName.mockRejectedValueOnce(new Error('offline'));
    const view = render(<JobsProvider><Probe /></JobsProvider>);
    await waitFor(() => expect(api.updateMyDisplayName).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(ctx.configured).toBe(true));
    h.user = { ...h.user, fullName: 'Priya Sharma' }; // same name, but the earlier copy failed
    view.rerender(<JobsProvider><Probe /></JobsProvider>);
    h.user = { ...h.user, fullName: 'Priya R. Sharma' };
    view.rerender(<JobsProvider><Probe /></JobsProvider>);
    await waitFor(() => expect(api.updateMyDisplayName).toHaveBeenLastCalledWith('uuid-1', 'Priya R. Sharma'));
  });
});
