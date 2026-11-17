import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('../context/JobsContext', () => ({
  useJobs: () => ({ session: { user: { email: 'v@x.dev' } }, loading: false, error: null, lastSynced: null, refresh: vi.fn(), signOut: vi.fn() }),
}));

import Layout from './Layout';
import { resetThemeForTests } from '../lib/useTheme';

afterEach(() => cleanup());

function renderLayout(props) {
  return render(
    <Layout view="dashboard" setView={vi.fn()} setWorkspace={vi.fn()} {...props}>
      <p>content</p>
    </Layout>,
  );
}
const primary = () => within(screen.getByRole('navigation', { name: 'Primary' }));
const bottom = () => within(screen.getByRole('navigation', { name: 'Bottom navigation' }));
const names = (nav) => nav.getAllByRole('button').map((b) => b.getAttribute('aria-label') || b.textContent.trim());

describe('Layout workspaces', () => {
  it('shows the personal tabs in Personal and no Peers', () => {
    renderLayout({ workspace: 'personal' });
    const labels = names(primary());
    for (const l of ['Dashboard', 'Leads', 'Contacts', 'Board', 'Table', 'Graph', 'LeetCode', 'Notes']) expect(labels).toContain(l);
    expect(labels).not.toContain('Peers');
  });

  it('shows only the team tabs in Team', () => {
    renderLayout({ workspace: 'team', view: 'leads' });
    const labels = names(primary());
    for (const l of ['Leads', 'Contacts', 'Notes', 'Peers']) expect(labels).toContain(l);
    for (const l of ['Dashboard', 'Board', 'Table', 'Graph', 'LeetCode']) expect(labels).not.toContain(l);
  });

  it('marks the active workspace and switches on click', () => {
    const setWorkspace = vi.fn();
    renderLayout({ workspace: 'personal', setWorkspace });
    expect(screen.getByRole('radio', { name: 'Personal' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Team' }).getAttribute('aria-checked')).toBe('false');
    fireEvent.click(screen.getByRole('radio', { name: 'Team' }));
    expect(setWorkspace).toHaveBeenCalledWith('team');
  });

  it('bottom bar: Personal is Home, Leads, Contacts, More', () => {
    renderLayout({ workspace: 'personal' });
    expect(names(bottom())).toEqual(['Home', 'Leads', 'Contacts', 'More']);
  });

  it('bottom bar: Team is Home, Leads, Peers, More', () => {
    renderLayout({ workspace: 'team', view: 'overview' });
    expect(names(bottom())).toEqual(['Home', 'Leads', 'Peers', 'More']);
  });

  it('More opens the remaining tabs and navigates', () => {
    const setView = vi.fn();
    renderLayout({ workspace: 'personal', setView });
    fireEvent.click(bottom().getByRole('button', { name: 'More' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'More pages' })).getByRole('button', { name: 'Board' }));
    expect(setView).toHaveBeenCalledWith('board');
  });

  it('has a light/dark toggle in the header that switches the whole page', () => {
    localStorage.clear();
    document.documentElement.classList.remove('dark', 'light');
    resetThemeForTests();
    renderLayout({ workspace: 'personal' });
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }));
    expect(document.documentElement.classList.contains('light')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('has a Profile entry in the account menu that opens the profile page', () => {
    window.location.hash = '';
    renderLayout({ workspace: 'personal' });
    fireEvent.click(screen.getByLabelText('Account menu'));
    fireEvent.click(screen.getByRole('menuitem', { name: /Profile/ }));
    expect(window.location.hash).toBe('#/profile');
    expect(screen.queryByRole('menuitem', { name: /Profile/ })).toBeNull(); // the menu closes
    window.location.hash = '';
  });
});
