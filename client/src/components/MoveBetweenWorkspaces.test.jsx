import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('../lib/api', () => ({
  fetchNotes: vi.fn(), createNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn(),
  setNoteVisibility: vi.fn(), fetchSharedNotes: vi.fn(), importSharedNote: vi.fn(),
}));
import * as api from '../lib/api';
import { SHARED_DEBOUNCE_MS, SharedUpdatesContext, createSharedBus } from '../lib/sharedUpdates';
import NotesPanel from './NotesPanel';
import TeamNotes from './team/TeamNotes';

const note = (id, content, over = {}) => ({ id, content, visibility: 'personal', updated_at: new Date().toISOString(), ...over });
const sharedNote = (id, content, over = {}) => ({ id, owner: 'Priya', content, createdAt: '2026-07-01T00:00:00Z', updatedAt: new Date().toISOString(), alreadySaved: false, ...over });

let bus;
const withBus = (ui) => <SharedUpdatesContext.Provider value={bus}>{ui}</SharedUpdatesContext.Provider>;

beforeEach(() => {
  vi.clearAllMocks();
  bus = createSharedBus();
  window.matchMedia = undefined; // compact layout
  api.fetchNotes.mockResolvedValue([
    note('n1', 'Interview prep\nSystem design basics'),
    note('n2', 'Team strategy\nShare with peers', { visibility: 'peer' }),
  ]);
  api.fetchSharedNotes.mockResolvedValue([sharedNote('s1', 'Resume tips\nKeep it one page')]);
});
afterEach(() => { cleanup(); bus.dispose(); });

describe('Personal notes: moving to Team', () => {
  it('lists only personal notes; a note already moved to Team is not here', async () => {
    render(<NotesPanel />);
    expect(await screen.findByText('Interview prep')).toBeTruthy();
    expect(screen.queryByText('Team strategy')).toBeNull();
  });

  it('moves a note to Team only after confirming, and it leaves the Personal list', async () => {
    api.setNoteVisibility.mockResolvedValue({ id: 'n1', visibility: 'peer' });
    render(<NotesPanel />);
    fireEvent.click(await screen.findByText('Interview prep'));
    fireEvent.click(screen.getByLabelText('Move to Team'));
    expect(api.setNoteVisibility).not.toHaveBeenCalled(); // asks first: peers read the whole note
    expect(screen.getByText(/read the whole note/)).toBeTruthy();
    fireEvent.click(within(screen.getByRole('dialog')).getByText('Move to Team'));
    await waitFor(() => expect(api.setNoteVisibility).toHaveBeenCalledWith('n1', 'peer'));
    await waitFor(() => expect(screen.queryByText('Interview prep')).toBeNull());
    expect((await screen.findByRole('status')).textContent).toMatch(/Moved .Interview prep. to Team/);
  });

  it('cancelling the confirmation changes nothing', async () => {
    render(<NotesPanel />);
    fireEvent.click(await screen.findByText('Interview prep'));
    fireEvent.click(screen.getByLabelText('Move to Team'));
    fireEvent.click(within(screen.getByRole('dialog')).getByText('Cancel'));
    expect(api.setNoteVisibility).not.toHaveBeenCalled();
    expect(screen.getByText('Interview prep')).toBeTruthy();
  });

  it('will not move a note with unsaved edits (they would not be shared)', async () => {
    render(<NotesPanel />);
    fireEvent.click(await screen.findByText('Interview prep'));
    fireEvent.change(screen.getByLabelText('Note content'), { target: { value: 'Interview prep\nchanged' } });
    expect(screen.getByLabelText('Move to Team').disabled).toBe(true);
  });

  it('shows the server error and keeps the note if the move fails', async () => {
    api.setNoteVisibility.mockRejectedValue(new Error('policy says no'));
    render(<NotesPanel />);
    fireEvent.click(await screen.findByText('Interview prep'));
    fireEvent.click(screen.getByLabelText('Move to Team'));
    fireEvent.click(within(screen.getByRole('dialog')).getByText('Move to Team'));
    expect((await screen.findByRole('alert')).textContent).toContain('policy says no');
    expect(screen.getByText('Interview prep')).toBeTruthy();
  });

  it('refreshes quietly when another tab of yours moves a note', async () => {
    render(withBus(<NotesPanel />));
    await screen.findByText('Interview prep');
    api.fetchNotes.mockResolvedValue([note('n1', 'Interview prep\nSystem design basics', { visibility: 'peer' })]);
    act(() => bus.emit('notes'));
    await waitFor(() => expect(screen.queryByText('Interview prep')).toBeNull());
  });
});

