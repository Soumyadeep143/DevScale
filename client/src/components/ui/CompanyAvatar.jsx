// Companies have no logo data, so show deterministic coloured initials
// instead of fetching logos from a third-party service.
const TONES = ['#477eff', '#9b7cff', '#27c995', '#f3bb61', '#f16c78', '#38bdf8', '#fb923c'];

function initials(name) {
  const words = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] || '?') + (words.length > 1 ? words[1][0] : '')).toUpperCase();
}

export default function CompanyAvatar({ name, size = 32 }) {
  const tone = TONES[[...String(name || '')].reduce((h, c) => h + c.charCodeAt(0), 0) % TONES.length];
  return (
    <span
      aria-hidden="true"
      className="shrink-0 inline-flex items-center justify-center rounded-lg font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.36, background: `color-mix(in oklab, ${tone} 22%, var(--surface-2))`, color: `color-mix(in oklab, ${tone} 70%, var(--text-primary))` }}
    >
      {initials(name)}
    </span>
  );
}
