import { Briefcase, Contact, UserCheck, ArrowRight } from 'lucide-react';
import { relativeTime } from '../../lib/team';
import { Avatar, muted } from './parts';

const TYPE = {
  lead: { icon: Briefcase, color: 'var(--green)' },
  contact: { icon: Contact, color: 'var(--purple)' },
  peer: { icon: UserCheck, color: 'var(--brand)' },
};

export function TeamActivityCard({ event, onOpen, compact = false }) {
  const t = TYPE[event.type] || TYPE.peer;
  const Icon = t.icon;
  return (
    <div className="flex items-start gap-3 min-w-0">
      <span className="relative shrink-0">
        <Avatar name={event.actor === 'You' ? 'You' : event.actor} size={compact ? 32 : 40} />
        <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: t.color }}>
          <Icon size={9} color="#fff" />
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm break-words" style={{ color: 'var(--text-primary)' }}>
          <span className="font-semibold">{event.actor}</span> {event.text}
        </p>
        {event.detail && <p className="text-xs truncate" style={muted}>{event.detail}</p>}
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1">
        <time dateTime={event.at} className="text-xs whitespace-nowrap" style={muted}>{relativeTime(event.at)}</time>
        {onOpen && !compact && (
          <button onClick={() => onOpen(event.target)} className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--brand)' }}>
            View <ArrowRight size={11} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function ActivityTimeline({ events, onOpen }) {
  return (
    <ol className="relative space-y-3">
      {events.map((e) => (
        <li key={e.id} className="rounded-xl border p-3 sm:p-3.5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <TeamActivityCard event={e} onOpen={onOpen} />
        </li>
      ))}
    </ol>
  );
}
