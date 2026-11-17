import { useSyncExternalStore } from 'react';

// Light / dark theme, shared by every component that asks for it (the header toggle, the charts,
// the sign-in screens). The choice is remembered; with no saved choice it follows the system.
// Storage can be blocked (private windows), so every access is guarded and the app still works.
const KEY = 'devscale.theme';
const listeners = new Set();
let current = null;

function systemTheme() {
  try {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch { return 'dark'; }
}
function saved() {
  try {
    const t = window.localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : null;
  } catch { return null; }
}
function apply(theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');
}
function read() {
  if (!current) { current = saved() || systemTheme(); apply(current); }
  return current;
}
export function setTheme(next) {
  if (next !== 'light' && next !== 'dark') return;
  current = next;
  apply(next);
  try { window.localStorage.setItem(KEY, next); } catch { /* a convenience only */ }
  listeners.forEach((l) => l());
}
// For tests: forget the in-memory choice so the next read starts from storage/system again.
export function resetThemeForTests() { current = null; listeners.clear(); }

function subscribe(cb) { listeners.add(cb); return () => listeners.delete(cb); }

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, read, () => 'dark');
  return { theme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark'), setTheme };
}
