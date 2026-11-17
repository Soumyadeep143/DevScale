import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../lib/api', () => ({
  fetchMyLeads: vi.fn(),
  fetchSharedLeads: vi.fn(),
  setLeadVisibility: vi.fn(),
  importSharedLead: vi.fn(),
}));
const refresh = vi.fn();
vi.mock('../context/JobsContext', () => ({ useJobs: () => ({ refresh }) }));

import * as api from '../lib/api';
import LeadsPanel from './LeadsPanel';

const mine = (over) => ({
  id: 'm1', company: 'Google', role: 'Software Engineer', location: 'Bengaluru', experience: '', contact: '',
  source: 'Manual', postedTime: '', description: '', jobUrl: '', visibility: 'personal', applied: false, ...over,
});
const sharedLead = (over) => ({
  id: 's1', owner: 'Priya', company: 'Microsoft', role: 'SDE', location: '', experience: '', contact: '',
  source: '', postedTime: '', description: 'Great team', jobUrl: 'https://example.com/ms', alreadyImported: false, ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  api.fetchMyLeads.mockResolvedValue([
    mine(),
    mine({ id: 'm2', company: 'Meta', role: 'Backend', visibility: 'peer' }),
    mine({ id: 'm3', company: 'Stripe', role: 'Infra', applied: true }),
  ]);
  api.fetchSharedLeads.mockResolvedValue([sharedLead()]);
});
afterEach(() => cleanup());

describe('LeadsPanel', () => {
  it('Personal mode shows only my private, un-applied leads and no tabs', async () => {
    render(<LeadsPanel mode="personal" />);
    expect(await screen.findByText('Google')).toBeTruthy();
    expect(screen.queryByText('Meta')).toBeNull(); // peer-visible lead belongs to the Team workspace
    expect(screen.queryByText('Stripe')).toBeNull(); // already applied
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByText('Shared with me')).toBeNull();
  });

  it('Team mode shows shared-by-me and shared-with-me, never my personal leads', async () => {
    render(<LeadsPanel mode="team" />);
    expect(await screen.findByText('Meta')).toBeTruthy(); // opens on Shared by me
    expect(screen.queryByText('Google')).toBeNull();
    expect(screen.queryByRole('tab', { name: /My personal leads/ })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /Shared with me/ }));
    expect(screen.getByText('Shared by Priya')).toBeTruthy();
  });

  it('shares a personal lead with peers', async () => {
    api.setLeadVisibility.mockResolvedValue({});
    render(<LeadsPanel />);
    fireEvent.click(await screen.findByText('Share with peers'));
    await waitFor(() => expect(api.setLeadVisibility).toHaveBeenCalledWith('m1', 'peer'));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('makes a shared lead personal only after confirmation', async () => {
    api.setLeadVisibility.mockResolvedValue({});
    const confirmSpy = vi.spyOn(window, 'confirm');
    render(<LeadsPanel mode="team" />);
    fireEvent.click(await screen.findByRole('tab', { name: /Shared by me/ }));
    const button = screen.getByText('Make personal');

    confirmSpy.mockReturnValueOnce(false);
    fireEvent.click(button);
    expect(api.setLeadVisibility).not.toHaveBeenCalled();

    confirmSpy.mockReturnValueOnce(true);
    fireEvent.click(button);
    await waitFor(() => expect(api.setLeadVisibility).toHaveBeenCalledWith('m2', 'personal'));
    confirmSpy.mockRestore();
  });

  it('shows who shared a lead and imports it as a lead by default', async () => {
    api.importSharedLead.mockResolvedValue({ table: 'leads', row: {} });
    render(<LeadsPanel mode="team" />);
    fireEvent.click(await screen.findByRole('tab', { name: /Shared with me/ }));
    expect(screen.getByText('Shared by Priya')).toBeTruthy();
    fireEvent.click(screen.getByText('Import'));
    await waitFor(() => expect(api.importSharedLead).toHaveBeenCalledWith('s1', 'lead'));
  });

  it('imports into a chosen stage', async () => {
    api.importSharedLead.mockResolvedValue({ table: 'jobs', row: {} });
    render(<LeadsPanel mode="team" />);
    fireEvent.click(await screen.findByRole('tab', { name: /Shared with me/ }));
    fireEvent.change(screen.getByLabelText('Import Microsoft as'), { target: { value: 'applied' } });
    fireEvent.click(screen.getByText('Import'));
    await waitFor(() => expect(api.importSharedLead).toHaveBeenCalledWith('s1', 'applied'));
  });

  it('does not offer to import a lead that is already in my pipeline', async () => {
    api.fetchSharedLeads.mockResolvedValue([sharedLead({ alreadyImported: true })]);
    render(<LeadsPanel mode="team" />);
    fireEvent.click(await screen.findByRole('tab', { name: /Shared with me/ }));
    expect(screen.getByText('In your pipeline')).toBeTruthy();
    expect(screen.queryByText('Import')).toBeNull();
  });

  it('shows the server error when an import is refused', async () => {
    api.importSharedLead.mockRejectedValue(new Error('Lead not found'));
    render(<LeadsPanel mode="team" />);
    fireEvent.click(await screen.findByRole('tab', { name: /Shared with me/ }));
    fireEvent.click(screen.getByText('Import'));
    expect((await screen.findByRole('alert')).textContent).toContain('Lead not found');
  });

  it('filters by search text', async () => {
    api.fetchMyLeads.mockResolvedValue([mine(), mine({ id: 'm9', company: 'Acme', role: 'Designer' })]);
    render(<LeadsPanel />);
    await screen.findByText('Google');
    fireEvent.change(screen.getByLabelText('Search leads'), { target: { value: 'acme' } });
    expect(screen.queryByText('Google')).toBeNull();
    expect(screen.getByText('Acme')).toBeTruthy();
  });
});
