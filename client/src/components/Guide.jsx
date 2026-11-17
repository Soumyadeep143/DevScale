import { useState } from 'react';
import { ArrowLeft, Bot, Plus, RefreshCw, Share2, Sparkles, StickyNote, Upload, ChevronRight } from 'lucide-react';
import PageHeader from './ui/PageHeader';

function Code({ children }) {
  return (
    <code className="block rounded px-2.5 py-2 font-mono text-xs whitespace-pre-wrap break-all" style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}>
      {children}
    </code>
  );
}

const RESOURCES = [
  {
    id: 0,
    title: 'Adding, editing, and deleting jobs',
    description: 'Create, edit and delete jobs, and move them through your pipeline.',
    icon: Plus,
    body: (
      <>
      <p>
        Click <strong>Add job</strong> to create one by hand, or click any job card to open, edit, or delete it.
        Every change writes straight through to your Google Sheet immediately — there's no separate "save to
        sheet" step.
      </p>
      <p>
        On the Board view, use the arrows on a card to move it to the next or previous stage (Lead → Applied →
        Interviewing → Offer, or Rejected). Moving a Lead out of "Lead" promotes it into your Applications sheet.
      </p>
      </>
    ),
  },
  {
    id: 1,
    title: 'Importing existing jobs — exact format required',
    description: 'The exact paste format for bringing in an existing spreadsheet.',
    icon: Upload,
    body: (
      <>
      <p>Go to <strong>Import</strong>, then in your old spreadsheet select your data rows (not the header row) and copy with Ctrl+C. Paste into the box. Columns must be tab-separated, which is what you get automatically when copying directly out of Google Sheets.</p>
      <div>
        <p className="font-medium" style={{ color: 'var(--text-primary)' }}>Applications sheet — 6 columns</p>
        <p className="text-xs mb-1">Company · Role · Date Applied · Status · Interview Status · Job Link/Mail</p>
        <Code>{'Acme Inc.\tFrontend Engineer\tJuly 24, 2026\tSent\t-\tjobs@acme.com'}</Code>
      </div>
      <div>
        <p className="font-medium" style={{ color: 'var(--text-primary)' }}>Job leads sheet — 12 columns</p>
        <p className="text-xs">Company · Recruitment Email · Job Title · Experience · Location · Posted Time · LinkedIn URL · Careers URL · Email Source URL · Applied · (unused) · Posted Timestamp</p>
      </div>
      <p>Auto-detect usually gets it right; if it guesses wrong, pick the format explicitly from the dropdown in the Import screen before importing.</p>
      </>
    ),
  },
  {
    id: 2,
    title: 'Notes / comments on a job, and the AI rejection analysis',
    description: 'Per-job notes and the AI rejection analysis.',
    icon: Sparkles,
    body: (
      <>
      <p>
        Each job has its own <strong>Notes</strong> field — free text, good for interview feedback, recruiter
        replies, or a pasted rejection email.
      </p>
      <p>
        Paste a rejection (or any) email into a job's Notes, then click <strong>Analyze with AI</strong> in that
        job's edit screen. It reads the pasted text and replies with the likely reason and one concrete next
        step. Nothing is saved automatically — click <strong>Save to notes</strong> only if you want to keep
        that analysis attached to the job.
      </p>
      </>
    ),
  },
  {
    id: 3,
    title: 'The Notes tab (general strategy notes)',
    description: 'Your running log for overall job-search strategy.',
    icon: StickyNote,
    body: (
      <>
      <p>
        Separate from any one job — this is a running log for your overall job-search strategy: things you're
        trying, patterns you've noticed, reminders. It's stored in Supabase (not the Google Sheet), and the AI
        assistant reads it too.
      </p>
      </>
    ),
  },
  {
    id: 4,
    title: 'Asking the AI assistant questions',
    description: 'What the AI assistant can see and the questions it can answer.',
    icon: Bot,
    body: (
      <>
      <p>
        Open the assistant with the sparkle button (bottom-right). It can see every job's stage, dates, and
        notes, plus your general strategy notes, so you can ask things like:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>"How many jobs have I applied to today?"</li>
        <li>"Where am I failing, and what should my strategy be?"</li>
        <li>"Summarize my rejected applications — any patterns?"</li>
        <li>"What should I follow up on this week?"</li>
      </ul>
      </>
    ),
  },
  {
    id: 5,
    title: 'The Graph tab',
    description: 'How the Graph tab maps jobs, companies and notes.',
    icon: Share2,
    body: (
      <>
      <p>
        A visual map of how everything connects: each job links to its company and its pipeline stage, and any
        general note links to a job if it mentions that company by name. Drag nodes to rearrange, scroll to
        zoom, click a node to focus it — clicking a job opens it, clicking a note previews it.
      </p>
      </>
    ),
  },
  {
    id: 6,
    title: 'How the website, Google Sheet, and Supabase stay in sync',
    description: 'How the website, Google Sheet and Supabase stay in sync.',
    icon: RefreshCw,
    body: (
      <>
      <p>You only ever need to author data in two places — this app or your Google Sheet directly. Supabase is always a mirror, kept in sync automatically, never something you edit by hand:</p>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Add/edit/delete on the website</strong> → written to Google Sheets immediately, and mirrored to Supabase right after.</li>
        <li><strong>Edit the Google Sheet by hand</strong> → shows up on the website within ~10 seconds (it polls automatically), and reaches Supabase immediately too, once the one-time sync trigger is installed (see SETUP.md) — otherwise it catches up in Supabase the next time you add/edit/delete anything from the website.</li>
      </ul>
      <p>Google Sheets is always the source of truth. If anything ever looks out of sync, the Sheet is the one to trust.</p>
      </>
    ),
  },
];

