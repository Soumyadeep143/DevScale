import { SiIndeed, SiGreenhouse, SiGlassdoor, SiYcombinator, SiWellfound, SiSap, SiMonster } from 'react-icons/si';
import { FaLinkedin } from 'react-icons/fa6';

// Real brand glyphs wherever a legitimately licensed icon set has one
// (simple-icons, Font Awesome Free brands). A handful of ATS/portals
// (ZipRecruiter, SmartRecruiters, Workday, Lever, Naukri, Internshala) have
// no icon in either set, so those get a monogram badge instead — same
// visual weight and "logo" treatment as the ones with real glyphs, just
// built from the wordmark rather than a hand-drawn copy of a mark we don't
// have rights to reproduce.
const PORTALS = [
  { name: 'LinkedIn', color: '#0A66C2', Icon: FaLinkedin },
  { name: 'Indeed', color: '#003A9B', Icon: SiIndeed },
  { name: 'Greenhouse', color: '#24A47F', Icon: SiGreenhouse },
  { name: 'Lever', color: '#8C50FF' },
  { name: 'Workday', color: '#F98181' },
  { name: 'SmartRecruiters', color: '#5EBD64' },
  { name: 'ZipRecruiter', color: '#20B47E' },
  { name: 'Glassdoor', color: '#0CAA41', Icon: SiGlassdoor },
  { name: 'Y Combinator', color: '#F26625', Icon: SiYcombinator },
  { name: 'Wellfound', color: 'var(--text-primary)', Icon: SiWellfound },
  { name: 'SAP SuccessFactors', color: '#0FAAFF', Icon: SiSap },
  { name: 'Monster', color: '#6D4AAE', Icon: SiMonster },
  { name: 'Naukri', color: '#4A90D9' },
  { name: 'Internshala', color: '#0C4595' },
];

function Monogram({ letter, color }) {
  return (
    <span
      className="flex items-center justify-center rounded-[5px] text-[10px] font-bold text-white shrink-0"
      style={{ width: 16, height: 16, background: color }}
      aria-hidden="true"
    >
      {letter}
    </span>
  );
}

function PortalChip({ portal }) {
  const { name, color, Icon } = portal;
  return (
    <div
      className="flex items-center gap-2 shrink-0 rounded-full border px-4 py-2 transition-transform hover:-translate-y-0.5"
      style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', boxShadow: 'var(--shadow-sm)' }}
    >
      <span className="flex items-center justify-center" style={{ color }}>
        {Icon ? <Icon size={16} /> : <Monogram letter={name[0]} color={color} />}
      </span>
      <span className="text-xs font-medium whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{name}</span>
    </div>
  );
}

export default function PortalMarquee() {
  const track = [...PORTALS, ...PORTALS];

  return (
    <div className="pt-2 pb-1">
      <p className="text-center text-[11px] font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
        Track applications from anywhere — LinkedIn, Indeed, career portals, and more
      </p>
      <div
        className="relative overflow-hidden"
        style={{
          WebkitMaskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
          maskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
        }}
      >
        <div className="flex gap-3 w-max devscale-marquee-track">
          {track.map((p, i) => (
            <PortalChip key={`${p.name}-${i}`} portal={p} />
          ))}
        </div>
      </div>
    </div>
  );
}
