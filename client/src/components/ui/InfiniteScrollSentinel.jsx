import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

// Sits at the end of a list: when it scrolls into view it asks for the next page. A visible
// "Load more" button is always there too, for keyboards, assistive tech and browsers without
// IntersectionObserver.
export default function InfiniteScrollSentinel({ hasMore, loading, error, onLoadMore, loadedCount, noun = 'items' }) {
  const ref = useRef(null);
  const latest = useRef(onLoadMore);
  latest.current = onLoadMore;

  useEffect(() => {
    const el = ref.current;
    if (!el || !hasMore || loading || error || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) latest.current();
    }, { rootMargin: '300px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, error, loadedCount]);

  return (
    <div ref={ref} className="px-4 py-4 text-center text-xs min-h-[3rem]" style={{ color: 'var(--text-muted)' }}>
      {error ? (
        <p role="alert" style={{ color: 'var(--red)' }}>
          {error}{' '}
          <button type="button" onClick={onLoadMore} className="underline">Try again</button>
        </p>
      ) : loading ? (
        <span role="status" className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading more…</span>
      ) : hasMore ? (
        <button type="button" onClick={onLoadMore} className="rounded-lg border px-3 py-1.5 hover:bg-[var(--surface-2)]" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
          Load more
        </button>
      ) : loadedCount > 0 ? (
        <span>All {loadedCount} {noun} loaded</span>
      ) : null}
    </div>
  );
}
