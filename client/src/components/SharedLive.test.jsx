import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';

vi.mock('../lib/api', () => ({
  fetchContacts: vi.fn(), fetchSharedContacts: vi.fn(), fetchMyLeads: vi.fn(), fetchSharedLeads: vi.fn(),
  fetchPeers: vi.fn(), fetchMyPeerCode: vi.fn(), createContact: vi.fn(), updateContact: vi.fn(), deleteContact: vi.fn(),
  duplicateContact: vi.fn(), bulkCreateContacts: vi.fn(), setLeadVisibility: vi.fn(), importSharedLead: vi.fn(),
  connectWithPeer: vi.fn(), respondToPeerRequest: vi.fn(), removePeer: vi.fn(),
}));
vi.mock('../context/JobsContext', () => ({ useJobs: () => ({ refresh: vi.fn() }) }));
import * as api from '../lib/api';
import { SHARED_DEBOUNCE_MS, SharedUpdatesContext, createSharedBus } from '../lib/sharedUpdates';
import ContactsPanel from './ContactsPanel';
import LeadsPanel from './LeadsPanel';
import PeersPanel from './PeersPanel';

const contact = (id, name, over = {}) => ({ id, name, email: `${name}@x.com`, phone: '1', company: 'Acme', designation: '', linkedinUrl: '', notes: '', visibility: 'personal', ...over });
const wait = () => new Promise((r) => setTimeout(r, SHARED_DEBOUNCE_MS + 80));

let bus;
const withBus = (ui) => <SharedUpdatesContext.Provider value={bus}>{ui}</SharedUpdatesContext.Provider>;

beforeEach(() => {
  vi.clearAllMocks();
  bus = createSharedBus();
  window.matchMedia = undefined;
  api.fetchContacts.mockResolvedValue([]);
  api.fetchSharedContacts.mockResolvedValue([]);
  api.fetchMyLeads.mockResolvedValue([]);
  api.fetchSharedLeads.mockResolvedValue([]);
  api.fetchPeers.mockResolvedValue([]);
  api.fetchMyPeerCode.mockResolvedValue('PEER-ABC234');
});
afterEach(() => { cleanup(); bus.dispose(); });

describe('shared data updates live', () => {
  it('a contact a peer just shared appears without reloading the page', async () => {
    render(withBus(<ContactsPanel mode="team" />));
    await waitFor(() => expect(api.fetchSharedContacts).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Priya Shah')).toBeNull();

    api.fetchSharedContacts.mockResolvedValue([{ ...contact('s1', 'Priya Shah'), owner: 'Priya', visibility: 'peer' }]);
    fireEventSharedTab();
    act(() => bus.emit('contacts'));
    expect(await screen.findByText('Priya Shah')).toBeTruthy();
    expect(api.fetchSharedContacts).toHaveBeenCalledTimes(2);
  });

  it('a contact a peer stops sharing disappears', async () => {
    api.fetchSharedContacts.mockResolvedValue([{ ...contact('s1', 'Priya Shah'), owner: 'Priya', visibility: 'peer' }]);
    render(withBus(<ContactsPanel mode="team" />));
    fireEventSharedTab();
    await screen.findByText('Priya Shah');
    api.fetchSharedContacts.mockResolvedValue([]);
    act(() => bus.emit('contacts'));
    await waitFor(() => expect(screen.queryByText('Priya Shah')).toBeNull());
  });

  it('shared leads reload on a leads signal, not on an unrelated one', async () => {
    render(withBus(<LeadsPanel mode="team" />));
    await waitFor(() => expect(api.fetchSharedLeads).toHaveBeenCalledTimes(1));
    act(() => bus.emit('contacts'));
    await wait();
    expect(api.fetchSharedLeads).toHaveBeenCalledTimes(1);
    act(() => bus.emit('leads'));
    await waitFor(() => expect(api.fetchSharedLeads).toHaveBeenCalledTimes(2));
  });

  it('the peers list reloads when a connection changes ("all")', async () => {
    render(withBus(<PeersPanel />));
    await waitFor(() => expect(api.fetchPeers).toHaveBeenCalledTimes(1));
    act(() => bus.emit('all'));
    await waitFor(() => expect(api.fetchPeers).toHaveBeenCalledTimes(2));
  });

  it('keeps showing the current data if a live reload fails', async () => {
    api.fetchSharedContacts.mockResolvedValue([{ ...contact('s1', 'Priya Shah'), owner: 'Priya', visibility: 'peer' }]);
    render(withBus(<ContactsPanel mode="team" />));
    fireEventSharedTab();
    await screen.findByText('Priya Shah');
    api.fetchSharedContacts.mockRejectedValue(new Error('offline'));
    act(() => bus.emit('contacts'));
    expect((await screen.findByRole('alert')).textContent).toContain('offline');
    expect(screen.getByText('Priya Shah')).toBeTruthy();
  });
});

function fireEventSharedTab() {
  const tab = screen.queryByRole('tab', { name: /Shared with me/ });
  if (tab) tab.click();
}
