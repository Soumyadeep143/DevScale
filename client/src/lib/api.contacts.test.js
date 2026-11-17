import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
import { supabase } from './supabase';
import { createContact, updateContact, fetchSharedContacts, duplicateContact, bulkCreateContacts } from './api';

const row = {
  id: 'c1', name: 'Alice', email: 'a@x.com', phone_number: '1', company_name: 'Acme', designation: '',
  linkedin_url: '', notes: '', visibility: 'personal',
};

beforeEach(() => vi.resetAllMocks());

describe('contacts data layer', () => {
  it('maps UI fields to columns, trims values, and never sends an owner id', async () => {
    const insert = vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: row, error: null }) }) }));
    supabase.from.mockReturnValue({ insert });
    const created = await createContact({
      name: '  Alice ', email: ' a@x.com ', phone: '1', company: 'Acme', designation: '', linkedinUrl: '', notes: '  keep spaces  ', visibility: 'peer',
    });
    expect(supabase.from).toHaveBeenCalledWith('contacts');
    const payload = insert.mock.calls[0][0];
    expect(payload).toEqual({
      name: 'Alice', email: 'a@x.com', phone_number: '1', company_name: 'Acme', designation: '', linkedin_url: '', notes: '  keep spaces  ', visibility: 'peer',
    });
    expect(payload).not.toHaveProperty('user_id');
    expect(created).toMatchObject({ id: 'c1', phone: '1', company: 'Acme' });
  });

  it('a partial update only sends the changed columns', async () => {
    const eq = vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: row, error: null }) }) }));
    const update = vi.fn(() => ({ eq }));
    supabase.from.mockReturnValue({ update });
    await updateContact('c1', { visibility: 'personal' });
    expect(update).toHaveBeenCalledWith({ visibility: 'personal' });
    expect(eq).toHaveBeenCalledWith('id', 'c1');
  });

  it('reads peers\' contacts only through the database function', async () => {
    supabase.rpc.mockResolvedValue({
      data: [{ contact_id: 's1', owner_display_name: 'Priya', name: 'Bob', email: 'b@x.com', phone_number: '2', company_name: 'Globex', already_saved: true }],
      error: null,
    });
    const [c] = await fetchSharedContacts();
    expect(supabase.rpc).toHaveBeenCalledWith('shared_contacts_with_me');
    expect(supabase.from).not.toHaveBeenCalled();
    expect(c).toMatchObject({ id: 's1', owner: 'Priya', alreadySaved: true });
    expect(c).not.toHaveProperty('notes');
  });

  it('duplicates through the database function', async () => {
    supabase.rpc.mockResolvedValue({ data: row, error: null });
    const c = await duplicateContact('s1');
    expect(supabase.rpc).toHaveBeenCalledWith('duplicate_contact', { p_id: 's1' });
    expect(c.id).toBe('c1');
  });

  it('surfaces database errors', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'Contact not found' } });
    await expect(duplicateContact('x')).rejects.toThrow('Contact not found');
  });

  it('bulk-imports in one insert, applies the chosen visibility, and never sends an owner id', async () => {
    const insert = vi.fn(() => Promise.resolve({ data: null, error: null }));
    supabase.from.mockReturnValue({ insert });
    const n = await bulkCreateContacts([
      { name: 'A', email: 'a@x.com', phone: '1', company: 'Co', designation: '', linkedinUrl: '' },
      { name: 'B', email: 'b@x.com', phone: '2', company: 'Co', designation: 'Dev', linkedinUrl: '' },
    ], 'peer');
    expect(n).toBe(2);
    expect(insert).toHaveBeenCalledTimes(1);
    const rows = insert.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.visibility === 'peer' && r.notes === '' && !('user_id' in r))).toBe(true);
    expect(rows[1]).toMatchObject({ name: 'B', phone_number: '2', company_name: 'Co', designation: 'Dev' });
  });

  it('bulk-import gives every row the same columns, so optional fields never become NULL', async () => {
    const insert = vi.fn(() => Promise.resolve({ data: null, error: null }));
    supabase.from.mockReturnValue({ insert });
    await bulkCreateContacts([
      { name: 'A', email: 'a@x.com', phone: '1', company: 'Co' }, // no designation / LinkedIn at all
      { name: 'B', email: 'b@x.com', phone: '2', company: 'Co', designation: 'Dev', linkedinUrl: 'https://linkedin.com/in/b' },
    ]);
    const [first, second] = insert.mock.calls[0][0];
    expect(Object.keys(first).sort()).toEqual(Object.keys(second).sort());
    expect(first).toMatchObject({ designation: '', linkedin_url: '', notes: '' });
  });

  it('bulk-import with no rows does nothing', async () => {
    expect(await bulkCreateContacts([])).toBe(0);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('bulk-import surfaces a database error and imports nothing', async () => {
    supabase.from.mockReturnValue({ insert: () => Promise.resolve({ data: null, error: { message: 'violates check constraint "contacts_email_check"' } }) });
    await expect(bulkCreateContacts([{ name: 'A', email: 'a', phone: '1', company: 'Co' }])).rejects.toThrow('contacts_email_check');
  });
});
