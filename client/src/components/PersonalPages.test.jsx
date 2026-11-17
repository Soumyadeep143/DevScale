import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const ctx = vi.hoisted(() => ({
  jobs: [], editJob: vi.fn(), promoteLead: vi.fn(), removeJob: vi.fn(), refresh: vi.fn(),
}));
vi.mock('../context/JobsContext', () => ({
  useJobs: () => ({ ...ctx, session: { user: { user_metadata: { display_name: 'Vidip Ghosh' } } } }),
}));
vi.mock('../lib/api', () => ({
  setLeadVisibility: vi.fn().mockResolvedValue({}),
  fetchNotes: vi.fn(), createNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn(),
}));
// recharts needs layout; render charts as inert markers.
vi.mock('recharts', () => {
  const Box = ({ children }) => <div>{children}</div>;
  const names = ['ResponsiveContainer', 'BarChart', 'Bar', 'AreaChart', 'Area', 'PieChart', 'Pie', 'Cell', 'XAxis', 'YAxis', 'CartesianGrid', 'Tooltip'];
  return Object.fromEntries(names.map((n) => [n, Box]));
});
vi.mock('./GraphView', () => ({ default: () => <div>network-graph</div> }));

import * as api from '../lib/api';
import Dashboard from './Dashboard';
import Board from './Board';
import TableView from './TableView';
import MyLeads from './MyLeads';
import Analytics from './Analytics';
import NotesPanel from './NotesPanel';

const today = new Date().toISOString().slice(0, 10);
const job = (o) => ({
  id: String(Math.random()), company: 'Acme', role: 'Dev', status: 'applied', source: 'LinkedIn', location: 'Remote',
  dateApplied: today, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), notes: '', contact: '', ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  window.matchMedia = undefined;
  ctx.jobs = [
    job({ id: 'a', company: 'Google', status: 'applied' }),
    job({ id: 'b', company: 'Meta', status: 'interviewing' }),
    job({ id: 'c', company: 'Stripe', status: 'rejected' }),
    job({ id: 'l-d', company: 'Netflix', status: 'lead', visibility: 'personal', dateApplied: '' }),
    job({ id: 'e', company: 'Apple', status: 'offer' }),
  ];
});
afterEach(() => cleanup());

