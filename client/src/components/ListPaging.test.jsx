import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const ctx = vi.hoisted(() => ({ jobs: [], editJob: vi.fn(), promoteLead: vi.fn(), removeJob: vi.fn(), refresh: vi.fn() }));
vi.mock('../context/JobsContext', () => ({ useJobs: () => ({ ...ctx, session: null }) }));
vi.mock('../lib/api', () => ({
  setLeadVisibility: vi.fn(), fetchNotes: vi.fn(), createNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn(),
  fetchContacts: vi.fn(), fetchSharedContacts: vi.fn(), createContact: vi.fn(), updateContact: vi.fn(), deleteContact: vi.fn(),
  duplicateContact: vi.fn(), bulkCreateContacts: vi.fn(),
}));
import * as api from '../lib/api';
import MyLeads from './MyLeads';
import Board from './Board';
import NotesPanel from './NotesPanel';
import ContactsPanel from './ContactsPanel';

const job = (i, o = {}) => ({
  id: `j${i}`, company: `Company ${String(i).padStart(3, '0')}`, role: 'Dev', status: 'applied', source: 'LinkedIn', location: 'Pune',
  dateApplied: '2026-07-01', createdAt: `2026-07-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`, updatedAt: '2026-07-01T00:00:00Z', notes: '', contact: '', ...o,
});
const many = (n, o) => Array.from({ length: n }, (_, i) => job(i + 1, o));

beforeEach(() => {
  vi.clearAllMocks();
  delete globalThis.IntersectionObserver;
  window.matchMedia = undefined; // compact (card) layout
});
afterEach(() => cleanup());

describe('Leads page', () => {
  it('shows 30 at a time and resets when the search changes', () => {
    ctx.jobs = many(75);
    render(<MyLeads onOpen={vi.fn()} onAdd={vi.fn()} onImport={vi.fn()} />);
    expect(screen.getAllByText(/^Company \d{3}$/)).toHaveLength(30);
    fireEvent.click(screen.getByText('Load more'));
    expect(screen.getAllByText(/^Company \d{3}$/)).toHaveLength(60);
    fireEvent.change(screen.getByLabelText('Search leads'), { target: { value: 'company 07' } });
    expect(screen.getAllByText(/^Company \d{3}$/).length).toBeLessThanOrEqual(30); // back to a fresh window
    expect(screen.getByText(/All \d+ jobs loaded/)).toBeTruthy();
  });

  it('loads more automatically when the end scrolls into view', () => {
    let trigger;
    globalThis.IntersectionObserver = class { constructor(cb) { trigger = cb; } observe() {} disconnect() {} };
    ctx.jobs = many(75);
    render(<MyLeads onOpen={vi.fn()} onAdd={vi.fn()} onImport={vi.fn()} />);
    expect(screen.getAllByText(/^Company \d{3}$/)).toHaveLength(30);
    fireEvent.click(document.body); // no-op: nothing visible yet
    trigger([{ isIntersecting: true }]);
    return waitFor(() => expect(screen.getAllByText(/^Company \d{3}$/)).toHaveLength(60));
  });

  it('still reports the true tab counts, not just what is loaded', () => {
    ctx.jobs = many(75);
    render(<MyLeads onOpen={vi.fn()} onAdd={vi.fn()} onImport={vi.fn()} />);
    expect(screen.getByRole('tab', { name: /All \(75\)/ })).toBeTruthy();
  });
});

describe('Board columns', () => {
  it('each column loads its own cards in chunks while its header shows the true total', () => {
    ctx.jobs = [...many(45, { status: 'applied' }), ...many(3, { status: 'rejected' }).map((j, i) => ({ ...j, id: `r${i}`, company: `Reject ${i}` }))];
    render(<Board jobs={ctx.jobs} onOpen={vi.fn()} onAdd={vi.fn()} />);
    const applied = screen.getByRole('region', { name: 'Applied column' });
    expect(applied.textContent).toContain('45');
    expect(applied.querySelectorAll('[draggable="true"]')).toHaveLength(20);
    fireEvent.click(applied.querySelector('button.rounded-lg.border') || screen.getByText('Load more'));
    expect(applied.querySelectorAll('[draggable="true"]')).toHaveLength(40);
    expect(screen.getByRole('region', { name: 'Rejected column' }).querySelectorAll('[draggable="true"]')).toHaveLength(3);
    expect(screen.queryAllByText('Load more')).toHaveLength(1); // only the long column offers more
  });
});

describe('Notes', () => {
  it('lists notes in chunks and searches across all of them, not only those loaded', async () => {
    const notes = Array.from({ length: 70 }, (_, i) => ({ id: `n${i}`, content: `Note ${String(i).padStart(2, '0')}\nbody ${i === 65 ? 'needle' : 'hay'}`, updated_at: '2026-07-01T00:00:00Z' }));
    api.fetchNotes.mockResolvedValue(notes);
    render(<NotesPanel />);
    await screen.findByText('Note 00');
    expect(screen.queryByText('Note 40')).toBeNull();
    fireEvent.click(screen.getByText('Load more'));
    await screen.findByText('Note 40');
    fireEvent.change(screen.getByLabelText('Search notes'), { target: { value: 'needle' } });
    expect(screen.getByText('Note 65')).toBeTruthy(); // item 65 was never loaded, but search finds it
  });
});

describe('Contacts', () => {
  const contact = (i) => ({ id: `c${i}`, name: `Person ${String(i).padStart(3, '0')}`, email: `p${i}@x.com`, phone: '1', company: 'Acme', designation: '', linkedinUrl: '', notes: '', visibility: 'personal' });
  it('shows contacts 30 at a time and still searches the whole list', async () => {
    api.fetchContacts.mockResolvedValue(Array.from({ length: 70 }, (_, i) => contact(i + 1)));
    api.fetchSharedContacts.mockResolvedValue([]);
    render(<ContactsPanel mode="personal" />);
    await screen.findByText('Person 001');
    expect(screen.getAllByText(/^Person \d{3}$/)).toHaveLength(30);
    fireEvent.click(screen.getByText('Load more'));
    expect(screen.getAllByText(/^Person \d{3}$/)).toHaveLength(60);
    fireEvent.change(screen.getByLabelText('Search contacts'), { target: { value: 'person 069' } });
    expect(screen.getByText('Person 069')).toBeTruthy();
  });
});
