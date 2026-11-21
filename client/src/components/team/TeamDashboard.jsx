import { useMemo } from 'react';
import { Users, Send, Inbox, Contact, UserPlus, Share2, Plus, Settings2, ArrowRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import PageHeader, { primaryBtn, ghostBtn } from '../ui/PageHeader';
import Panel from '../ui/Panel';
import EmptyState from '../ui/EmptyState';
import LoadingSkeleton from '../ui/LoadingSkeleton';
import { useTeamData } from '../../lib/useTeamData';
import { buildActivity, weeklyBuckets } from '../../lib/team';
import { TeamStatCard, Avatar, Notice, muted } from './parts';
import { TeamActivityCard } from './ActivityTimeline';

const ACTIONS = [
  { id: 'connect', label: 'Connect Peer', hint: 'Use a Peer Code', icon: UserPlus, color: 'var(--brand)', view: 'peers', action: 'connect' },
  { id: 'lead', label: 'Move Lead to Team', hint: 'Share a job with peers', icon: Share2, color: 'var(--green)', view: 'leads', action: 'share' },
  { id: 'contact', label: 'Move Contact to Team', hint: 'Share a professional contact', icon: Plus, color: 'var(--purple)', view: 'contacts', action: 'share' },
  { id: 'manage', label: 'Manage Peers', hint: 'Requests and connections', icon: Settings2, color: 'var(--amber)', view: 'peers' },
];

export default function TeamDashboard({ onNavigate }) {
  const { peers, myLeads, sharedLeads, myContacts, sharedContacts, loading, error } = useTeamData();
  const go = (view, action) => onNavigate && onNavigate(view, action);

  const stats = useMemo(() => {
    const byMe = myLeads.filter((l) => l.visibility === 'peer');
    const contactsByMe = myContacts.filter((c) => c.visibility === 'peer');
    const pending = peers.filter((p) => p.status === 'pending');
    return {
      connected: peers.filter((p) => p.status === 'accepted'),
      byMe,
      pending,
      incoming: pending.filter((p) => p.direction === 'incoming').length,
      contactsByMe: contactsByMe.length,
      contactsTotal: contactsByMe.length + sharedContacts.length,
    };
  }, [peers, myLeads, myContacts, sharedContacts]);

  const chart = useMemo(() => weeklyBuckets(
    [...stats.byMe.map((l) => ({ at: l.createdAt, series: 'byMe' })), ...sharedLeads.map((l) => ({ at: l.createdAt, series: 'withMe' }))],
    ['byMe', 'withMe'],
  ), [stats.byMe, sharedLeads]);
  const chartTotal = chart.reduce((n, b) => n + b.byMe + b.withMe, 0);

  const events = useMemo(() => buildActivity({ peers, myLeads, sharedLeads, myContacts, sharedContacts }).slice(0, 5),
    [peers, myLeads, sharedLeads, myContacts, sharedContacts]);

  const v = (n) => (loading ? '—' : n);

  return (
    <div className="space-y-5 min-w-0">
      <PageHeader title="Team Overview" subtitle="Collaborate, share opportunities, and grow together.">
        <button onClick={() => go('peers', 'connect')} className={primaryBtn} style={{ background: 'var(--brand)' }}><UserPlus size={15} /> Connect Peer</button>
        <button onClick={() => go('leads', 'share')} className={`${ghostBtn} hidden sm:inline-flex whitespace-nowrap`} style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}><Share2 size={15} /> Move Lead to Team</button>
        <button onClick={() => go('contacts', 'share')} className={`${ghostBtn} hidden sm:inline-flex whitespace-nowrap`} style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}><Plus size={15} /> Add Contact</button>
      </PageHeader>

      <Notice err={error} />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <TeamStatCard label="Connected Peers" value={v(stats.connected.length)} icon={Users} color="var(--brand)" />
        <TeamStatCard label="Leads Shared by Me" value={v(stats.byMe.length)} icon={Send} color="var(--green)" />
        <TeamStatCard label="Leads Shared With Me" value={v(sharedLeads.length)} icon={Inbox} color="var(--purple)" />
        <TeamStatCard label="Shared Contacts" value={v(stats.contactsTotal)} sub={loading ? '' : `${stats.contactsByMe} by me · ${sharedContacts.length} with me`} icon={Contact} color="var(--amber)" />
        <TeamStatCard label="Pending Requests" value={v(stats.pending.length)} sub={loading ? '' : `${stats.incoming} incoming`} icon={UserPlus} color="var(--red)" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 min-w-0">
        <Panel className="lg:col-span-3" title="Shared Leads (Last 12 Weeks)" subtitle="Leads in your team, by the week they were added">
          {loading ? <LoadingSkeleton rows={1} height={220} label="Loading chart" /> : chartTotal === 0 ? (
            <p className="text-sm text-center py-16" style={muted}>No shared leads in the last 12 weeks.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chart} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--grid)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'var(--surface-2)' }} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="byMe" name="Shared by me" stackId="a" fill="var(--brand)" />
                <Bar dataKey="withMe" name="Shared with me" stackId="a" fill="var(--purple)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel className="lg:col-span-2" title="Recent Team Activity"
          action={<button onClick={() => go('activity')} className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--brand)' }}>View all <ArrowRight size={11} /></button>}>
          {loading ? <LoadingSkeleton rows={4} height={40} label="Loading activity" /> : events.length === 0 ? (
            <p className="text-sm py-8 text-center" style={muted}>No team activity yet.</p>
          ) : (
            <ul className="space-y-3.5">{events.map((e) => <li key={e.id}><TeamActivityCard event={e} compact /></li>)}</ul>
          )}
        </Panel>
      </div>

      <Panel title="Your peer network" subtitle="Peers you are connected with" padded>
        {loading ? <LoadingSkeleton rows={1} height={44} label="Loading peers" /> : stats.connected.length === 0 ? (
          <EmptyState icon={Users} title="No peers yet" action={<button onClick={() => go('peers', 'connect')} className={primaryBtn} style={{ background: 'var(--brand)' }}><UserPlus size={15} /> Connect Peer</button>}>
            Share your Peer Code or enter a friend&apos;s to start sharing leads and contacts.
          </EmptyState>
        ) : (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            {stats.connected.slice(0, 8).map((p) => (
              <div key={p.id} className="flex items-center gap-2 min-w-0"><Avatar name={p.name} size={32} /><span className="text-sm truncate max-w-[9rem]" style={{ color: 'var(--text-secondary)' }}>{p.name || 'Unnamed peer'}</span></div>
            ))}
            {stats.connected.length > 8 && <span className="text-xs" style={muted}>+{stats.connected.length - 8} more</span>}
          </div>
        )}
      </Panel>

      <div>
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Quick actions</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <button key={a.id} onClick={() => go(a.view, a.action)}
                className="text-left rounded-2xl border p-4 transition hover:-translate-y-0.5 min-h-[88px]"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                <span className="w-9 h-9 rounded-xl flex items-center justify-center mb-2.5" style={{ background: `color-mix(in oklab, ${a.color} 20%, var(--surface-2))` }}><Icon size={18} style={{ color: a.color }} /></span>
                <span className="block text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{a.label}</span>
                <span className="block text-xs mt-0.5" style={muted}>{a.hint}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
