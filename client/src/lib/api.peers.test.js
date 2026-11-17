import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
import { supabase } from './supabase';
import { connectWithPeer } from './api';

beforeEach(() => vi.resetAllMocks());

describe('connectWithPeer', () => {
  it('returns the connection', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'c1', status: 'pending' }, error: null });
    expect(await connectWithPeer('PEER-ABC234')).toMatchObject({ id: 'c1', status: 'pending' });
    expect(supabase.rpc).toHaveBeenCalledWith('connect_with_peer', { p_code: 'PEER-ABC234' });
  });

  it('turns the empty row returned for an unknown code into "Invalid peer code"', async () => {
    for (const data of [null, { id: null, status: null }]) {
      supabase.rpc.mockResolvedValue({ data, error: null });
      await expect(connectWithPeer('PEER-NOPE00')).rejects.toThrow('Invalid peer code');
    }
  });

  it('passes the rate-limit message through unchanged', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'Too many invalid codes. Please try again in an hour.' } });
    await expect(connectWithPeer('PEER-NOPE00')).rejects.toThrow('Too many invalid codes');
  });
});
