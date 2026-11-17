// Pure helpers for the Team workspace. Everything here works on data the signed-in user is
// already allowed to read (own rows plus what the database's sharing functions return).

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_COLORS = ['#477eff', '#9b7cff', '#27c995', '#f3bb61', '#f16c78', '#38bdf8'];
export function avatarColor(name) {
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

const WEEK = 7 * 24 * 3600 * 1000;

// Buckets timestamps into the last `weeks` calendar weeks (oldest first, W1…Wn). Each item
// is { at, series } and is counted under its series key.
export function weeklyBuckets(items, seriesKeys, weeks = 12, now = Date.now()) {
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const b = { label: `W${i + 1}`, start: now - (weeks - i) * WEEK };
    for (const k of seriesKeys) b[k] = 0;
    return b;
  });
  for (const it of items) {
    const t = Date.parse(it.at);
    if (Number.isNaN(t) || t > now) continue;
    const idx = weeks - 1 - Math.floor((now - t) / WEEK);
    if (idx >= 0 && idx < weeks && it.series in buckets[idx]) buckets[idx][it.series] += 1;
  }
  return buckets;
}

export function relativeTime(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDate(iso) {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const key = (company, role) => `${String(company || '').trim().toLowerCase()}|${String(role || '').trim().toLowerCase()}`;

// The signed-in user's OWN application status for a lead, found by matching their own
// jobs. A peer's status is never involved — it is never sent to the client.
export function myStatusFor(lead, jobs) {
  const job = (jobs || []).find((j) => key(j.company, j.role) === key(lead.company, lead.role));
  return job ? job.status : null;
}

// Timeline built only from records this user may read: their own rows, accepted peers'
// peer-visible rows, and their own pending requests. Times are the records' own timestamps.
export function buildActivity({ peers = [], myLeads = [], sharedLeads = [], myContacts = [], sharedContacts = [] }) {
  const ev = [];
  for (const p of peers) {
    const name = p.name || 'A peer';
    if (p.status === 'accepted' && p.acceptedAt) {
      ev.push(p.direction === 'outgoing'
        ? { id: `peer-${p.id}`, type: 'peer', actor: name, text: 'accepted your peer request', detail: `You and ${name} are now connected`, at: p.acceptedAt, target: 'peers' }
        : { id: `peer-${p.id}`, type: 'peer', actor: 'You', text: `accepted ${name}'s peer request`, detail: `You and ${name} are now connected`, at: p.acceptedAt, target: 'peers' });
    } else if (p.status === 'pending') {
      ev.push(p.direction === 'incoming'
        ? { id: `peer-${p.id}`, type: 'peer', actor: name, text: 'sent you a peer request', detail: 'Waiting for your response', at: p.createdAt, target: 'peers' }
        : { id: `peer-${p.id}`, type: 'peer', actor: 'You', text: `sent ${name} a peer request`, detail: 'Waiting for them to accept', at: p.createdAt, target: 'peers' });
    }
  }
  for (const l of sharedLeads) {
    ev.push({ id: `sl-${l.id}`, type: 'lead', actor: l.owner || 'A peer', text: 'shared a job lead', detail: `${l.company} — ${l.role}`, at: l.createdAt, target: 'leads' });
  }
  for (const l of myLeads) {
    if (l.visibility !== 'peer') continue;
    ev.push({ id: `ml-${l.id}`, type: 'lead', actor: 'You', text: 'shared a job lead', detail: `${l.company} — ${l.role}`, at: l.createdAt, target: 'leads' });
  }
  for (const c of sharedContacts) {
    ev.push({ id: `sc-${c.id}`, type: 'contact', actor: c.owner || 'A peer', text: 'shared a contact', detail: `${c.name} — ${[c.designation, c.company].filter(Boolean).join(', ')}`, at: c.createdAt, target: 'contacts' });
  }
  for (const c of myContacts) {
    if (c.visibility !== 'peer') continue;
    ev.push({ id: `mc-${c.id}`, type: 'contact', actor: 'You', text: 'shared a contact', detail: `${c.name} — ${[c.designation, c.company].filter(Boolean).join(', ')}`, at: c.createdAt, target: 'contacts' });
  }
  return ev.filter((e) => !Number.isNaN(Date.parse(e.at))).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
