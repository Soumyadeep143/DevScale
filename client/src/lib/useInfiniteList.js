import { useCallback, useEffect, useRef, useState } from 'react';

// Loads a list one page at a time. `fetchPage({ offset, limit })` resolves to { items, hasMore }.
// The list starts over whenever `resetKey` changes (e.g. a filter), and a response that arrives after
// a newer request was made is ignored, so quick filter changes can never mix pages.
export function useInfiniteList(fetchPage, { pageSize = 50, resetKey = '' } = {}) {
  const [items, setItems] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const busy = useRef(false);
  const state = useRef({ offset: 0, fetchPage });
  state.current.fetchPage = fetchPage;

  const loadMore = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const mine = generation.current;
    setLoading(true);
    setError('');
    try {
      const { items: next, hasMore: more } = await state.current.fetchPage({ offset: state.current.offset, limit: pageSize });
      if (mine !== generation.current) return;
      state.current.offset += next.length;
      setItems((prev) => [...prev, ...next]);
      setHasMore(more && next.length > 0);
    } catch (e) {
      if (mine === generation.current) setError(e.message || 'Could not load more.');
    } finally {
      if (mine === generation.current) { busy.current = false; setLoading(false); }
    }
  }, [pageSize]);

  const reload = useCallback(() => {
    generation.current += 1;
    busy.current = false;
    state.current.offset = 0;
    setItems([]);
    setHasMore(true);
    setError('');
    return loadMore();
  }, [loadMore]);

  // First page, and a fresh start whenever the key changes.
  useEffect(() => { reload(); }, [resetKey, reload]);

  return { items, setItems, hasMore, loading, error, loadMore, reload };
}
