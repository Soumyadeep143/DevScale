import logoIcon from '../assets/logo-icon.jpg';

// The centered card shared by every signed-out screen.
export default function AuthShell({ title, subtitle, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6" style={{ background: 'var(--page)' }}>
      <div className="w-full max-w-md rounded-2xl border p-6 sm:p-8" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center overflow-hidden border p-1 shrink-0" style={{ background: '#ffffff', borderColor: 'var(--border)' }}>
            <img src={logoIcon} alt="DevScale" className="w-full h-full object-contain rounded-[4px]" />
          </div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h1>
        </div>
        {subtitle && <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}
