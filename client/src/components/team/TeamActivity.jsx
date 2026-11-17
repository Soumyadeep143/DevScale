import { useMemo, useState } from 'react';
import { Activity as ActivityIcon, History } from 'lucide-react';
import PageHeader from '../ui/PageHeader';
import EmptyState from '../ui/EmptyState';
import LoadingSkeleton from '../ui/LoadingSkeleton';
import SearchAndFilter, { FilterSelect } from '../ui/SearchAndFilter';
import { useTeamData } from '../../lib/useTeamData';
import { buildActivity } from '../../lib/team';
import { Notice, PillTabs, muted } from './parts';
import ActivityTimeline from './ActivityTimeline';

const TYPES = [
  { id: 'all', label: 'All Activity' },
  { id: 'lead', label: 'Lead Sharing' },
  { id: 'contact', label: 'Contact Sharing' },
  { id: 'peer', label: 'Peer Connections' },
  { id: 'visibility', label: 'Visibility Changes' },
];
const RANGES = [
  { value: 'all', label: 'Any time' }, { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' },
];

export default function TeamActivity({ onNavigate }) {
  const { peers, myLeads, sharedLeads, myContacts, sharedContacts, loading, error } = useTeamData();
  const [type, setType] = useState('all');
  const [q, setQ] = useState('');
  const [who, setWho] = useState('all');
  const [range, setRange] = useState('all');

  const all = useMemo(() => buildActivity({ peers, myLeads, sharedLeads, myContacts, sharedContacts }),
    [peers, myLeads, sharedLeads, myContacts, sharedContacts]);
  const actors = useMemo(() => [...new Set(all.map((e) => e.actor))].sort(), [all]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const cutoff = range === 'all' ? 0 : Date.now() - Number(range) * 86400000;
    return all.filter((e) =>
      (type === 'all' || e.type === type) &&
      (who === 'all' || e.actor === who) &&
      Date.parse(e.at) >= cutoff &&
      (!needle || `${e.actor} ${e.text} ${e.detail}`.toLowerCase().includes(needle)));
  }, [all, type, who, range, q]);

  return (
    <div className="space-y-4">
      <PageHeader title="Team Activity" subtitle="A timeline of recent collaboration across your peer network." />
      <PillTabs label="Activity type" tabs={TYPES} value={type} onChange={setType} />
      <SearchAndFilter search={q} onSearch={setQ} placeholder="Search activity…" searchLabel="Search activity">
        <FilterSelect value={who} onChange={setWho} label="Filter by peer" options={[{ value: 'all', label: 'All peers' }, ...actors.map((a) => ({ value: a, label: a }))]} />
        <FilterSelect value={range} onChange={setRange} label="Date range" options={RANGES} />
      </SearchAndFilter>
      <Notice err={error} />
      {loading ? <LoadingSkeleton rows={5} height={64} label="Loading activity" /> : type === 'visibility' ? (
        <EmptyState icon={History} title="Visibility changes aren't recorded yet">
          Changes to who can see a lead or contact are not logged, so there is nothing to show here yet.
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState icon={ActivityIcon} title="No activity to show">
          {all.length === 0 ? 'When you and your peers share leads and contacts or connect, it will appear here.' : 'No activity matches your filters.'}
        </EmptyState>
      ) : (
        <ActivityTimeline events={shown} onOpen={(target) => onNavigate && onNavigate(target)} />
      )}
      {!loading && shown.length > 0 && (
        <p className="text-xs" style={muted}>Times for shared leads and contacts are when each record was added.</p>
      )}
    </div>
  );
}
