import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { resetThemeForTests, setTheme, useTheme } from './useTheme';
import { clerkAppearanceFor } from './clerkAppearance';

const html = () => document.documentElement.classList;
const systemLight = (light) => { window.matchMedia = vi.fn(() => ({ matches: light })); };

beforeEach(() => {
  localStorage.clear();
  html().remove('dark', 'light');
  resetThemeForTests();
  window.matchMedia = undefined;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('useTheme', () => {
  it('starts dark when nothing is saved and the system gives no preference', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
    expect(html().contains('dark')).toBe(true);
    expect(html().contains('light')).toBe(false);
  });

  it('follows a light system preference when nothing is saved', () => {
    systemLight(true);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
    expect(html().contains('light')).toBe(true);
  });

  it('a saved choice beats the system preference', () => {
    systemLight(true);
    localStorage.setItem('devscale.theme', 'dark');
    expect(renderHook(() => useTheme()).result.current.theme).toBe('dark');
  });

  it('ignores a corrupt saved value', () => {
    localStorage.setItem('devscale.theme', 'purple');
    expect(renderHook(() => useTheme()).result.current.theme).toBe('dark');
  });

  it('toggle flips the theme, the page class and the saved choice', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggle());
    expect(result.current.theme).toBe('light');
    expect(html().contains('light')).toBe(true);
    expect(html().contains('dark')).toBe(false);
    expect(localStorage.getItem('devscale.theme')).toBe('light');
    act(() => result.current.toggle());
    expect(result.current.theme).toBe('dark');
    expect(localStorage.getItem('devscale.theme')).toBe('dark');
  });

  it('every component sees the same theme (header, charts, sign-in)', () => {
    const a = renderHook(() => useTheme());
    const b = renderHook(() => useTheme());
    act(() => a.result.current.toggle());
    expect(b.result.current.theme).toBe('light');
  });

  it('survives blocked storage: the toggle still works for this visit', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
    act(() => result.current.toggle());
    expect(result.current.theme).toBe('light');
  });

  it('ignores an invalid value passed to setTheme', () => {
    const { result } = renderHook(() => useTheme());
    act(() => setTheme('sepia'));
    expect(result.current.theme).toBe('dark');
  });

  it('re-renders subscribers when the theme changes from outside a component', () => {
    function Probe() { return <p>{useTheme().theme}</p>; }
    render(<Probe />);
    expect(screen.getByText('dark')).toBeTruthy();
    act(() => setTheme('light'));
    expect(screen.getByText('light')).toBeTruthy();
  });
});

describe('Clerk appearance', () => {
  it('has a dark and a light variant, and falls back to dark', () => {
    expect(clerkAppearanceFor('dark').variables.colorBackground).toBe('#171d28');
    expect(clerkAppearanceFor('light').variables.colorBackground).toBe('#ffffff');
    expect(clerkAppearanceFor('nonsense').variables.colorBackground).toBe('#171d28');
    expect(clerkAppearanceFor('light').elements.footerAction).toEqual({ display: 'none' });
  });
});
