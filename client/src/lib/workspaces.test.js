import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_VIEWS, WORKSPACE_TABS, loadWorkspace, saveWorkspace } from './workspaces';

const ids = (ws) => WORKSPACE_TABS[ws].map((t) => t.id);

beforeEach(() => window.localStorage.clear());

describe('workspace tabs', () => {
  it('Personal has exactly the personal tabs', () => {
    expect(ids('personal')).toEqual(['dashboard', 'leads', 'contacts', 'board', 'table', 'graph', 'progress', 'notes', 'guide']);
  });
  it('Team has the seven collaboration pages, opening on the overview', () => {
    expect(ids('team')).toEqual(['overview', 'leads', 'contacts', 'notes', 'peers', 'activity', 'guide']);
    expect(DEFAULT_VIEWS.team).toBe('overview');
  });
  it('keeps private-only tabs out of Team', () => {
    for (const tab of ['dashboard', 'board', 'table', 'graph', 'progress']) expect(ids('team')).not.toContain(tab);
  });
  it('keeps Peers out of Personal', () => {
    expect(ids('personal')).not.toContain('peers');
  });
  it('each workspace opens on a tab that exists in it', () => {
    for (const ws of ['personal', 'team']) expect(ids(ws)).toContain(DEFAULT_VIEWS[ws]);
  });
});

describe('workspace persistence', () => {
  it('defaults to personal', () => {
    expect(loadWorkspace()).toBe('personal');
  });
  it('remembers the last workspace', () => {
    saveWorkspace('team');
    expect(loadWorkspace()).toBe('team');
  });
  it('ignores an unknown stored value and refuses to save one', () => {
    window.localStorage.setItem('devscale.workspace', 'admin');
    expect(loadWorkspace()).toBe('personal');
    saveWorkspace('admin');
    expect(window.localStorage.getItem('devscale.workspace')).toBe('admin'); // untouched, not overwritten
  });
  it('still works when storage is blocked', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(loadWorkspace()).toBe('personal');
    spy.mockRestore();
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => saveWorkspace('team')).not.toThrow();
    set.mockRestore();
  });
});
