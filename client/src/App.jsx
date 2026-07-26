import { useMemo, useState } from 'react';
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
import { Loader2 } from 'lucide-react';

function AppInner() {
  const { configured, jobs, loading } = useJobs();
  const { theme, toggle } = useTheme();
  const [view, setView] = useState('dashboard');
  const [search, setSearch] = useState('');
  const [jobModal, setJobModal] = useState({ open: false, job: null });
  const [importOpen, setImportOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) =>
      `${j.company} ${j.role} ${j.location}`.toLowerCase().includes(q)
    );
  }, [jobs, search]);

  if (!configured) return <Setup />;

  return (
    <>
      <Layout
        view={view}
        setView={setView}
        search={search}
        setSearch={setSearch}
        onAdd={() => setJobModal({ open: true, job: null })}
        onImport={() => setImportOpen(true)}
        theme={theme}
        toggleTheme={toggle}
      >
        {view === 'progress' ? (
          <Progress />
        ) : loading && jobs.length === 0 ? (
          <div className="flex items-center justify-center py-24" style={{ color: 'var(--text-muted)' }}>
            <Loader2 size={20} className="animate-spin mr-2" /> Loading your jobs…
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState onAdd={() => setJobModal({ open: true, job: null })} onImport={() => setImportOpen(true)} />
        ) : (
          <>
            {view === 'dashboard' && <Dashboard jobs={jobs} onOpen={(job) => setJobModal({ open: true, job })} />}
            {view === 'board' && <Board jobs={filtered} onOpen={(job) => setJobModal({ open: true, job })} />}
            {view === 'table' && <TableView jobs={filtered} onOpen={(job) => setJobModal({ open: true, job })} />}
          </>
        )}
      </Layout>

      <JobModal open={jobModal.open} job={jobModal.job} onClose={() => setJobModal({ open: false, job: null })} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
      <AIAssistant />
    </>
  );
}

function EmptyState({ onAdd, onImport }) {
  return (
    <div className="text-center py-20">
      <p className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>No jobs yet</p>
      <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>Add your first job, or import your existing list from Google Sheets.</p>
      <div className="flex items-center justify-center gap-2">
        <button onClick={onAdd} className="rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ background: 'var(--brand)' }}>
          Add a job
        </button>
        <button onClick={onImport} className="rounded-lg px-4 py-2 text-sm border" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
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
