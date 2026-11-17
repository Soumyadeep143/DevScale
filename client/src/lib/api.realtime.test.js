import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ channels: [], setAuth: vi.fn(), removeChannel: vi.fn() }));
vi.mock('./supabase', () => ({
  supabase: {
    channel: vi.fn(() => {
      const ch = { subs: [], on: vi.fn((...a) => { ch.subs.push(a); return ch; }), subscribe: vi.fn((cb) => { ch.status = cb; return ch; }) };
      h.channels.push(ch);
      return ch;
    }),
    removeChannel: (c) => h.removeChannel(c),
    realtime: { setAuth: (t) => h.setAuth(t) },
  },
}));
import { subscribeToJobChanges, subscribeToSharedUpdates } from './api';

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  h.channels.length = 0;
  window.Clerk = { session: { getToken: vi.fn().mockResolvedValue('tok-1') } };
});
afterEach(() => { vi.useRealTimers(); delete window.Clerk; });

const connected = async () => { await vi.advanceTimersByTimeAsync(0); return h.channels.at(-1); };

describe('subscribeToJobChanges', () => {
  it('listens to leads and jobs, using the current Clerk token', async () => {
    const onChange = vi.fn();
    subscribeToJobChanges({ onChange });
    const ch = await connected();
    expect(h.setAuth).toHaveBeenCalledWith('tok-1');
    expect(ch.subs.map(([, filter]) => filter.table).sort()).toEqual(['contacts', 'jobs', 'leads', 'notes']);
    expect(ch.subs.every(([type, f]) => type === 'postgres_changes' && f.event === '*' && f.schema === 'public')).toBe(true);
    ch.subs.find(([, f]) => f.table === 'leads')[2]({ eventType: 'INSERT' });
    expect(onChange).toHaveBeenCalledWith('leads', { eventType: 'INSERT' });
  });

  it('reports status changes', async () => {
    const onStatus = vi.fn();
    subscribeToJobChanges({ onStatus });
    const ch = await connected();
    ch.status('SUBSCRIBED');
    expect(onStatus).toHaveBeenCalledWith('SUBSCRIBED');
  });

  it('re-creates the channel after an error, waiting longer each time, and resets once connected', async () => {
    subscribeToJobChanges({});
    let ch = await connected();
    ch.status('CHANNEL_ERROR');
    expect(h.removeChannel).toHaveBeenCalledWith(ch);
    expect(h.channels).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.channels).toHaveLength(2);
    ch = h.channels.at(-1);
    ch.status('TIMED_OUT');
    await vi.advanceTimersByTimeAsync(3999);
    expect(h.channels).toHaveLength(2); // second retry waits 4s
    await vi.advanceTimersByTimeAsync(1);
    expect(h.channels).toHaveLength(3);
    h.channels.at(-1).status('SUBSCRIBED');
    h.channels.at(-1).status('CLOSED');
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.channels).toHaveLength(4); // delay reset after a good connection
  });

  it('refreshes the socket token regularly, because Clerk tokens are short-lived', async () => {
    subscribeToJobChanges({});
    await connected();
    window.Clerk.session.getToken.mockResolvedValue('tok-2');
    await vi.advanceTimersByTimeAsync(45000);
    expect(h.setAuth).toHaveBeenLastCalledWith('tok-2');
  });

  it('stops everything when unsubscribed, including pending retries', async () => {
    const stop = subscribeToJobChanges({});
    const ch = await connected();
    ch.status('CHANNEL_ERROR');
    stop();
    await vi.advanceTimersByTimeAsync(60000);
    expect(h.channels).toHaveLength(1);
    expect(h.setAuth).toHaveBeenCalledTimes(1);
  });
});

describe('subscribeToSharedUpdates', () => {
  it('listens on the private topic of this user only', async () => {
    const { supabase } = await import('./supabase');
    subscribeToSharedUpdates({ userUuid: 'u-123', onSignal: vi.fn() });
    await connected();
    expect(supabase.channel).toHaveBeenCalledWith('peer:u-123', { config: { private: true } });
  });

  it('turns each broadcast into onSignal(kind), defaulting to "all"', async () => {
    const onSignal = vi.fn();
    subscribeToSharedUpdates({ userUuid: 'u-123', onSignal });
    const ch = await connected();
    const [type, filter, handler] = ch.subs[0];
    expect(type).toBe('broadcast');
    expect(filter).toEqual({ event: 'shared_changed' });
    handler({ payload: { kind: 'leads' } });
    handler({ payload: {} });
    expect(onSignal.mock.calls).toEqual([['leads'], ['all']]);
  });

  it('reconnects after an error, like the table feed', async () => {
    subscribeToSharedUpdates({ userUuid: 'u-123' });
    const ch = await connected();
    ch.status('CHANNEL_ERROR');
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.channels).toHaveLength(2);
  });
});