describe('Dashboard', () => {
  it('greets the user and shows real counts', () => {
    render(<Dashboard jobs={ctx.jobs} onOpen={vi.fn()} onAdd={vi.fn()} onImport={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good (morning|afternoon|evening), Vidip!$/);
    const total = screen.getByText('Total Leads').parentElement;
    expect(within(total).getByText('5')).toBeTruthy();
    expect(screen.getAllByText('Meta').length).toBeGreaterThan(0); // interviewing list
  });

  it('wires Add Job and Import', () => {
    const onAdd = vi.fn(); const onImport = vi.fn();
    render(<Dashboard jobs={ctx.jobs} onOpen={vi.fn()} onAdd={onAdd} onImport={onImport} />);
    fireEvent.click(screen.getByText('Add Job'));
    fireEvent.click(screen.getByText('Import'));
    expect(onAdd).toHaveBeenCalled();
    expect(onImport).toHaveBeenCalled();
  });
});

describe('Board', () => {
  const drop = (columnName, id) => {
    const col = screen.getByRole('region', { name: `${columnName} column` });
    fireEvent.drop(col, { dataTransfer: { getData: () => id } });
  };

  it('shows every status column', () => {
    render(<Board jobs={ctx.jobs} onOpen={vi.fn()} onAdd={vi.fn()} />);
    for (const n of ['Lead', 'Applied', 'Interviewing', 'Offer', 'Rejected']) expect(screen.getByRole('region', { name: `${n} column` })).toBeTruthy();
  });

  it('dropping a card on another column updates that job only', async () => {
    render(<Board jobs={ctx.jobs} onOpen={vi.fn()} onAdd={vi.fn()} />);
    drop('Interviewing', 'a');
    await waitFor(() => expect(ctx.editJob).toHaveBeenCalledWith('a', { status: 'interviewing' }));
    expect(ctx.editJob).toHaveBeenCalledTimes(1);
  });

  it('promotes a lead when it is dropped on a tracked stage', async () => {
    render(<Board jobs={ctx.jobs} onOpen={vi.fn()} onAdd={vi.fn()} />);
    drop('Applied', 'l-d');
    await waitFor(() => expect(ctx.promoteLead).toHaveBeenCalledWith('l-d', 'applied'));
  });

  it('refuses to move a tracked job back to Lead', async () => {
    render(<Board jobs={ctx.jobs} onOpen={vi.fn()} onAdd={vi.fn()} />);
    drop('Lead', 'a');
    expect((await screen.findByRole('alert')).textContent).toMatch(/back to Leads/);
    expect(ctx.editJob).not.toHaveBeenCalled();
  });

  it('searches by company', () => {
    render(<Board jobs={ctx.jobs} onOpen={vi.fn()} onAdd={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Search board'), { target: { value: 'goog' } });
    expect(screen.getByText('Google')).toBeTruthy();
    expect(screen.queryByText('Meta')).toBeNull();
  });
});

describe('TableView', () => {
  it('filters by status and searches', () => {
    render(<TableView jobs={ctx.jobs} onOpen={vi.fn()} onAdd={vi.fn()} onImport={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'rejected' } });
    expect(screen.getByText('Stripe')).toBeTruthy();
    expect(screen.queryByText('Google')).toBeNull();
  });

  it('loads rows a chunk at a time and says when all are loaded', () => {
    ctx.jobs = Array.from({ length: 70 }, (_, i) => job({ id: `p${i}`, company: `Co${String(i).padStart(2, '0')}` }));
    render(<TableView jobs={ctx.jobs} onOpen={vi.fn()} onAdd={vi.fn()} onImport={vi.fn()} />);
    expect(screen.getAllByLabelText(/^Select Co/)).toHaveLength(30);
    expect(screen.getByText('Showing 30 of 70')).toBeTruthy();
    fireEvent.click(screen.getByText('Load more'));
    expect(screen.getAllByLabelText(/^Select Co/)).toHaveLength(60);
    fireEvent.click(screen.getByText('Load more'));
    expect(screen.getAllByLabelText(/^Select Co/)).toHaveLength(70);
    expect(screen.getByText('All 70 jobs loaded')).toBeTruthy();
  });

  it('bulk moves selected jobs and deletes after confirmation', async () => {
    window.matchMedia = undefined; // card layout still exposes selection
    render(<TableView jobs={ctx.jobs} onOpen={vi.fn()} onAdd={vi.fn()} onImport={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Select Google'));
    fireEvent.click(screen.getByLabelText('Select Meta'));
    const bulk = screen.getByRole('region', { name: 'Bulk actions' });
    fireEvent.change(within(bulk).getByLabelText('Move selected to'), { target: { value: 'offer' } });
    await waitFor(() => expect(ctx.editJob).toHaveBeenCalledWith('a', { status: 'offer' }));
    expect(ctx.editJob).toHaveBeenCalledWith('b', { status: 'offer' });

    fireEvent.click(screen.getByLabelText('Select Stripe'));
    fireEvent.click(screen.getByText('Delete'));
    expect(ctx.removeJob).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByText('Delete'));
    await waitFor(() => expect(ctx.removeJob).toHaveBeenCalledWith('c'));
  });
});

describe('MyLeads', () => {
  it('shows status tabs with counts and filters by tab', () => {
    render(<MyLeads onOpen={vi.fn()} onAdd={vi.fn()} onImport={vi.fn()} />);
    expect(screen.getByRole('tab', { name: /All \(5\)/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Leads \(1\)/ }));
    expect(screen.getByText('Netflix')).toBeTruthy();
    expect(screen.queryByText('Google')).toBeNull();
  });

  it('moves an open lead to Team and refreshes', async () => {
    render(<MyLeads onOpen={vi.fn()} onAdd={vi.fn()} onImport={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /Leads \(1\)/ }));
    fireEvent.click(screen.getByLabelText('Move Netflix to Team'));
    await waitFor(() => expect(api.setLeadVisibility).toHaveBeenCalledWith('d', 'peer'));
    await waitFor(() => expect(ctx.refresh).toHaveBeenCalled());
    expect((await screen.findByRole('status')).textContent).toMatch(/Moved Netflix to Team/);
  });

  it('only open leads can move; applied jobs stay personal', () => {
    render(<MyLeads onOpen={vi.fn()} onAdd={vi.fn()} onImport={vi.fn()} />);
    expect(screen.getAllByLabelText(/to Team$/)).toHaveLength(1); // only Netflix, the lead
  });

  it('a lead already moved to Team is not in the Personal list or counts', () => {
    ctx.jobs = [...ctx.jobs, job({ id: 'l-z', company: 'Shared Co', status: 'lead', visibility: 'peer', dateApplied: '' })];
    render(<MyLeads onOpen={vi.fn()} onAdd={vi.fn()} onImport={vi.fn()} />);
    expect(screen.queryByText('Shared Co')).toBeNull();
    expect(screen.getByRole('tab', { name: /All \(5\)/ })).toBeTruthy(); // still the 5 personal ones
  });

  it('searches by location', () => {
    ctx.jobs = [job({ company: 'A1', location: 'Pune' }), job({ company: 'B1', location: 'Berlin' })];
    render(<MyLeads onOpen={vi.fn()} onAdd={vi.fn()} onImport={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Search leads'), { target: { value: 'berlin' } });
    expect(screen.getByText('B1')).toBeTruthy();
    expect(screen.queryByText('A1')).toBeNull();
  });
});

describe('Analytics', () => {
  it('withholds conversion percentages when there is too little data', () => {
    render(<Analytics jobs={ctx.jobs.slice(0, 3)} onOpen={vi.fn()} onOpenNotes={vi.fn()} />);
    expect(screen.getAllByText(/Needs (at least )?5/).length).toBeGreaterThan(0);
    expect(screen.queryByText('%', { exact: false, selector: 'p.text-2xl' })).toBeNull();
  });

  it('switches to the network graph', () => {
    render(<Analytics jobs={ctx.jobs} onOpen={vi.fn()} onOpenNotes={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /Network/ }));
    expect(screen.getByText('network-graph')).toBeTruthy();
  });

  it('shows an empty state without jobs', () => {
    render(<Analytics jobs={[]} onOpen={vi.fn()} onOpenNotes={vi.fn()} />);
    expect(screen.getByText('No data to analyse yet')).toBeTruthy();
  });
});

describe('NotesPanel', () => {
  const notes = [
    { id: 'n1', content: 'System design prep\nCache invalidation notes', updated_at: new Date().toISOString() },
    { id: 'n2', content: 'Google research\nTeam and culture', updated_at: new Date().toISOString() },
  ];

  it('lists notes by title, searches, and edits one', async () => {
    api.fetchNotes.mockResolvedValue(notes);
    api.updateNote.mockResolvedValue({ ...notes[0], content: 'System design prep\nUpdated' });
    render(<NotesPanel />);
    expect(await screen.findByText('System design prep')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search notes'), { target: { value: 'google' } });
    expect(screen.queryByText('System design prep')).toBeNull();
    fireEvent.change(screen.getByLabelText('Search notes'), { target: { value: '' } });
    fireEvent.click(screen.getByText('System design prep'));
    fireEvent.change(screen.getByLabelText('Note content'), { target: { value: 'System design prep\nUpdated' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(api.updateNote).toHaveBeenCalledWith('n1', 'System design prep\nUpdated'));
  });

  it('creates and deletes notes', async () => {
    api.fetchNotes.mockResolvedValue(notes);
    api.createNote.mockResolvedValue({ id: 'n3', content: 'Fresh', updated_at: new Date().toISOString() });
    api.deleteNote.mockResolvedValue();
    render(<NotesPanel />);
    await screen.findByText('Google research');
    fireEvent.click(screen.getByText('New Note'));
    fireEvent.change(screen.getByLabelText('Note content'), { target: { value: 'Fresh' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(api.createNote).toHaveBeenCalledWith('Fresh'));
    fireEvent.click(await screen.findByLabelText('Delete note'));
    fireEvent.click(within(screen.getByRole('dialog')).getByText('Delete'));
    await waitFor(() => expect(api.deleteNote).toHaveBeenCalledWith('n3'));
  });
});
