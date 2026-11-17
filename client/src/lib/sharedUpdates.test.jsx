import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { SHARED_DEBOUNCE_MS, SharedUpdatesContext, createSharedBus, useSharedChanges } from './sharedUpdates';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); cleanup(); });

describe('shared updates bus', () => {
  it('tells only the pages that care about that kind', () => {
    const bus = createSharedBus();
    const leads = vi.fn(); const contacts = vi.fn();
    bus.subscribe(['leads'], leads);
    bus.subscribe(['contacts'], contacts);
    bus.emit('leads');
    vi.advanceTimersByTime(SHARED_DEBOUNCE_MS);
    expect(leads).toHaveBeenCalledTimes(1);
    expect(contacts).not.toHaveBeenCalled();
  });

  it('turns a burst of signals into one reload per page', () => {
    const bus = createSharedBus();
    const cb = vi.fn();
    bus.subscribe(['contacts'], cb);
    for (let i = 0; i < 200; i++) bus.emit('contacts');
    vi.advanceTimersByTime(SHARED_DEBOUNCE_MS - 1);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("'all' reaches every page, and a page listening to several kinds still reloads once", () => {
    const bus = createSharedBus();
    const a = vi.fn(); const b = vi.fn();
    bus.subscribe(['leads'], a);
    bus.subscribe(['leads', 'contacts', 'peers'], b);
    bus.emit('all');
    bus.emit('leads');
    bus.emit('contacts');
    vi.advanceTimersByTime(SHARED_DEBOUNCE_MS);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('stops calling a page after it unsubscribes, and nothing after dispose', () => {
    const bus = createSharedBus();
    const cb = vi.fn();
    const off = bus.subscribe(['leads'], cb);
    off();
    bus.emit('leads');
    vi.advanceTimersByTime(SHARED_DEBOUNCE_MS);
    expect(cb).not.toHaveBeenCalled();
    const cb2 = vi.fn();
    bus.subscribe(['leads'], cb2);
    bus.emit('leads');
    bus.dispose();
    vi.advanceTimersByTime(SHARED_DEBOUNCE_MS * 2);
    expect(cb2).not.toHaveBeenCalled();
  });

  it('signals that arrive while a reload is already pending start the next one cleanly', () => {
    const bus = createSharedBus();
    const cb = vi.fn();
    bus.subscribe(['leads'], cb);
    bus.emit('leads');
    vi.advanceTimersByTime(SHARED_DEBOUNCE_MS);
    bus.emit('leads');
    vi.advanceTimersByTime(SHARED_DEBOUNCE_MS);
    expect(cb).toHaveBeenCalledTimes(2);
  });
});

describe('useSharedChanges', () => {
  function Page({ reload, kinds = ['leads'] }) { useSharedChanges(kinds, reload); return null; }

  it('calls the latest reload function, not the one from the first render', () => {
    const bus = createSharedBus();
    const first = vi.fn(); const second = vi.fn();
    const ui = (fn) => <SharedUpdatesContext.Provider value={bus}><Page reload={fn} /></SharedUpdatesContext.Provider>;
    const { rerender } = render(ui(first));
    rerender(ui(second));
    bus.emit('leads');
    vi.advanceTimersByTime(SHARED_DEBOUNCE_MS);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('stops listening when the page goes away', () => {
    const bus = createSharedBus();
    const reload = vi.fn();
    const { unmount } = render(<SharedUpdatesContext.Provider value={bus}><Page reload={reload} /></SharedUpdatesContext.Provider>);
    unmount();
    bus.emit('leads');
    vi.advanceTimersByTime(SHARED_DEBOUNCE_MS);
    expect(reload).not.toHaveBeenCalled();
  });

  it('does nothing, and does not crash, outside the app provider', () => {
    expect(() => render(<Page reload={vi.fn()} />)).not.toThrow();
  });
});