export default function Guide() {
  const [openId, setOpenId] = useState(null);
  const current = RESOURCES.find((r) => r.id === openId);

  if (current) {
    const Icon = current.icon;
    return (
      <div className="max-w-3xl space-y-4">
        <button onClick={() => setOpenId(null)} className="inline-flex items-center gap-1.5 text-sm hover:underline" style={{ color: 'var(--text-secondary)' }}>
          <ArrowLeft size={15} /> All guides
        </button>
        <div className="rounded-2xl border p-5 space-y-3" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-semibold flex items-center gap-2.5" style={{ color: 'var(--text-primary)' }}>
            <Icon size={20} style={{ color: 'var(--brand)' }} /> {current.title}
          </h2>
          <div className="text-sm space-y-2.5" style={{ color: 'var(--text-secondary)' }}>{current.body}</div>
        </div>
      </div>
    );
  }

  const tones = ['var(--brand)', 'var(--purple)', 'var(--green)', 'var(--amber)', 'var(--red)'];
  return (
    <div className="space-y-5">
      <PageHeader title="Job Search Guide" subtitle="How everything in DevScale fits together." />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {RESOURCES.map((r, i) => {
          const Icon = r.icon;
          const tone = tones[i % tones.length];
          return (
            <button key={r.id} onClick={() => setOpenId(r.id)} aria-label={`Open guide: ${r.title}`}
              className="text-left rounded-2xl border p-4 flex flex-col gap-3 transition hover:-translate-y-0.5 hover:border-[var(--border-strong)]"
              style={{ background: `linear-gradient(135deg, color-mix(in oklab, ${tone} 12%, var(--surface)) 0%, var(--surface) 70%)`, borderColor: 'var(--border)' }}>
              <span className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `color-mix(in oklab, ${tone} 22%, var(--surface-2))`, color: tone }}><Icon size={18} /></span>
              <span className="flex-1">
                <span className="block text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{r.title}</span>
                <span className="block text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{r.description}</span>
              </span>
              <span className="text-xs flex items-center gap-1" style={{ color: tone }}>View <ChevronRight size={12} /></span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