describe('Team notes', () => {
  it('shows notes I moved to Team and notes shared with me, never my personal ones', async () => {
    render(<TeamNotes />);
    expect(await screen.findByText('Team strategy')).toBeTruthy();
    expect(screen.getByText('Resume tips')).toBeTruthy();
    expect(screen.queryByText('Interview prep')).toBeNull();
    expect(screen.getByRole('tab', { name: 'All (2)' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Shared by me (1)' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Shared with me (1)' })).toBeTruthy();
  });

  it('moves one of my shared notes back to Personal only after confirming', async () => {
    api.setNoteVisibility.mockResolvedValue({});
    render(<TeamNotes />);
    fireEvent.click(await screen.findByLabelText('Move Team strategy to Personal'));
    expect(api.setNoteVisibility).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByText('Move to Personal'));
    await waitFor(() => expect(api.setNoteVisibility).toHaveBeenCalledWith('n2', 'personal'));
    expect((await screen.findByRole('status')).textContent).toMatch(/Moved back to Personal/);
  });

  it('saves a peer\'s note to Personal as my own copy', async () => {
    api.importSharedNote.mockResolvedValue({});
    render(<TeamNotes />);
    fireEvent.click(await screen.findByLabelText('Save Resume tips to Personal'));
    await waitFor(() => expect(api.importSharedNote).toHaveBeenCalledWith('s1'));
    expect((await screen.findByRole('status')).textContent).toMatch(/Saved to your Personal notes/);
  });

  it('does not offer to save a note I already have', async () => {
    api.fetchSharedNotes.mockResolvedValue([sharedNote('s1', 'Resume tips\nx', { alreadySaved: true })]);
    render(<TeamNotes />);
    expect(await screen.findByText('In your notes')).toBeTruthy();
    expect(screen.queryByLabelText('Save Resume tips to Personal')).toBeNull();
  });

  it('moves a personal note to Team from the picker', async () => {
    api.setNoteVisibility.mockResolvedValue({});
    render(<TeamNotes />);
    await screen.findByText('Team strategy');
    fireEvent.click(screen.getByText('Move a personal note here'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Interview prep')).toBeTruthy(); // personal notes only
    expect(within(dialog).queryByText('Team strategy')).toBeNull();
    fireEvent.click(within(dialog).getByText('Move to Team'));
    await waitFor(() => expect(api.setNoteVisibility).toHaveBeenCalledWith('n1', 'peer'));
  });

  it('writes a new note straight into Team', async () => {
    api.createNote.mockResolvedValue({});
    render(<TeamNotes />);
    await screen.findByText('Team strategy');
    fireEvent.click(screen.getByRole('button', { name: /New team note/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: /Add to Team/ }).disabled).toBe(true);
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Referral list\nPriya, Sam' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Add to Team/ }));
    await waitFor(() => expect(api.createNote).toHaveBeenCalledWith('Referral list\nPriya, Sam', 'peer'));
    expect((await screen.findByRole('status')).textContent).toMatch(/Added to Team/);
  });

  it('still shows my own team notes, with a clear fix, when the sharing migration is missing', async () => {
    api.fetchSharedNotes.mockRejectedValue(new Error('Could not find the function public.shared_notes_with_me without parameters in the schema cache'));
    render(<TeamNotes />);
    expect(await screen.findByText('Team strategy')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/20261116001000_notes_sharing\.sql/);
  });

  it('a note a peer just shared appears live, and one they take back disappears', async () => {
    render(withBus(<TeamNotes />));
    await screen.findByText('Resume tips');
    api.fetchSharedNotes.mockResolvedValue([sharedNote('s1', 'Resume tips\nx'), sharedNote('s2', 'Offer negotiation\ny')]);
    act(() => bus.emit('notes'));
    expect(await screen.findByText('Offer negotiation')).toBeTruthy();
    api.fetchSharedNotes.mockResolvedValue([]);
    act(() => bus.emit('all'));
    await waitFor(() => expect(screen.queryByText('Offer negotiation')).toBeNull());
    expect(screen.queryByText('Resume tips')).toBeNull();
  });

  it('opens the full note and offers the right action there', async () => {
    render(<TeamNotes />);
    fireEvent.click(await screen.findByText('Resume tips'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Keep it one page/)).toBeTruthy();
    expect(within(dialog).getByText(/Shared by Priya/)).toBeTruthy();
    expect(within(dialog).getByLabelText('Save Resume tips to Personal')).toBeTruthy();
  });

  it('searches across both kinds', async () => {
    render(<TeamNotes />);
    await screen.findByText('Team strategy');
    fireEvent.change(screen.getByLabelText('Search team notes'), { target: { value: 'resume' } });
    expect(screen.queryByText('Team strategy')).toBeNull();
    expect(screen.getByText('Resume tips')).toBeTruthy();
  });

  it('shows an empty state when nothing is shared yet', async () => {
    api.fetchNotes.mockResolvedValue([note('n1', 'Only personal')]);
    api.fetchSharedNotes.mockResolvedValue([]);
    render(<TeamNotes />);
    expect(await screen.findByText('No team notes yet')).toBeTruthy();
    void SHARED_DEBOUNCE_MS;
  });
});
