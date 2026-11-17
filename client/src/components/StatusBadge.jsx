import { statusMeta } from '../lib/statusConfig';

export default function StatusBadge({ status, size = 'md' }) {
  const meta = statusMeta(status);
  const Icon = meta.icon;
  const padding = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap ${padding}`}
      style={{ background: `color-mix(in oklab, ${meta.color} 18%, var(--surface))`, color: meta.color, border: `1px solid color-mix(in oklab, ${meta.color} 35%, transparent)` }}
    >
      <Icon size={size === 'sm' ? 11 : 12} />
      {meta.label}
    </span>
  );
}
