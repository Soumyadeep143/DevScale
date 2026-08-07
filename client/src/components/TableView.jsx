import { useMemo, useState } from 'react';
import { ArrowUpDown, ExternalLink } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { contactHref } from '../lib/contact';

const COLUMNS = [
  { key: 'company', label: 'Company' },
  { key: 'role', label: 'Role' },
  { key: 'status', label: 'Status' },
  { key: 'location', label: 'Location' },
  { key: 'dateApplied', label: 'Date applied' },
  { key: 'source', label: 'Source' },
];

export default function TableView({ jobs, onOpen }) {
  const [sortKey, setSortKey] = useState('updatedAt');
  const [sortDir, setSortDir] = useState('desc');

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sorted = useMemo(() => {
    const copy = [...jobs];
    copy.sort((a, b) => {
      const av = (a[sortKey] || '').toString().toLowerCase();
      const bv = (b[sortKey] || '').toString().toLowerCase();
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return copy;
  }, [jobs, sortKey, sortDir]);

  if (jobs.length === 0) {
    return (
      <div className="rounded-xl border p-12 text-center" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
        No jobs match your filters.
      </div>
    );
  }

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm" style={{ minWidth: 720 }}>
          <thead>
            <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className="text-left px-4 py-3 font-medium cursor-pointer select-none whitespace-nowrap"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    <ArrowUpDown size={11} style={{ opacity: sortKey === col.key ? 1 : 0.35 }} />
                  </span>
                </th>
              ))}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((job) => (
              <tr
                key={job.id}
                onClick={() => onOpen(job, sorted)}
                className="border-b last:border-b-0 cursor-pointer transition-colors hover:opacity-90"
                style={{ borderColor: 'var(--border)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <td className="px-4 py-3 font-medium whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{job.company}</td>
                <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{job.role}</td>
                <td className="px-4 py-3"><StatusBadge status={job.status} size="sm" /></td>
                <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{job.location || '—'}</td>
                <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{job.dateApplied || '—'}</td>
                <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{job.source || '—'}</td>
                <td className="px-4 py-3 text-right">
                  {job.contact && (
                    <a
                      href={contactHref(job.contact)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{ color: 'var(--text-muted)' }}
                      aria-label="Open job link"
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
