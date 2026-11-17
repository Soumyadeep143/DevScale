import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
import { supabase } from './supabase';
import { bulkImportJobs, createJob, setContactsVisibility, setLeadsVisibility, setNotesVisibility, updateMyDisplayName } from './api';

// A stand-in for update().in().select(): remembers each call and answers with the ids it was given.
function mockUpdate({ failOnCall = null, ownedOnly = null } = {}) {
  const calls = [];
  supabase.from.mockImplementation((table) => ({
    update: (patch) => ({
      in: (col, ids) => ({
        select: () => {
          calls.push({ table, patch, col, ids });
          if (failOnCall === calls.length) return Promise.resolve({ data: null, error: { message: 'timeout' } });
          return Promise.resolve({ data: (ownedOnly ? ids.filter(ownedOnly) : ids).map((id) => ({ id })), error: null });
        },
      }),
    }),
  }));
  return calls;
}
const ids = (n) => Array.from({ length: n }, (_, i) => `id${i}`);

beforeEach(() => vi.resetAllMocks());

describe('moving many rows at once', () => {
  it('sends one request per 100 rows, changing only visibility', async () => {
    const calls = mockUpdate();
    expect(await setLeadsVisibility(ids(250), 'peer')).toBe(250);
    expect(calls.map((c) => c.ids.length)).toEqual([100, 100, 50]);
    expect(calls.every((c) => c.table === 'leads' && c.col === 'id' && JSON.stringify(c.patch) === '{"visibility":"peer"}')).toBe(true);
  });

  it('works for contacts and notes too, in both directions', async () => {
    const calls = mockUpdate();
    await setContactsVisibility(['c1'], 'peer');
    await setNotesVisibility(['n1', 'n2'], 'personal');
    expect(calls.map((c) => [c.table, c.patch.visibility, c.ids.length])).toEqual([['contacts', 'peer', 1], ['notes', 'personal', 2]]);
  });

  it('reports how many actually changed (row-level security skips rows that are not yours)', async () => {
    mockUpdate({ ownedOnly: (id) => id !== 'id1' });
    expect(await setLeadsVisibility(['id0', 'id1', 'id2'], 'peer')).toBe(2);
  });

  it('says how many had moved when a later request fails', async () => {
    mockUpdate({ failOnCall: 2 });
    await expect(setLeadsVisibility(ids(150), 'peer')).rejects.toThrow('Moved 100 of 150, then timeout.');
  });

  it('a failure on the first request says only what went wrong', async () => {
    mockUpdate({ failOnCall: 1 });
    await expect(setLeadsVisibility(ids(5), 'peer')).rejects.toThrow('timeout.');
  });

  it('does nothing for an empty list', async () => {
    const calls = mockUpdate();
    expect(await setLeadsVisibility([], 'peer')).toBe(0);
    expect(calls).toHaveLength(0);
  });
});

describe('updateMyDisplayName', () => {
  const setup = () => {
    const eq = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const update = vi.fn(() => ({ eq }));
    supabase.from.mockReturnValue({ update });
    return { update, eq };
  };
  it('updates only the display name of the caller\'s own profile row', async () => {
    const { update, eq } = setup();
    await updateMyDisplayName('u-1', '  Priya   Sharma ');
    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(update).toHaveBeenCalledWith({ display_name: 'Priya Sharma' });
    expect(eq).toHaveBeenCalledWith('id', 'u-1');
  });
  it('cleans the name the same way the database does: no control characters, at most 60', async () => {
    const { update } = setup();
    await updateMyDisplayName('u-1', 'A\u0000B\nC' + 'x'.repeat(100));
    const name = update.mock.calls[0][0].display_name;
    expect(name).toHaveLength(60);
    expect(/[\u0000-\u001f]/.test(name)).toBe(false);
  });
  it('does nothing for an empty name or a missing id', async () => {
    const { update } = setup();
    await updateMyDisplayName('u-1', '   ');
    await updateMyDisplayName('', 'Priya');
    expect(update).not.toHaveBeenCalled();
  });
  it('turns a database refusal into an error', async () => {
    supabase.from.mockReturnValue({ update: () => ({ eq: () => Promise.resolve({ data: null, error: { message: 'check constraint' } }) }) });
    await expect(updateMyDisplayName('u-1', 'Priya')).rejects.toThrow('check constraint');
  });
});

describe('required fields for leads are enforced in the data layer too', () => {
  const insert = () => { const i = vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'x', company: 'A', role: 'B' }, error: null }) }), then: (r) => r({ error: null }) })); supabase.from.mockReturnValue({ insert: i, select: () => Promise.resolve({ data: [], error: null }) }); return i; };

  it('refuses a new lead without company, role and link/email, before writing anything', async () => {
    const i = insert();
    await expect(createJob({ status: 'lead', company: 'Acme', role: 'Dev' })).rejects.toThrow('Please enter the missing required fields: Link or email.');
    await expect(createJob({ status: 'lead', company: '', role: '', contact: 'hr@a.com' })).rejects.toThrow('Company, Role');
    expect(i).not.toHaveBeenCalled();
  });

  it('accepts a complete lead', async () => {
    const i = insert();
    await createJob({ status: 'lead', company: 'Acme', role: 'Dev', contact: 'hr@acme.com' });
    expect(i).toHaveBeenCalledTimes(1);
  });

  it('does not hold applied jobs to the rule', async () => {
    const i = insert();
    await createJob({ status: 'applied', company: 'Acme', role: 'Dev' });
    expect(i).toHaveBeenCalledTimes(1);
  });

  it('an import with any incomplete lead imports nothing at all', async () => {
    const i = insert();
    await expect(bulkImportJobs([
      { status: 'lead', company: 'A', role: 'B', contact: 'https://a.com/1' },
      { status: 'lead', company: 'C', role: 'D' },
      { status: 'lead', company: 'E', role: '', contact: 'hr@e.com' },
    ])).rejects.toThrow(/2 leads are missing required fields.*Nothing was imported/);
    expect(i).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
