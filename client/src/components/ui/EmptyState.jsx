export default function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="text-center py-14 px-4">
      {Icon && (
        <div className="mx-auto mb-4 w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ background: 'color-mix(in oklab, var(--brand) 14%, var(--surface))' }}>
          <Icon size={24} style={{ color: 'var(--brand)' }} />
        </div>
      )}
      <p className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{title}</p>
      {children && <p className="text-sm max-w-md mx-auto" style={{ color: 'var(--text-muted)' }}>{children}</p>}
      {action && <div className="mt-5 flex items-center justify-center gap-2">{action}</div>}
    </div>
  );
}
