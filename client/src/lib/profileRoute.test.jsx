import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { PROFILE_HASH, openProfile, useIsProfileRoute } from './profileRoute';

beforeEach(() => { window.location.hash = ''; });
afterEach(() => { window.location.hash = ''; });

describe('profile route', () => {
  it('is on only for #/profile', () => {
    const { result } = renderHook(() => useIsProfileRoute());
    expect(result.current).toBe(false);
    act(() => { window.location.hash = '#/personal/dashboard'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
    expect(result.current).toBe(false);
    act(() => { window.location.hash = PROFILE_HASH; window.dispatchEvent(new HashChangeEvent('hashchange')); });
    expect(result.current).toBe(true);
  });

  it('openProfile switches the page, and leaving by another route switches it off', () => {
    const { result } = renderHook(() => useIsProfileRoute());
    act(() => { openProfile(); window.dispatchEvent(new HashChangeEvent('hashchange')); });
    expect(window.location.hash).toBe('#/profile');
    expect(result.current).toBe(true);
    act(() => { window.location.hash = '#/team/leads'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
    expect(result.current).toBe(false);
  });

  it('does not match look-alike routes', () => {
    window.location.hash = '#/profiles';
    expect(renderHook(() => useIsProfileRoute()).result.current).toBe(false);
  });
});
