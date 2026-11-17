import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
import { supabase } from './supabase';
import { createJob, fetchSharedLeads, importSharedLead, setLeadVisibility } from './api';

// supabase-js style chain: .insert(row).select().single() -> promise of {data, error}
function insertChain(data = { id: 'x' }) {
  const insert = vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data, error: null }) }) }));
  supabase.from.mockReturnValue({ insert });
  return insert;
}

beforeEach(() => vi.resetAllMocks());

describe('lead sharing data layer', () => {
  it('sends visibility, URL and description for a new lead — and never an owner id', async () => {
    const insert = insertChain();
    await createJob({ status: 'lead', company: 'Google', role: 'SWE', visibility: 'peer', jobUrl: 'https://g.co/1', description: 'd' });
    expect(supabase.from).toHaveBeenCalledWith('leads');
    const payload = insert.mock.calls[0][0];
    expect(payload).toMatchObject({ company: 'Google', role: 'SWE', visibility: 'peer', job_url: 'https://g.co/1', description: 'd' });
    expect(payload).not.toHaveProperty('user_id');
    expect(payload).not.toHaveProperty('status');
  });

  it('omits visibility when none is given so the database default (personal) applies', async () => {
    const insert = insertChain();
    await createJob({ status: 'lead', company: 'Google', role: 'SWE', contact: 'hr@google.com' });
    expect(insert.mock.calls[0][0]).not.toHaveProperty('visibility');
  });

  it('never sends visibility for a tracked application', async () => {
    const insert = insertChain();
    await createJob({ status: 'applied', company: 'Google', role: 'SWE', visibility: 'peer' });
    expect(supabase.from).toHaveBeenCalledWith('jobs');
    expect(insert.mock.calls[0][0]).not.toHaveProperty('visibility');
  });

  it('changes a lead\'s visibility with a plain update on that lead', async () => {
    const eq = vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'l1', visibility: 'personal' }, error: null }) }) }));
    const update = vi.fn(() => ({ eq }));
    supabase.from.mockReturnValue({ update });
    const lead = await setLeadVisibility('l1', 'personal');
    expect(update).toHaveBeenCalledWith({ visibility: 'personal' });
    expect(eq).toHaveBeenCalledWith('id', 'l1');
    expect(lead.visibility).toBe('personal');
  });

  it('maps shared leads and keeps the owner name', async () => {
    supabase.rpc.mockResolvedValue({
      data: [{ lead_id: 'a', owner_display_name: 'Priya', company: 'MS', role: 'SDE', job_url: 'https://x.co', already_imported: true }],
      error: null,
    });
    const [lead] = await fetchSharedLeads();
    expect(supabase.rpc).toHaveBeenCalledWith('shared_leads_with_me');
    expect(lead).toMatchObject({ id: 'a', owner: 'Priya', company: 'MS', jobUrl: 'https://x.co', alreadyImported: true });
  });

  it('imports through the database function with the chosen stage', async () => {
    supabase.rpc.mockResolvedValue({ data: { table: 'jobs', row: {} }, error: null });
    await importSharedLead('a', 'applied');
    expect(supabase.rpc).toHaveBeenCalledWith('import_shared_lead', { p_lead_id: 'a', p_status: 'applied' });
  });

  it('surfaces database errors', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'Lead not found' } });
    await expect(importSharedLead('a', 'lead')).rejects.toThrow('Lead not found');
  });
});
