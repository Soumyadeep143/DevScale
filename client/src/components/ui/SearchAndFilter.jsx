import { Search } from 'lucide-react';

const field = { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' };

export function SearchField({ value, onChange, placeholder, label, className = '' }) {
  return (
    <div className={`relative flex-1 min-w-[12rem] ${className}`}>
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label || placeholder}
        className="w-full rounded-lg pl-9 pr-3 py-2 text-sm outline-none border focus:ring-2 min-h-[40px]"
        style={field}
      />
    </div>
  );
}

export function FilterSelect({ value, onChange, label, options, icon: Icon }) {
  return (
    <label className="relative inline-flex items-center">
      {Icon && <Icon size={14} className="absolute left-2.5 pointer-events-none" style={{ color: 'var(--text-muted)' }} />}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className={`text-sm rounded-lg py-2 pr-2 border outline-none min-h-[40px] ${Icon ? 'pl-8' : 'pl-3'}`}
        style={field}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export default function SearchAndFilter({ search, onSearch, placeholder, searchLabel, children }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchField value={search} onChange={onSearch} placeholder={placeholder} label={searchLabel} />
      {children}
    </div>
  );
}
