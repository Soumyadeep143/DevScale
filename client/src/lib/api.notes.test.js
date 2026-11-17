import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
import { supabase } from './supabase';
import { fetchSharedNotes, importSharedNote, setNoteVisibility } from './api';
import { noteVisibility } from './noteText';

beforeEach(() => vi.resetAllMocks());

describe('notes sharing data layer', () => {
  it('moves a note by changing only its visibility', async () => {
    const eq = vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'n1', visibility: 'peer' }, error: null }) }) }));
    const update = vi.fn(() => ({ eq }));
    supabase.from.mockReturnValue({ update });
    await setNoteVisibility('n1', 'peer');
    expect(supabase.from).toHaveBeenCalledWith('notes');
    expect(update).toHaveBeenCalledWith({ visibility: 'peer' }); // never sends an owner id or content
    expect(eq).toHaveBeenCalledWith('id', 'n1');
  });

  it('reads notes shared with me only through the permission-checked function', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ note_id: 'n9', owner_display_name: 'Priya', content: 'Hi\nthere', created_at: 'c', updated_at: 'u', already_saved: true }], error: null });
    expect(await fetchSharedNotes()).toEqual([{ id: 'n9', owner: 'Priya', content: 'Hi\nthere', createdAt: 'c', updatedAt: 'u', alreadySaved: true }]);
    expect(supabase.rpc).toHaveBeenCalledWith('shared_notes_with_me');
  });

  it('copies a peer note through import_shared_note, passing only the note id', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'copy1' }, error: null });
    await importSharedNote('n9');
    expect(supabase.rpc).toHaveBeenCalledWith('import_shared_note', { p_id: 'n9' });
  });

  it('turns a refusal from the database into an error', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'Note not found' } });
    await expect(importSharedNote('x')).rejects.toThrow('Note not found');
  });

  it('treats notes without a visibility (older database) as personal', () => {
    expect(noteVisibility({ id: 1 })).toBe('personal');
    expect(noteVisibility({ visibility: 'peer' })).toBe('peer');
  });
});
