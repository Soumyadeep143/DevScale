import {
  LayoutDashboard, Kanban, Table2, ListChecks, StickyNote, Share2, Users, Inbox, Contact, HelpCircle, User,
  Activity, Home, MoreHorizontal,
} from 'lucide-react';

// The app has two workspaces. Personal is everything private to you; Team is the
// sharing side, built on accepted peers. Which data a person may see is decided
// by the database — this only chooses what the navigation shows.
export const WORKSPACES = [
  { id: 'personal', label: 'Personal', icon: User },
  { id: 'team', label: 'Team', icon: Users },
];

export const WORKSPACE_TABS = {
  personal: [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'leads', label: 'Leads', icon: Inbox },
    { id: 'contacts', label: 'Contacts', icon: Contact },
    { id: 'board', label: 'Board', icon: Kanban },
    { id: 'table', label: 'Table', icon: Table2 },
    { id: 'graph', label: 'Graph', icon: Share2 },
    { id: 'progress', label: 'LeetCode', icon: ListChecks },
    { id: 'notes', label: 'Notes', icon: StickyNote },
    { id: 'guide', label: 'Guide', icon: HelpCircle },
  ],
  team: [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'leads', label: 'Leads', icon: Inbox },
    { id: 'contacts', label: 'Contacts', icon: Contact },
    { id: 'notes', label: 'Notes', icon: StickyNote },
    { id: 'peers', label: 'Peers', icon: Users },
    { id: 'activity', label: 'Activity', icon: Activity },
    { id: 'guide', label: 'Guide', icon: HelpCircle },
  ],
};

export const DEFAULT_VIEWS = { personal: 'dashboard', team: 'overview' };

// Mobile bottom navigation: three primary destinations plus "More", which lists
// every other tab of the workspace.
export const MOBILE_PRIMARY = {
  personal: [
    { id: 'dashboard', label: 'Home', icon: Home },
    { id: 'leads', label: 'Leads', icon: Inbox },
    { id: 'contacts', label: 'Contacts', icon: Contact },
  ],
  team: [
    { id: 'overview', label: 'Home', icon: Home },
    { id: 'leads', label: 'Leads', icon: Inbox },
    { id: 'peers', label: 'Peers', icon: Users },
  ],
};
export const MORE_ICON = MoreHorizontal;

export function moreTabs(workspace) {
  const primary = new Set((MOBILE_PRIMARY[workspace] || []).map((t) => t.id));
  return (WORKSPACE_TABS[workspace] || []).filter((t) => !primary.has(t.id));
}

const STORAGE_KEY = 'devscale.workspace';
const VIEWS_KEY = 'devscale.views';

export function isWorkspace(id) {
  return WORKSPACES.some((w) => w.id === id);
}

// Browser storage can be blocked or empty (private windows etc.), so every access is guarded.
export function loadWorkspace() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return isWorkspace(saved) ? saved : 'personal';
  } catch {
    return 'personal';
  }
}

export function saveWorkspace(id) {
  try {
    if (isWorkspace(id)) window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* a convenience only — ignore */
  }
}

// The last page of each workspace, restored on refresh. Anything stored that is no
// longer a valid tab of that workspace falls back to the workspace default.
export function loadViews() {
  const views = { ...DEFAULT_VIEWS };
  try {
    const saved = JSON.parse(window.localStorage.getItem(VIEWS_KEY) || '{}');
    for (const ws of Object.keys(DEFAULT_VIEWS)) {
      if (WORKSPACE_TABS[ws].some((t) => t.id === saved?.[ws])) views[ws] = saved[ws];
    }
  } catch {
    /* ignore */
  }
  return views;
}

export function saveViews(views) {
  try {
    window.localStorage.setItem(VIEWS_KEY, JSON.stringify(views));
  } catch {
    /* ignore */
  }
}

// URL routing: the hash is the source of truth for workspace + tab, e.g. #/team/peers.
// Hash routing needs no server rewrite rules. localStorage is only the fallback for a bare URL;
// what data you can see is still decided by the database, never by this.
export function parseRoute(hash) {
  const m = /^#\/(personal|team)(?:\/([\w-]+))?\/?$/.exec(hash || '');
  if (!m) return null;
  const workspace = m[1];
  const valid = WORKSPACE_TABS[workspace].some((t) => t.id === m[2]);
  return { workspace, view: valid ? m[2] : DEFAULT_VIEWS[workspace] };
}

export function formatRoute(workspace, view) {
  return `#/${workspace}/${view}`;
}
