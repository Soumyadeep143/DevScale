import { HelpCircle } from 'lucide-react';

function Section({ title, children, defaultOpen }) {
  return (
    <details
      open={defaultOpen}
      className="rounded-xl border p-4"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}
    >
      <summary className="cursor-pointer select-none font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
        {title}
      </summary>
      <div className="mt-3 text-sm space-y-2.5" style={{ color: 'var(--text-secondary)' }}>
        {children}
      </div>
    </details>
  );
}

function Code({ children }) {
  return (
    <code className="block rounded px-2.5 py-2 font-mono text-xs whitespace-pre-wrap break-all" style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}>
      {children}
    </code>
  );
}

export default function Guide() {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h2 className="text-base font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <HelpCircle size={18} style={{ color: 'var(--brand)' }} /> Guide
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          How everything fits together, end to end.
        </p>
      </div>

      <Section title="Adding, editing, and deleting jobs" defaultOpen>
        <p>
          Click <strong>Add job</strong> to create one by hand, or click any job card to open, edit, or delete it.
          Every change writes straight through to your Google Sheet immediately — there's no separate "save to
          sheet" step.
        </p>
        <p>
          On the Board view, use the arrows on a card to move it to the next or previous stage (Lead → Applied →
          Interviewing → Offer, or Rejected). Moving a Lead out of "Lead" promotes it into your Applications sheet.
        </p>
      </Section>

      <Section title="Importing existing jobs — exact format required">
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
      </Section>

      <Section title="Notes / comments on a job, and the AI rejection analysis">
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
      </Section>

      <Section title="The Notes tab (general strategy notes)">
        <p>
          Separate from any one job — this is a running log for your overall job-search strategy: things you're
          trying, patterns you've noticed, reminders. It's stored in Supabase (not the Google Sheet), and the AI
          assistant reads it too.
        </p>
      </Section>

      <Section title="Asking the AI assistant questions">
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
      </Section>

      <Section title="The Graph tab">
        <p>
          A visual map of how everything connects: each job links to its company and its pipeline stage, and any
          general note links to a job if it mentions that company by name. Drag nodes to rearrange, scroll to
          zoom, click a node to focus it — clicking a job opens it, clicking a note previews it.
        </p>
      </Section>

      <Section title="How the website, Google Sheet, and Supabase stay in sync">
        <p>You only ever need to author data in two places — this app or your Google Sheet directly. Supabase is always a mirror, kept in sync automatically, never something you edit by hand:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Add/edit/delete on the website</strong> → written to Google Sheets immediately, and mirrored to Supabase right after.</li>
          <li><strong>Edit the Google Sheet by hand</strong> → shows up on the website within ~10 seconds (it polls automatically), and reaches Supabase immediately too, once the one-time sync trigger is installed (see SETUP.md) — otherwise it catches up in Supabase the next time you add/edit/delete anything from the website.</li>
        </ul>
        <p>Google Sheets is always the source of truth. If anything ever looks out of sync, the Sheet is the one to trust.</p>
      </Section>
    </div>
  );
}
