// Horizontal tab bar for tablet and desktop. Hidden on phones, where the
// bottom navigation takes over.
export default function DesktopNavigation({ tabs, view, setView }) {
  return (
    <nav aria-label="Primary" className="hidden md:flex items-center gap-1 overflow-x-auto scrollbar-thin -mb-px">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = view === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            aria-label={tab.label}
            aria-current={active ? 'page' : undefined}
            title={tab.label}
            onClick={() => setView(tab.id)}
            className="flex items-center gap-2 px-3 xl:px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors hover:text-[var(--text-primary)]"
            style={{ borderColor: active ? 'var(--brand)' : 'transparent', color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}
          >
            <Icon size={16} style={{ color: active ? 'var(--brand)' : undefined }} />
            <span className={active ? '' : 'hidden lg:inline'}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
