import { useSyncExternalStore } from 'react';

// The profile page lives at #/profile, outside the workspace tabs (it belongs to the person, not to
// Personal or Team). Clicking any tab or the workspace switch changes the hash and leaves it.
export const PROFILE_HASH = '#/profile';

const subscribe = (cb) => { window.addEventListener('hashchange', cb); return () => window.removeEventListener('hashchange', cb); };
const read = () => window.location.hash === PROFILE_HASH || window.location.hash.startsWith(`${PROFILE_HASH}/`);

export function useIsProfileRoute() {
  return useSyncExternalStore(subscribe, read, () => false);
}
export function openProfile() {
  if (window.location.hash !== PROFILE_HASH) window.location.hash = PROFILE_HASH;
}
