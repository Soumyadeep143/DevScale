import { useCallback, useMemo, useState } from 'react';

// Shows a long in-memory list a chunk at a time. `loadMore` reveals the next chunk, and the window
// is back to the first chunk whenever `resetKey` changes (a search, filter or sort) — computed during
// render, so there is never a frame showing the old, longer window. For lists that live on the
// server, use useInfiniteList instead.
export function useWindowedList(items, { pageSize = 30, resetKey = '' } = {}) {
  const [win, setWin] = useState({ key: resetKey, count: pageSize });
  const count = win.key === resetKey ? win.count : pageSize;

  const visible = useMemo(() => items.slice(0, count), [items, count]);
  const hasMore = items.length > count;
  const loadMore = useCallback(
    () => setWin((w) => ({ key: resetKey, count: (w.key === resetKey ? w.count : pageSize) + pageSize })),
    [resetKey, pageSize],
  );
  return { visible, hasMore, loadMore, total: items.length };
}
