import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { JobsProvider, useJobs } from './context/JobsContext';
import { useTheme } from './lib/useTheme';
import Setup from './components/Setup';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Board from './components/Board';
import TableView from './components/TableView';
import Progress from './components/Progress';
import JobModal from './components/JobModal';
import ImportModal from './components/ImportModal';
import AIAssistant from './components/AIAssistant';
import NotesPanel from './components/NotesPanel';
import GraphView from './components/GraphView';
import Guide from './components/Guide';
import { Loader2, Briefcase } from 'lucide-react';

function AppInner() {
  const { configured, jobs, loading } = useJobs();
  const { theme, toggle } = useTheme();
  const [view, setView] = useState('dashboard');
  const [search, setSearch] = useState('');
  // listIds is the ordered set of job ids the modal was opened from (a
  // Board column, the Table's current sort, Dashboard's recent list) — kept
  // as ids rather than a frozen array of job objects so Prev/Next and the
  // post-promotion auto-advance below always look at live job data (an
  // edited field, a status change) instead of a stale snapshot from the
  // moment the modal opened.
  const [jobModal, setJobModal] = useState({ open: false, job: null, listIds: null });
  const [importOpen, setImportOpen] = useState(false);

  // JobModal's onSubmit is an async handler that keeps running after the
  // component that captured it has moved on to a later render — reading
  // `jobs` through a ref (rather than closing over the value from whatever
  // render handed down the callback) guarantees advanceLeadQueue below sees
  // the just-promoted job's removal instead of a stale pre-promotion list.
  const jobsRef = useRef(jobs);
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  const openJobModal = useCallback((job = null, list = null) => {
    setJobModal({ open: true, job, listIds: list ? list.map((j) => j.id) : null });
  }, []);
  const closeJobModal = useCallback(() => setJobModal({ open: false, job: null, listIds: null }), []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) =>
      `${j.company} ${j.role} ${j.location}`.toLowerCase().includes(q)
    );
  }, [jobs, search]);

  // Re-derived from live `jobs` on every render (not stored as-is) so the
  // list a Prev/Next pair walks stays correct as items get edited or
  // promoted out of it — order is still the order captured at open time,
  // just with each id's current data (or its absence, once removed).
  const jobModalList = useMemo(() => {
    if (!jobModal.listIds) return null;
    const byId = new Map(jobs.map((j) => [j.id, j]));
    return jobModal.listIds.map((id) => byId.get(id)).filter(Boolean);
  }, [jobModal.listIds, jobs]);
  const jobModalIndex = jobModalList && jobModal.job
    ? jobModalList.findIndex((j) => j.id === jobModal.job.id)
    : -1;

  function goToJobOffset(offset) {
    if (!jobModalList || jobModalIndex === -1) return;
    const next = jobModalList[jobModalIndex + offset];
    if (next) setJobModal((m) => ({ ...m, job: next }));
  }

  // Called by JobModal once a lead has actually been promoted — advances to
  // whatever lead is still left in the same queue instead of closing, but
  // falls back to closing once the queue's been worked through. Reads
  // jobsRef rather than the `jobs` this render captured because promotion
  // is asynchronous: by the time this runs, JobsContext's optimistic
  // removal has already landed in a later render this closure can't see.
  const advanceLeadQueue = useCallback((listIds, promotedId) => {
    const liveJobs = jobsRef.current;
    const byId = new Map(liveJobs.map((j) => [j.id, j]));
    const promotedIdx = listIds.indexOf(promotedId);
    const rest = [...listIds.slice(promotedIdx + 1), ...listIds.slice(0, promotedIdx)];
    const nextLead = rest.map((id) => byId.get(id)).find((j) => j && j.status === 'lead');
    if (nextLead) {
      setJobModal((m) => ({ ...m, job: nextLead }));
    } else {
      closeJobModal();
    }
  }, [closeJobModal]);

  if (!configured) return <Setup />;

  return (
    <>
      <Layout
        view={view}
        setView={setView}
        search={search}
        setSearch={setSearch}
        onAdd={() => openJobModal()}
        onImport={() => setImportOpen(true)}
        theme={theme}
        toggleTheme={toggle}
      >
        {view === 'progress' ? (
          <Progress />
        ) : view === 'notes' ? (
          <NotesPanel />
        ) : view === 'graph' ? (
          <GraphView theme={theme} onOpen={openJobModal} onOpenNotes={() => setView('notes')} />
        ) : view === 'guide' ? (
          <Guide />
        ) : loading && jobs.length === 0 ? (
          <div className="flex items-center justify-center py-24" style={{ color: 'var(--text-muted)' }}>
            <Loader2 size={20} className="animate-spin mr-2" /> Loading your jobs…
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState onAdd={() => openJobModal()} onImport={() => setImportOpen(true)} />
        ) : (
          <>
            {view === 'dashboard' && <Dashboard jobs={jobs} onOpen={openJobModal} />}
            {view === 'board' && <Board jobs={filtered} onOpen={openJobModal} />}
            {view === 'table' && <TableView jobs={filtered} onOpen={openJobModal} />}
          </>
        )}
      </Layout>

      <JobModal
        open={jobModal.open}
        job={jobModal.job}
        onClose={closeJobModal}
        hasPrev={jobModalIndex > 0}
        hasNext={jobModalList != null && jobModalIndex !== -1 && jobModalIndex < jobModalList.length - 1}
        onPrev={() => goToJobOffset(-1)}
        onNext={() => goToJobOffset(1)}
        onPromoted={jobModal.listIds ? (promotedId) => advanceLeadQueue(jobModal.listIds, promotedId) : null}
      />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
      <AIAssistant />
    </>
  );
}

function EmptyState({ onAdd, onImport }) {
  return (
    <div className="text-center py-20">
      <div
        className="mx-auto mb-4 w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ background: 'color-mix(in oklab, var(--brand) 12%, var(--surface))' }}
      >
        <Briefcase size={24} style={{ color: 'var(--brand)' }} />
      </div>
      <p className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>No jobs yet</p>
      <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>Add your first job, or import your existing list from Google Sheets.</p>
      <div className="flex items-center justify-center gap-2">
        <button onClick={onAdd} className="rounded-lg px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity" style={{ background: 'var(--brand)' }}>
          Add a job
        </button>
        <button onClick={onImport} className="rounded-lg px-4 py-2.5 text-sm border hover:opacity-80 transition-opacity" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
          Import
        </button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <JobsProvider>
      <AppInner />
    </JobsProvider>
  );
}
