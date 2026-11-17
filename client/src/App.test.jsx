import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, within, render, screen } from '@testing-library/react';

// Real App + Layout + workspace logic; every screen is a marker so this tests navigation only.
const authState = vi.hoisted(() => ({ session: { user: { id: 'u1' } }, configured: true }));
vi.mock('./context/JobsContext', () => ({
  JobsProvider: ({ children }) => children,
  useJobs: () => ({
    ...authState, jobs: [{ id: 'j1', company: 'Acme', role: 'Dev', status: 'applied', location: '' }],
    loading: false, error: null, lastSynced: null, refresh: () => {}, signOut: () => {},
  }),
}));
vi.mock('./lib/useTheme', () => ({ useTheme: () => ({ theme: 'light', toggle: () => {} }) }));
const { stub, modeStub } = vi.hoisted(() => ({
  stub: (name) => async () => {
    const { createElement } = await import('react');
    return { default: () => createElement('div', { 'data-testid': name }, name) };
  },
  modeStub: (name) => async () => {
    const { createElement } = await import('react');
    return { default: ({ mode }) => createElement('div', { 'data-testid': `${name}:${mode}` }, name) };
  },
}));
vi.mock('./components/AuthScreen', stub('auth'));
vi.mock('./components/Dashboard', stub('dashboard'));
vi.mock('./components/Board', stub('board'));
vi.mock('./components/TableView', stub('table'));
vi.mock('./components/Progress', stub('progress'));
vi.mock('./components/JobModal', () => ({ default: () => null }));
vi.mock('./components/ImportModal', () => ({ default: () => null }));
vi.mock('./components/AIAssistant', () => ({ default: () => null }));
vi.mock('./components/NotesPanel', stub('notes'));
vi.mock('./components/Analytics', stub('graph'));
vi.mock('./components/MyLeads', modeStub('leads:personal-page'));
vi.mock('./components/Guide', stub('guide'));
vi.mock('./components/ProfilePage', stub('profile'));
vi.mock('./components/PeersPanel', stub('peers'));
vi.mock('./components/team/TeamDashboard', stub('team-overview'));
vi.mock('./components/team/TeamLeads', stub('team-leads'));
vi.mock('./components/team/TeamContacts', stub('team-contacts'));
vi.mock('./components/team/TeamActivity', stub('team-activity'));
vi.mock('./components/team/TeamGuide', stub('team-guide'));
vi.mock('./components/ContactsPanel', modeStub('contacts'));

import App from './App';

// Workspace pills are radios; tabs are scoped to the desktop "Primary" nav (the bottom bar repeats some names).
const tab = (name) => (['Personal', 'Team'].includes(name)
  ? screen.getByRole('radio', { name })
  : within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('button', { name }));
beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
  Object.assign(authState, { session: { user: { id: 'u1' } }, configured: true });
});
afterEach(() => cleanup());

describe('App workspaces', () => {
  it('opens in Personal on the dashboard', () => {
    render(<App />);
    expect(screen.getByTestId('dashboard')).toBeTruthy();
  });

  it('Personal Leads and Contacts use personal mode', () => {
    render(<App />);
    fireEvent.click(tab('Leads'));
    expect(screen.getByTestId('leads:personal-page:undefined')).toBeTruthy(); // personal Leads is the MyLeads page
    fireEvent.click(tab('Contacts'));
    expect(screen.getByTestId('contacts:personal')).toBeTruthy();
  });

  it('switching to Team opens the overview, then each of the other five pages', () => {
    render(<App />);
    fireEvent.click(tab('Team'));
    expect(screen.getByTestId('team-overview')).toBeTruthy();
    for (const [name, id] of [['Leads', 'team-leads'], ['Contacts', 'team-contacts'], ['Peers', 'peers'], ['Activity', 'team-activity'], ['Guide', 'team-guide']]) {
      fireEvent.click(tab(name));
      expect(screen.getByTestId(id)).toBeTruthy();
    }
  });

  it('each workspace remembers its own last tab', () => {
    render(<App />);
    fireEvent.click(tab('Board'));
    expect(screen.getByTestId('board')).toBeTruthy();
    fireEvent.click(tab('Team'));
    fireEvent.click(tab('Peers'));
    fireEvent.click(tab('Personal'));
    expect(screen.getByTestId('board')).toBeTruthy(); // back where we left Personal
    fireEvent.click(tab('Team'));
    expect(screen.getByTestId('peers')).toBeTruthy(); // and where we left Team
  });

  it('puts workspace and tab in the URL, and a direct URL opens that tab', () => {
    const first = render(<App />);
    expect(window.location.hash).toBe('#/personal/dashboard');
    fireEvent.click(tab('Team'));
    fireEvent.click(tab('Peers'));
    expect(window.location.hash).toBe('#/team/peers');
    first.unmount();
    window.history.replaceState(null, '', '#/team/contacts');
    window.localStorage.clear();
    render(<App />);
    expect(screen.getByTestId('team-contacts')).toBeTruthy();
  });

  it('follows browser back/forward', async () => {
    render(<App />);
    fireEvent.click(tab('Team'));
    expect(screen.getByTestId('team-overview')).toBeTruthy();
    act(() => { window.location.hash = '#/personal/board'; });
    expect(await screen.findByTestId('board')).toBeTruthy();
  });

  it('falls back to the default tab for an unknown tab in the URL', () => {
    window.history.replaceState(null, '', '#/team/board');
    render(<App />);
    expect(screen.getByTestId('team-overview')).toBeTruthy();
  });

  it('remembers the workspace across reloads', () => {
    const first = render(<App />);
    fireEvent.click(tab('Team'));
    first.unmount();
    window.history.replaceState(null, '', '/');
    render(<App />);
    expect(screen.getByTestId('team-overview')).toBeTruthy();
  });

  it('private tabs are unreachable from Team', () => {
    render(<App />);
    fireEvent.click(tab('Team'));
    for (const name of ['Dashboard', 'Board', 'Table', 'Graph', 'LeetCode']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });

  it('shows the sign-in screen when signed out', () => {
    Object.assign(authState, { session: null, configured: false });
    render(<App />);
    expect(screen.getByTestId('auth')).toBeTruthy();
    expect(screen.queryByTestId('dashboard')).toBeNull();
  });

  it('opens the profile page at #/profile, and any tab leaves it', () => {
    window.location.hash = '#/profile';
    render(<App />);
    expect(screen.getByTestId('profile')).toBeTruthy();
    expect(screen.queryByTestId('dashboard')).toBeNull();
    fireEvent.click(tab('Board'));
    expect(screen.queryByTestId('profile')).toBeNull();
    expect(screen.getByTestId('board')).toBeTruthy();
  });
});
