import { Bookmark, Send, Users, PartyPopper, XCircle } from 'lucide-react';

export const STATUSES = [
  { id: 'lead', label: 'Lead', short: 'Leads', color: 'var(--status-lead)', icon: Bookmark, description: 'Jobs you found but haven’t applied to yet' },
  { id: 'applied', label: 'Applied', short: 'Applied', color: 'var(--status-applied)', icon: Send, description: 'Application sent, waiting to hear back' },
  { id: 'interviewing', label: 'Interviewing', short: 'Interviews', color: 'var(--status-interviewing)', icon: Users, description: 'In the interview process' },
  { id: 'offer', label: 'Offer', short: 'Offers', color: 'var(--status-offer)', icon: PartyPopper, description: 'Offer received' },
  { id: 'rejected', label: 'Rejected', short: 'Rejected', color: 'var(--status-rejected)', icon: XCircle, description: 'Didn’t move forward' },
];

export const STATUS_MAP = Object.fromEntries(STATUSES.map((s) => [s.id, s]));

export function statusMeta(id) {
  return STATUS_MAP[id] || STATUSES[0];
}

export const SOURCES = ['Manual', 'LinkedIn', 'Careers Page', 'Referral', 'Email', 'Import'];
