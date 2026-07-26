import { statusMeta } from '../lib/statusConfig';

export default function StatusBadge({ status, size = 'md' }) {
  const meta = statusMeta(status);
  const Icon = meta.icon;
  const padding = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${padding}`}
      style={{
        background: `color-mix(in oklab, ${meta.color} 16%, var(--surface))`,
        color: 'var(--text-primary)',
      }}
    >
      <Icon size={size === 'sm' ? 11 : 12} style={{ color: meta.color }} />
      {meta.label}
    </span>
  );
}
