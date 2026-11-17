import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useWindowedList } from './useWindowedList';

const items = (n) => Array.from({ length: n }, (_, i) => i);

describe('useWindowedList', () => {
  it('shows one chunk, reveals more on request, and stops at the end', () => {
    const { result } = renderHook(() => useWindowedList(items(70), { pageSize: 30 }));
    expect(result.current.visible).toHaveLength(30);
    expect(result.current.hasMore).toBe(true);
    act(() => result.current.loadMore());
    expect(result.current.visible).toHaveLength(60);
    act(() => result.current.loadMore());
    expect(result.current.visible).toHaveLength(70);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.total).toBe(70);
  });

  it('goes back to the first chunk when the filter key changes', () => {
    const { result, rerender } = renderHook(({ k }) => useWindowedList(items(100), { pageSize: 30, resetKey: k }), { initialProps: { k: 'a' } });
    act(() => result.current.loadMore());
    expect(result.current.visible).toHaveLength(60);
    rerender({ k: 'b' });
    expect(result.current.visible).toHaveLength(30);
  });

  it('keeps the window when the list itself changes but the key does not (live updates)', () => {
    const { result, rerender } = renderHook(({ n }) => useWindowedList(items(n), { pageSize: 30, resetKey: 'x' }), { initialProps: { n: 100 } });
    act(() => result.current.loadMore());
    rerender({ n: 101 });
    expect(result.current.visible).toHaveLength(60);
  });
});
