import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { JobsProvider, useJobs } from './context/JobsContext';
import { useTheme } from './lib/useTheme';
import AuthScreen from './components/AuthScreen';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Board from './components/Board';
import TableView from './components/TableView';
import Progress from './components/Progress';
import JobModal from './components/JobModal';
import ImportModal from './components/ImportModal';
import AIAssistant from './components/AIAssistant';
import NotesPanel from './components/NotesPanel';
import PeersPanel from './components/PeersPanel';
import TeamDashboard from './components/team/TeamDashboard';
import TeamLeads from './components/team/TeamLeads';
import TeamContacts from './components/team/TeamContacts';
import TeamActivity from './components/team/TeamActivity';
import TeamGuide from './components/team/TeamGuide';
import ContactsPanel from './components/ContactsPanel';
import Analytics from './components/Analytics';
import MyLeads from './components/MyLeads';
import TeamNotes from './components/team/TeamNotes';
import { personalJobs } from './lib/personal';
import Guide from './components/Guide';
import ProfilePage from './components/ProfilePage';
import { useIsProfileRoute } from './lib/profileRoute';
import { useWorkspaceRoute } from './lib/useWorkspaceRoute';
import { Loader2, Briefcase } from 'lucide-react';
import LoadingSkeleton from './components/ui/LoadingSkeleton';

function AppInner() {
  const { session, configured, jobs, loading } = useJobs();
  // The Personal pages show only what lives in Personal: a lead moved to Team has left it.
  const mine = useMemo(() => personalJobs(jobs), [jobs]);
  const { theme } = useTheme();
  // Two workspaces (Personal / Team); workspace + tab live in the URL hash (see useWorkspaceRoute).
  const { workspace, view, setWorkspace, setView, go } = useWorkspaceRoute();
  const onProfile = useIsProfileRoute();
  // listIds is the ordered set of job ids the modal was opened from (a
  // Board column, the Table's current sort, Dashboard's recent list) — kept
  // as ids rather than a frozen array of job objects so Prev/Next and the
  // post-promotion auto-advance below always look at live job data (an
  // edited field, a status change) instead of a stale snapshot from the
  // moment the modal opened.
  const [jobModal, setJobModal] = useState({ open: false, job: null, listIds: null });
  const [importOpen, setImportOpen] = useState(false);
  // Team quick actions ("Share Lead", "Connect Peer"…) open a page and then ask it to start that action.
  const [teamIntent, setTeamIntent] = useState(null);
  const clearIntent = useCallback(() => setTeamIntent(null), []);
  const goTeam = useCallback((nextView, action = null) => {
    setTeamIntent(action);
    go('team', nextView);
  }, [go]);

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

  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--page)' }}>
        <Loader2 className="animate-spin" size={22} style={{ color: 'var(--text-muted)' }} />
      </div>
    );
  }
  if (!configured) return <AuthScreen />;

  return (
    <>
      <Layout
        workspace={workspace}
        setWorkspace={setWorkspace}
        view={onProfile ? '' : view}
        setView={setView}
      >
        {onProfile ? (
          <ProfilePage onBack={() => setView(view)} />
        ) : workspace === 'team' ? (
          view === 'leads' ? (
            <TeamLeads key="team-leads" intent={teamIntent} onIntentDone={clearIntent} onNavigate={goTeam} />
          ) : view === 'contacts' ? (
            <TeamContacts key="team-contacts" intent={teamIntent} onIntentDone={clearIntent} onNavigate={goTeam} />
          ) : view === 'notes' ? (
            <TeamNotes key="team-notes" intent={teamIntent} onIntentDone={clearIntent} onNavigate={goTeam} />
          ) : view === 'peers' ? (
            <PeersPanel intent={teamIntent} onIntentDone={clearIntent} />
          ) : view === 'activity' ? (
            <TeamActivity onNavigate={goTeam} />
          ) : view === 'guide' ? (
            <TeamGuide />
          ) : (
            <TeamDashboard onNavigate={goTeam} />
          )
        ) : view === 'progress' ? (
          <Progress />
        ) : view === 'notes' ? (
          <NotesPanel />
        ) : view === 'leads' ? (
          <MyLeads key="personal-leads" onOpen={openJobModal} onAdd={() => openJobModal()} onImport={() => setImportOpen(true)} />
        ) : view === 'contacts' ? (
          <ContactsPanel key="personal-contacts" mode="personal" />
        ) : view === 'graph' ? (
          <Analytics jobs={mine} theme={theme} onOpen={openJobModal} onOpenNotes={() => setView('notes')} />
        ) : view === 'guide' ? (
          <Guide />
        ) : loading && jobs.length === 0 ? (
          <div className="max-w-3xl mx-auto"><LoadingSkeleton rows={5} label="Loading your jobs" /></div>
        ) : view === 'board' ? (
          <Board jobs={mine} onOpen={openJobModal} onAdd={() => openJobModal()} />
        ) : view === 'table' ? (
          <TableView jobs={mine} onOpen={openJobModal} onAdd={() => openJobModal()} onImport={() => setImportOpen(true)} />
        ) : mine.length === 0 ? (
          <EmptyState onAdd={() => openJobModal()} onImport={() => setImportOpen(true)} />
        ) : (
          <Dashboard jobs={mine} onOpen={openJobModal} onAdd={() => openJobModal()} onImport={() => setImportOpen(true)} onNavigate={setView} />
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
      <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>Add your first job, or import your existing list.</p>
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
