import { useState } from 'react';
import { BookOpen, Share2, Contact, Users, ShieldCheck, Lightbulb, ArrowRight, ArrowLeft } from 'lucide-react';
import PageHeader from '../ui/PageHeader';

const GUIDES = [
  { id: 'collab', title: 'Team Collaboration', blurb: 'How to work together effectively', icon: BookOpen, color: 'var(--brand)', body: [
    ['Two workspaces', 'Personal is private to you. Team is where you collaborate with peers you have connected with. Switch between them with the Personal / Team toggle at the top.'],
    ['Where to start', 'Open Peers, share your Peer Code or enter a friend’s, and wait for them to accept. Once connected, you can see what each other shares.'],
    ['What peers can see', 'Only the leads and contacts you explicitly mark as shared. Your own pipeline, application statuses and notes are never visible to peers.'],
  ] },
  { id: 'leads', title: 'Sharing Leads', blurb: 'Share and manage opportunities', icon: Share2, color: 'var(--green)', body: [
    ['Share a lead', 'On Team → Leads choose Move Lead to Team and pick one of your personal leads (or use Move to Team on Personal → Leads). It leaves your Personal list and becomes visible to your accepted peers. Use Move to Personal to bring it back.'],
    ['Import a lead', 'When a peer shares a lead you can Save it to Personal. That creates your own copy in your pipeline, at the stage you choose.'],
    ['Your status is yours', 'Each person has their own application status. Importing never links the two copies, and nothing you change is visible to the person who shared it.'],
  ] },
  { id: 'contacts', title: 'Sharing Contacts', blurb: 'Best practices for contact sharing', icon: Contact, color: 'var(--purple)', body: [
    ['Share a contact', 'On Team → Contacts choose Share Contact and pick one of your contacts, or add a new one. Shared contacts show name, email, phone, company, designation and LinkedIn. Your private notes are never shared.'],
    ['Save a copy', 'A peer can save a copy of a shared contact to their own contacts. The copy is independent: edits to it do not change yours, and yours do not change theirs.'],
    ['Ownership', 'Only the owner can edit, delete or stop sharing a contact.'],
  ] },
  { id: 'network', title: 'Peer Network', blurb: 'Connect and grow your network', icon: Users, color: 'var(--amber)', body: [
    ['Peer Code', 'Every account has a unique Peer Code (PEER-XXXXXX). Share it with people you trust; it does not change.'],
    ['Requests', 'Enter someone’s code to send a request. They can accept or reject it, and you can cancel a request you sent while it is pending. If you both send a request to each other, you are connected straight away.'],
    ['Removing a peer', 'Either side can remove a peer at any time. Access to each other’s shared leads and contacts ends immediately; anything already imported or copied stays with the person who imported it.'],
  ] },
  { id: 'privacy', title: 'Privacy and Access', blurb: 'Understand data visibility and access', icon: ShieldCheck, color: 'var(--red)', body: [
    ['Personal vs Peer', 'Every lead and contact is either Personal (only you) or Peer (you and your accepted peers). New records are Personal unless you choose otherwise.'],
    ['Enforced by the database', 'Access rules are enforced on the server, not just in this app. Peers cannot edit or delete your records, and requests for records you are not allowed to see return nothing.'],
    ['Limited profile', 'Peers see your display name and Peer Code. Your email address is not shown to peers.'],
  ] },
  { id: 'practices', title: 'Team Best Practices', blurb: 'Tips for a productive job search together', icon: Lightbulb, color: 'var(--brand)', body: [
    ['Share quality', 'Share leads you would genuinely apply to, with an accurate role, location and link, so peers can act on them quickly.'],
    ['Keep it current', 'If a role closes, stop sharing it so peers do not waste time on it.'],
    ['Respect contacts', 'Only share a contact when you are comfortable with it, and check that their details are correct first.'],
  ] },
];

export default function TeamGuide() {
  const [open, setOpen] = useState(null);
  const g = GUIDES.find((x) => x.id === open);

  if (g) {
    const Icon = g.icon;
    return (
      <div className="max-w-3xl space-y-4">
        <button onClick={() => setOpen(null)} className="inline-flex items-center gap-1.5 text-sm min-h-[40px]" style={{ color: 'var(--brand)' }}><ArrowLeft size={15} /> All guides</button>
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `color-mix(in oklab, ${g.color} 20%, var(--surface-2))` }}><Icon size={22} style={{ color: g.color }} /></span>
          <div><h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>{g.title}</h1><p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{g.blurb}</p></div>
        </div>
        <div className="space-y-3">
          {g.body.map(([h, t]) => (
            <section key={h} className="rounded-2xl border p-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{h}</h2>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t}</p>
            </section>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Team Guide" subtitle="Tips, best practices, and collaboration guides for your team." />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {GUIDES.map((x) => {
          const Icon = x.icon;
          return (
            <button key={x.id} onClick={() => setOpen(x.id)} aria-label={`Open ${x.title}`}
              className="group text-left rounded-2xl border p-4 min-h-[140px] flex flex-col transition hover:-translate-y-0.5"
              style={{ borderColor: `color-mix(in oklab, ${x.color} 25%, var(--border))`, background: `linear-gradient(150deg, color-mix(in oklab, ${x.color} 14%, var(--surface)), var(--surface) 65%)`, boxShadow: 'var(--shadow-sm)' }}>
              <span className="w-11 h-11 rounded-xl flex items-center justify-center mb-3" style={{ background: `color-mix(in oklab, ${x.color} 22%, var(--surface-2))` }}><Icon size={22} style={{ color: x.color }} /></span>
              <span className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{x.title}</span>
              <span className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>{x.blurb}</span>
              <ArrowRight size={16} className="mt-auto self-end transition group-hover:translate-x-0.5" style={{ color: x.color }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
