import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../../lib/api', () => ({
  fetchPeers: vi.fn(), fetchMyLeads: vi.fn(), fetchSharedLeads: vi.fn(), fetchContacts: vi.fn(), fetchSharedContacts: vi.fn(),
  setLeadVisibility: vi.fn(), importSharedLead: vi.fn(), updateContact: vi.fn(), duplicateContact: vi.fn(),
  createContact: vi.fn(), deleteContact: vi.fn(),
}));
vi.mock('../../context/JobsContext', () => ({ useJobs: () => ({ jobs: [{ id: 'j1', company: 'Google', role: 'SWE', status: 'interviewing' }], refresh: vi.fn() }) }));

import * as api from '../../lib/api';
import TeamDashboard from './TeamDashboard';
import TeamLeads from './TeamLeads';
import TeamContacts from './TeamContacts';
import TeamActivity from './TeamActivity';
import TeamGuide from './TeamGuide';

const now = new Date().toISOString();
beforeEach(() => {
  vi.resetAllMocks();
  api.fetchPeers.mockResolvedValue([
    { id: 'p1', status: 'accepted', direction: 'outgoing', name: 'Rahul', code: 'PEER-1', createdAt: now, acceptedAt: now },
    { id: 'p2', status: 'pending', direction: 'incoming', name: 'Sneha', code: 'PEER-2', createdAt: now, acceptedAt: null },
  ]);
  api.fetchMyLeads.mockResolvedValue([
    { id: 'm1', company: 'Acme', role: 'Dev', location: '', visibility: 'peer', applied: false, createdAt: now },
    { id: 'm2', company: 'Quiet', role: 'Ops', location: '', visibility: 'personal', applied: false, createdAt: now },
  ]);
  api.fetchSharedLeads.mockResolvedValue([
    { id: 's1', owner: 'Rahul', company: 'Google', role: 'SWE', location: 'Remote', createdAt: now, alreadyImported: true },
    { id: 's2', owner: 'Rahul', company: 'Stripe', role: 'BE', location: '', createdAt: now, alreadyImported: false },
  ]);
  api.fetchContacts.mockResolvedValue([
    { id: 'c1', name: 'Mine Shared', email: 'a@b.co', phone: '1', company: 'Acme', designation: '', linkedinUrl: '', notes: 'private', visibility: 'peer', createdAt: now },
    { id: 'c2', name: 'Only Me', email: 'c@d.co', phone: '2', company: 'Zed', designation: '', linkedinUrl: '', notes: '', visibility: 'personal', createdAt: now },
  ]);
  api.fetchSharedContacts.mockResolvedValue([
    { id: 'sc1', owner: 'Priya', name: 'Neha Singh', email: 'n@m.co', phone: '3', company: 'Microsoft', designation: 'HM', linkedinUrl: '', createdAt: now, alreadySaved: false },
  ]);
});
afterEach(() => cleanup());

describe('TeamDashboard', () => {
  it('shows real counts and navigates from quick actions', async () => {
    const nav = vi.fn();
    render(<TeamDashboard onNavigate={nav} />);
    expect(await screen.findByText('Connected Peers')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Leads Shared With Me').previousSibling.textContent).toBe('2'));
    expect(screen.getByText('Leads Shared by Me').previousSibling.textContent).toBe('1'); // personal lead not counted
    expect(screen.getByText('Shared Contacts').previousSibling.textContent).toBe('2');
    expect(screen.getByText('Pending Requests').previousSibling.textContent).toBe('1');
    fireEvent.click(screen.getByText('Manage Peers'));
    expect(nav).toHaveBeenCalledWith('peers', undefined);
    fireEvent.click(screen.getByText('Move Lead to Team', { selector: 'span' }));
    expect(nav).toHaveBeenCalledWith('leads', 'share');
  });
});

describe('TeamLeads', () => {
  it('shows tab counts and each lead with my own status', async () => {
    render(<TeamLeads />);
    expect(await screen.findByRole('tab', { name: 'All Shared (3)' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Shared by Me (1)' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Shared With Me (2)' })).toBeTruthy();
    expect(screen.queryByText('Quiet')).toBeNull(); // personal leads never listed
    expect(screen.getAllByText('Interviewing').length).toBe(1); // my status for the imported Google lead
    expect(screen.getAllByText('Not Applied').length).toBeGreaterThan(0);
  });

  it('imports a lead as my own copy', async () => {
    api.importSharedLead.mockResolvedValue({});
    render(<TeamLeads />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save Stripe to Personal' }));
    await waitFor(() => expect(api.importSharedLead).toHaveBeenCalledWith('s2', 'lead'));
  });

  it('filters by search and moves back to Personal only after confirming', async () => {
    api.setLeadVisibility.mockResolvedValue({});
    render(<TeamLeads />);
    await screen.findByRole('tab', { name: /All Shared/ });
    fireEvent.change(screen.getByLabelText('Search leads'), { target: { value: 'stripe' } });
    expect(screen.queryByText('Acme')).toBeNull();
    fireEvent.change(screen.getByLabelText('Search leads'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move Acme to Personal' }));
    expect(api.setLeadVisibility).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByText('Move to Personal').at(-1));
    await waitFor(() => expect(api.setLeadVisibility).toHaveBeenCalledWith('m1', 'personal'));
  });

  it('shares a personal lead from the picker', async () => {
    api.setLeadVisibility.mockResolvedValue({});
    render(<TeamLeads />);
    await screen.findByRole('tab', { name: /All Shared/ });
    fireEvent.click(screen.getByText('Move Lead to Team'));
    expect(screen.getByText('Quiet')).toBeTruthy();
    fireEvent.click(screen.getByText('Move to Team'));
    await waitFor(() => expect(api.setLeadVisibility).toHaveBeenCalledWith('m2', 'peer'));
  });
});

describe('TeamContacts', () => {
  it('lists only peer-visible contacts and saves a copy of a peer contact', async () => {
    api.duplicateContact.mockResolvedValue({});
    render(<TeamContacts />);
    expect(await screen.findByRole('tab', { name: 'All (2)' })).toBeTruthy();
    expect(screen.queryByText('Only Me')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save Neha Singh to my contacts' }));
    await waitFor(() => expect(api.duplicateContact).toHaveBeenCalledWith('sc1'));
  });

  it('only offers edit/delete on my own shared contacts', async () => {
    render(<TeamContacts />);
    await screen.findByRole('tab', { name: /All/ });
    expect(screen.getByRole('button', { name: 'Edit Mine Shared' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit Neha Singh' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete Neha Singh' })).toBeNull();
  });
});

describe('TeamActivity', () => {
  it('shows a timeline and filters by type', async () => {
    render(<TeamActivity />);
    expect((await screen.findAllByText(/shared a job lead/, { selector: 'p' })).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('tab', { name: 'Contact Sharing' }));
    expect(screen.queryByText('Google — SWE')).toBeNull();
    expect(screen.getByText('Neha Singh — HM, Microsoft')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Visibility Changes' }));
    expect(screen.getByText(/aren't recorded yet/)).toBeTruthy();
  });
});

describe('TeamGuide', () => {
  it('opens a guide and goes back', () => {
    render(<TeamGuide />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Privacy and Access' }));
    expect(screen.getByText('Personal vs Peer')).toBeTruthy();
    fireEvent.click(screen.getByText('All guides'));
    expect(screen.getByText('Team Guide')).toBeTruthy();
  });
});
