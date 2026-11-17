export default function Panel({ title, subtitle, action, children, className = '', padded = true }) {
  return (
    <section
      className={`rounded-2xl border min-w-0 ${className}`}
      style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}
    >
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-4 pt-4">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3>}
            {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  );
}
