import { createContext, useContext, useEffect, useRef } from 'react';

// Pages that show things other people share with you (shared leads, shared contacts, peers) ask to be
// told when those change. The database sends a signal with a `kind` ('leads' | 'contacts' | 'peers' |
// 'all'); a burst of signals is merged into one callback per page, so importing hundreds of shared
// rows causes one reload, not hundreds.
export const SHARED_DEBOUNCE_MS = 300;

export function createSharedBus(debounceMs = SHARED_DEBOUNCE_MS) {
  const listeners = new Set(); // { kinds: Set<string>, cb }
  let pending = new Set();
  let timer = null;

  function flush() {
    timer = null;
    const kinds = pending;
    pending = new Set();
    for (const l of [...listeners]) {
      if (kinds.has('all') || [...l.kinds].some((k) => kinds.has(k))) l.cb();
    }
  }
  return {
    emit(kind = 'all') {
      pending.add(kind);
      if (!timer) timer = setTimeout(flush, debounceMs);
    },
    subscribe(kinds, cb) {
      const entry = { kinds: new Set(kinds), cb };
      listeners.add(entry);
      return () => listeners.delete(entry);
    },
    dispose() { clearTimeout(timer); timer = null; listeners.clear(); pending = new Set(); },
  };
}

// Outside the app's provider (tests, storybook) this is a harmless no-op bus.
export const SharedUpdatesContext = createContext({ subscribe: () => () => {} });

// Calls `reload` whenever something of one of `kinds` changes. Always calls the latest `reload`.
export function useSharedChanges(kinds, reload) {
  const bus = useContext(SharedUpdatesContext);
  const latest = useRef(reload);
  latest.current = reload;
  const key = [].concat(kinds).join(',');
  useEffect(() => bus.subscribe(key.split(','), () => latest.current()), [bus, key]);
}
