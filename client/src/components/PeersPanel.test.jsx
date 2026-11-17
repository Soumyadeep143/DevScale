import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../lib/api', () => ({
  fetchMyPeerCode: vi.fn(),
  fetchPeers: vi.fn(),
  connectWithPeer: vi.fn(),
  respondToPeerRequest: vi.fn(),
  removePeer: vi.fn(),
}));

import * as api from '../lib/api';
import PeersPanel from './PeersPanel';

const peer = (over) => ({
  id: 'c1', status: 'pending', direction: 'incoming', name: 'Priya', code: 'PEER-AAAAAA',
  createdAt: '2026-11-16T00:00:00Z', acceptedAt: null, ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  api.fetchMyPeerCode.mockResolvedValue('PEER-K7M2QX');
  api.fetchPeers.mockResolvedValue([]);
});
afterEach(() => cleanup());

const openTab = (name) => fireEvent.click(screen.getByRole('tab', { name: new RegExp(name) }));

describe('PeersPanel', () => {
  it('shows my peer code from the database, tab counts and empty states', async () => {
    render(<PeersPanel />);
    expect(await screen.findByText('PEER-K7M2QX')).toBeTruthy();
    expect(screen.getByText(/No connected peers yet/)).toBeTruthy();
    openTab('Incoming');
    expect(screen.getByText('No incoming requests.')).toBeTruthy();
    openTab('Outgoing');
    expect(screen.getByText('Nothing pending.')).toBeTruthy();
  });

  it('shows tab counts and flags incoming requests', async () => {
    api.fetchPeers.mockResolvedValue([peer(), peer({ id: 'c2', status: 'accepted' }), peer({ id: 'c3', direction: 'outgoing' })]);
    render(<PeersPanel />);
    expect(await screen.findByRole('tab', { name: /Connected \(1\)/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Incoming \(1\)/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Outgoing \(1\)/ })).toBeTruthy();
    expect(screen.getByLabelText('New')).toBeTruthy();
  });

  it('sends a request with a normalized code and reports success', async () => {
    api.connectWithPeer.mockResolvedValue({ status: 'pending' });
    render(<PeersPanel />);
    await screen.findByText('PEER-K7M2QX');
    fireEvent.change(screen.getByLabelText('Connect with a peer'), { target: { value: 'ab12cd' } });
    fireEvent.click(screen.getByText('Send Request'));
    await waitFor(() => expect(api.connectWithPeer).toHaveBeenCalledWith('PEER-AB12CD'));
    expect(await screen.findByText(/Request sent/)).toBeTruthy();
  });

  it('shows the server error when the code is rejected', async () => {
    api.connectWithPeer.mockRejectedValue(new Error('Invalid peer code'));
    render(<PeersPanel />);
    await screen.findByText('PEER-K7M2QX');
    fireEvent.change(screen.getByLabelText('Connect with a peer'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByText('Send Request'));
    expect((await screen.findByRole('alert')).textContent).toContain('Invalid peer code');
  });

  it('accepts and rejects an incoming request', async () => {
    api.fetchPeers.mockResolvedValue([peer()]);
    api.respondToPeerRequest.mockResolvedValue({});
    render(<PeersPanel />);
    await screen.findByText('PEER-K7M2QX');
    openTab('Incoming');
    fireEvent.click(screen.getByText('Accept'));
    await waitFor(() => expect(api.respondToPeerRequest).toHaveBeenCalledWith('c1', true));
    fireEvent.click(await screen.findByText('Reject'));
    await waitFor(() => expect(api.respondToPeerRequest).toHaveBeenCalledWith('c1', false));
  });

  it('removes a connected peer only after confirming', async () => {
    api.fetchPeers.mockResolvedValue([peer({ status: 'accepted' })]);
    api.removePeer.mockResolvedValue();
    render(<PeersPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /^Remove$/ }));
    expect(api.removePeer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Cancel'));
    expect(api.removePeer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^Remove$/ }));
    fireEvent.click(screen.getByText('Remove peer'));
    await waitFor(() => expect(api.removePeer).toHaveBeenCalledWith('c1'));
  });

  it('cancels an outgoing request', async () => {
    api.fetchPeers.mockResolvedValue([peer({ direction: 'outgoing' })]);
    api.removePeer.mockResolvedValue();
    render(<PeersPanel />);
    await screen.findByText('PEER-K7M2QX');
    openTab('Outgoing');
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => expect(api.removePeer).toHaveBeenCalledWith('c1'));
  });
});
