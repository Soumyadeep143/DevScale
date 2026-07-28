import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getConfig, setConfig, clearConfig } from '../lib/config';
import * as api from '../lib/api';

const JobsContext = createContext(null);

export function JobsProvider({ children }) {
  const [configured, setConfigured] = useState(() => !!getConfig());
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

  const refresh = useCallback(async () => {
    if (!getConfig()) return;
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
      const delay = consecutiveFailures.current >= 3 ? 30000 : 10000;
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

  const connect = useCallback(async (url, token) => {
    await api.ping(url, token);
    setConfig({ url, token });
    setConfigured(true);
  }, []);

  const disconnect = useCallback(() => {
    clearConfig();
    setConfigured(false);
    setJobs([]);
  }, []);

  const addJob = useCallback(async (job) => {
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic = { ...job, id: tempId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    setJobs((prev) => [optimistic, ...prev]);
    inFlightMutations.current += 1;
    try {
      const created = await api.createJob(job);
      setJobs((prev) => prev.map((j) => (j.id === tempId ? created : j)));
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

  // Moving a lead out of the "Lead" stage isn't a normal field edit — it's a
  // cross-sheet move. The server just flips the leads sheet's "Applied"
  // checkbox and lets that sheet's own existing automation copy the row
  // into the tracker (with its own dedup check). We don't get the new
  // tracker row back synchronously, so: optimistically drop the lead card,
  // then refetch shortly after to pick up the real tracker row once that
  // trigger has run.
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
      await api.updateJob(id, { status });
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
    () => ({ configured, jobs, loading, error, lastSynced, refresh, connect, disconnect, addJob, editJob, promoteLead, removeJob, importJobs }),
    [configured, jobs, loading, error, lastSynced, refresh, connect, disconnect, addJob, editJob, promoteLead, removeJob, importJobs]
  );

  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>;
}

export function useJobs() {
  const ctx = useContext(JobsContext);
  if (!ctx) throw new Error('useJobs must be used within JobsProvider');
  return ctx;
}
