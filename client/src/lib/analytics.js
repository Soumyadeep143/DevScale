import { STATUSES } from './statusConfig';

// Everything here is derived from the user's own job list — no placeholders.
const DAY = 86400000;

export const isApplication = (j) => j.status !== 'lead';

// The date a job counts toward on time-based charts.
export function jobDate(j) {
  const d = j.dateApplied || (j.createdAt ? String(j.createdAt).slice(0, 10) : '');
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';
}

const toDate = (iso) => new Date(`${iso}T00:00:00`);
export const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function startOfWeek(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday
  return x;
}

// range: { days } | { from, to } (ISO dates). `now` is injectable for tests.
export function rangeBounds(range, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range.from || range.to) {
    return { from: range.from || '0000-01-01', to: range.to || isoDay(today) };
  }
  const from = new Date(today.getTime() - (range.days - 1) * DAY);
  return { from: isoDay(from), to: isoDay(today) };
}

export function filterByRange(jobs, range, now) {
  const { from, to } = rangeBounds(range, now);
  return jobs.filter((j) => {
    const d = jobDate(j);
    return d && d >= from && d <= to;
  });
}

export function statusCounts(jobs) {
  return STATUSES.map((s) => ({ id: s.id, label: s.label, color: s.color, count: jobs.filter((j) => j.status === s.id).length }));
}

// Buckets jobs per day (short ranges) or per week (long ones) across the whole range.
export function activitySeries(jobs, range, now) {
  const { from, to } = rangeBounds(range, now);
  const start = toDate(from);
  const end = toDate(to);
  const spanDays = Math.round((end - start) / DAY) + 1;
  const weekly = spanDays > 35;
  const buckets = new Map();
  const cursor = weekly ? startOfWeek(start) : new Date(start);
  while (cursor <= end) {
    buckets.set(isoDay(cursor), { key: isoDay(cursor), total: 0, applied: 0 });
    cursor.setDate(cursor.getDate() + (weekly ? 7 : 1));
  }
  for (const j of jobs) {
    const d = jobDate(j);
    if (!d || d < from || d > to) continue;
    const key = weekly ? isoDay(startOfWeek(toDate(d))) : d;
    const b = buckets.get(key);
    if (!b) continue;
    b.total += 1;
    if (isApplication(j)) b.applied += 1;
  }
  const fmt = (k) => toDate(k).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return { weekly, points: [...buckets.values()].map((b) => ({ ...b, label: fmt(b.key) })) };
}

export function monthlySeries(jobs, months = 6, now = new Date()) {
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString(undefined, { month: 'short' }), count: 0 });
  }
  const idx = new Map(out.map((m) => [m.key, m]));
  for (const j of jobs) {
    const d = jobDate(j);
    const m = d && idx.get(d.slice(0, 7));
    if (m) m.count += 1;
  }
  return out;
}

export function topBy(jobs, field, limit = 8) {
  const map = new Map();
  for (const j of jobs) {
    const k = (j[field] || '').trim() || 'Unknown';
    map.set(k, (map.get(k) || 0) + 1);
  }
  return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, limit);
}

// Share of applications that are interviewing or further, and the share that have any response.
// Returns null when there are too few applications for a percentage to mean anything.
export const MIN_FOR_RATES = 5;
export function conversion(jobs) {
  const apps = jobs.filter(isApplication);
  if (apps.length < MIN_FOR_RATES) return null;
  const n = (s) => apps.filter((j) => j.status === s).length;
  const interviewing = n('interviewing');
  const offers = n('offer');
  const rejected = n('rejected');
  const pct = (x) => Math.round((x / apps.length) * 100);
  return {
    applications: apps.length,
    interviewRate: pct(interviewing + offers),
    responseRate: pct(interviewing + offers + rejected),
    offerRate: pct(offers),
    stages: [
      { label: 'Applications', count: apps.length },
      { label: 'Interviewing or beyond', count: interviewing + offers },
      { label: 'Offers', count: offers },
    ],
  };
}

export function timeAgo(iso, now = Date.now()) {
  if (!iso) return '';
  const mins = Math.round((now - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
