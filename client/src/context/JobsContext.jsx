import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth, useClerk, useUser } from '@clerk/clerk-react';
import * as api from '../lib/api';
import { applyJobChange } from '../lib/jobChanges';
import { SharedUpdatesContext, createSharedBus } from '../lib/sharedUpdates';

const JobsContext = createContext(null);

export function JobsProvider({ children }) {
  // Authentication is Clerk's. Once Clerk says we're signed in, the database account behind that
  // Clerk user is made sure of (ensure_identity) before the app opens; until then `session` stays
  // undefined and the app shows its loading state.
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { user } = useUser();
  const clerk = useClerk();
  const [identity, setIdentity] = useState('idle'); // idle | pending | ready | failed
  const [authError, setAuthError] = useState('');
  const [userUuid, setUserUuid] = useState(null);
  const sharedBus = useMemo(() => createSharedBus(), []);
  const syncedName = useRef(null);
  useEffect(() => () => sharedBus.dispose(), [sharedBus]);
  const [attempt, setAttempt] = useState(0);
  const displayName = user ? (user.fullName || user.firstName || user.primaryEmailAddress?.emailAddress?.split('@')[0] || '') : '';
  const email = user?.primaryEmailAddress?.emailAddress || '';

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) {
      setIdentity('idle');
      setAuthError('');
      return undefined;
    }
    let cancelled = false;
    setIdentity('pending');
    setAuthError('');
    api.ensureIdentity(displayName)
      .then((uuid) => { if (!cancelled) { setUserUuid(uuid || null); setIdentity('ready'); } })
      .catch((err) => {
        if (cancelled) return;
        setAuthError(err.message || 'Could not set up your account.');
        setIdentity('failed');
      });
    return () => { cancelled = true; };
    // displayName is only a hint for first-time profile creation; re-running on its change would be wasted work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, userId, attempt]);

  // Clerk owns a person's name. When it changes (or on sign-in), copy it to the profile peers read.
  // Only a real name is copied: a stand-in made from the email must never overwrite a name set earlier.
  const realName = user ? (user.fullName || user.firstName || '') : '';
  useEffect(() => {
    if (identity !== 'ready' || !userUuid || !realName || syncedName.current === realName) return;
    syncedName.current = realName;
    api.updateMyDisplayName?.(userUuid, realName)?.catch?.(() => { syncedName.current = null; }); // retry on the next change
  }, [identity, userUuid, realName]);

  const session = useMemo(() => {
    if (!isLoaded) return undefined;
    if (!isSignedIn) return null;
    if (identity === 'ready') return { user: { id: userId, email, user_metadata: { display_name: displayName } } };
    return identity === 'failed' ? null : undefined;
  }, [isLoaded, isSignedIn, identity, userId, email, displayName]);
  const recovery = false; // password recovery happens inside Clerk's own screens
  const configured = !!session;
  const retryAuth = useCallback(() => setAttempt((n) => n + 1), []);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastSynced, setLastSynced] = useState(null);

  // A scheduled poll that lands mid-add/edit/delete would refetch a stale
  // list and clobber the optimistic update while the real write is still in
  // flight — this tracks how many mutations are currently in flight so
  // refresh() can just skip that cycle (it'll pick up the settled state on
  // the next poll instead). consecutiveFailures drives poll backoff below.
  const inFlightMutations = useRef(0);
  const consecutiveFailures = useRef(0);
  // True while the live-update channel is connected; the periodic refresh then only backs it up.
  const liveConnected = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlightMutations.current > 0) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.fetchJobs();
      setJobs(data);
      setLastSynced(new Date());
      consecutiveFailures.current = 0;
    } catch (err) {
      consecutiveFailures.current += 1;
      setError(err.message || 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  // Always load once as soon as we're configured, regardless of visibility
  // state (which isn't reliable to read at mount time in every browser).
  useEffect(() => {
    if (configured) refresh();
  }, [configured, refresh]);

  // Live updates: a lead or job added, changed or removed anywhere (another tab, a scraper, the
  // database) appears here immediately instead of at the next refresh. After a dropped connection
  // the list is reloaded once, because events sent while it was down are not replayed.
  useEffect(() => {
    if (!configured) return undefined;
    let everConnected = false;
    const stop = api.subscribeToJobChanges({
      onChange: (table, payload) => {
        // Contacts and notes have no entry in this list; pages that show them reload. Jobs/leads are applied
        // in place, and pages that load leads on their own (sharing views) reload too.
        if (table !== 'contacts' && table !== 'notes') setJobs((prev) => applyJobChange(prev, table, payload));
        if (table !== 'jobs') sharedBus.emit(table);
      },
      onStatus: (status) => {
        const up = status === 'SUBSCRIBED';
        if (up && everConnected) refresh();
        if (up) everConnected = true;
        liveConnected.current = up;
      },
    });
    return () => { stop?.(); liveConnected.current = false; };
  }, [configured, refresh, sharedBus]);

  // Things shared with this user (leads, contacts, peers) change in other people's rows, which the
  // table feed above can't see. The database signals them on a private topic; pages showing shared
  // data reload when told. After a dropped connection everything is reloaded once.
  useEffect(() => {
    if (!configured || !userUuid) return undefined;
    let everConnected = false;
    const stop = api.subscribeToSharedUpdates({
      userUuid,
      onSignal: (kind) => sharedBus.emit(kind),
      onStatus: (status) => {
        if (status !== 'SUBSCRIBED') return;
        if (everConnected) sharedBus.emit('all'); // events sent while we were disconnected are not replayed
        everConnected = true;
      },
    });
    return () => stop?.();
  }, [configured, userUuid, sharedBus]);

  // Keeps the app in sync with edits made by hand directly in the Google
  // Sheet: polls while the tab is actually visible (so a manual sheet edit
  // shows up here almost immediately), pauses entirely when the tab is
  // backgrounded to save quota/battery, and refreshes right away the moment
  // it becomes visible again. The interval itself backs off to 30s after 3
  // consecutive failures (e.g. the tracker reporting itself busy under load)
  // instead of hammering it every 10s, and recovers to 10s on the next
  // success.
  useEffect(() => {
    if (!configured) return;
    let timer = null;
    let cancelled = false;

    function scheduleNext() {
      if (cancelled) return;
      const delay = consecutiveFailures.current >= 3 ? 30000 : liveConnected.current ? 60000 : 10000;
      timer = setTimeout(async () => {
        await refresh();
        scheduleNext();
      }, delay);
    }
    function stopPolling() {
      if (timer) clearTimeout(timer);
      timer = null;
    }
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        stopPolling();
        refresh();
        scheduleNext();
      } else {
        stopPolling();
      }
    }

    if (document.visibilityState === 'visible') scheduleNext();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onVisibilityChange);

    return () => {
      cancelled = true;
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onVisibilityChange);
    };
  }, [configured, refresh]);

  const signOut = useCallback(async () => {
    setJobs([]);
    await clerk.signOut();
  }, [clerk]);

  const addJob = useCallback(async (job) => {
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic = { ...job, id: tempId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    setJobs((prev) => [optimistic, ...prev]);
    inFlightMutations.current += 1;
    try {
      const created = await api.createJob(job);
      // The live feed can deliver the new row before this call returns: never keep it twice.
      setJobs((prev) => (prev.some((j) => j.id === created.id)
        ? prev.filter((j) => j.id !== tempId)
        : prev.map((j) => (j.id === tempId ? created : j))));
      return created;
    } catch (err) {
      setJobs((prev) => prev.filter((j) => j.id !== tempId));
      throw err;
    } finally {
      inFlightMutations.current -= 1;
    }
  }, []);

  const editJob = useCallback(async (id, patch) => {
    let prevJob;
    setJobs((prev) =>
      prev.map((j) => {
        if (j.id === id) {
          prevJob = j;
          return { ...j, ...patch };
        }
        return j;
      })
    );
    inFlightMutations.current += 1;
    try {
      const updated = await api.updateJob(id, patch);
      if (updated) setJobs((prev) => prev.map((j) => (j.id === id ? updated : j)));
      return updated;
    } catch (err) {
      if (prevJob) setJobs((prev) => prev.map((j) => (j.id === id ? prevJob : j)));
      throw err;
    } finally {
      inFlightMutations.current -= 1;
    }
  }, []);

  // Moving a lead out of the "Lead" stage is a cross-table move, done
  // atomically server-side by the promote_lead() RPC (which also dedups on
  // company+role). Optimistically drop the lead card, then add the resulting
  // job from the RPC's return value.
  const promoteLead = useCallback(async (id, status) => {
    let removed;
    let index;
    setJobs((prev) => {
      index = prev.findIndex((j) => j.id === id);
      removed = prev[index];
      return prev.filter((j) => j.id !== id);
    });
    inFlightMutations.current += 1;
    try {
      const promoted = await api.updateJob(id, { status });
      if (promoted) setJobs((prev) => (prev.some((j) => j.id === promoted.id) ? prev : [promoted, ...prev]));
    } catch (err) {
      if (removed) {
        setJobs((prev) => {
          const next = [...prev];
          next.splice(index, 0, removed);
          return next;
        });
      }
      throw err;
    } finally {
      inFlightMutations.current -= 1;
      setTimeout(refresh, 1500);
    }
  }, [refresh]);

  const removeJob = useCallback(async (id) => {
    let removed;
    let index;
    setJobs((prev) => {
      index = prev.findIndex((j) => j.id === id);
      removed = prev[index];
      return prev.filter((j) => j.id !== id);
    });
    inFlightMutations.current += 1;
    try {
      await api.deleteJob(id);
    } catch (err) {
      if (removed) {
        setJobs((prev) => {
          const next = [...prev];
          next.splice(index, 0, removed);
          return next;
        });
      }
      throw err;
    } finally {
      inFlightMutations.current -= 1;
    }
  }, []);

  const importJobs = useCallback(async (newJobs) => {
    inFlightMutations.current += 1;
    let count;
    try {
      count = await api.bulkImportJobs(newJobs);
    } finally {
      // Decrement before the explicit refresh below — refresh() itself
      // skips its fetch while any mutation is still in flight, and this
      // one is the whole point of finishing an import.
      inFlightMutations.current -= 1;
    }
    await refresh();
    return count;
  }, [refresh]);

  const value = useMemo(
    () => ({ session, configured, recovery, authError, retryAuth, jobs, loading, error, lastSynced, refresh, signOut, addJob, editJob, promoteLead, removeJob, importJobs }),
    [session, configured, recovery, authError, retryAuth, jobs, loading, error, lastSynced, refresh, signOut, addJob, editJob, promoteLead, removeJob, importJobs]
  );

  return (
    <JobsContext.Provider value={value}>
      <SharedUpdatesContext.Provider value={sharedBus}>{children}</SharedUpdatesContext.Provider>
    </JobsContext.Provider>
  );
}

export function useJobs() {
  const ctx = useContext(JobsContext);
  if (!ctx) throw new Error('useJobs must be used within JobsProvider');
  return ctx;
}
