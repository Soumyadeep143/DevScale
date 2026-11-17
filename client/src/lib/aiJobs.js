import { COLUMNS, sanitizeRecord } from '../../../supabase/functions/ai/parseJobs.ts';

// The AI returns job records in the 12-column schema (the same columns as the "Job leads sheet"):
//   Company | Recruitment Email | Job Title | Experience | Location | Posted Time | LinkedIn URL |
//   Careers URL | Email Source URL | Applied | (unused) | Posted Timestamp
// The rules for checking them live in one place (parseJobs.ts, shared with the servers); the app re-checks
// whatever comes back, so a response is never trusted blindly.
export const normalizeRecords = (list) => (Array.isArray(list) ? list : []).map(sanitizeRecord).filter(Boolean);

// A 12-column record as a job the app can import. Mirrors how the old "Job leads sheet" import worked:
// the contact is the first of LinkedIn / careers / email-source link / recruiter email; the source is
// named from where the link points. "Applied" stays blank unless the text said the application was sent.
export function recordToJob(r) {
  const contact = r.linkedinUrl || r.careersUrl || r.emailSourceUrl || r.recruitmentEmail || '';
  return {
    company: r.company, role: r.jobTitle,
    status: r.applied === 'TRUE' ? 'applied' : 'lead',
    location: r.location, experience: r.experience,
    postedTime: r.postedTime || r.postedTimestamp,
    contact,
    source: r.linkedinUrl ? 'LinkedIn' : r.careersUrl ? 'Careers Page' : r.recruitmentEmail ? 'Email' : 'AI import',
    jobUrl: r.linkedinUrl || r.careersUrl || '',
    dateApplied: '', interviewStatus: '', description: '',
    // The recruiter's email would be lost when a link took the contact slot; keep it in the notes.
    notes: r.recruitmentEmail && contact !== r.recruitmentEmail ? `Recruiter: ${r.recruitmentEmail}` : '',
  };
}

const cell = (v) => String(v ?? '').replace(/[\t\r\n]+/g, ' ').trim();

// Tab-separated text with the exact 12 headers, ready to paste into Google Sheets or the Import window.
export function recordsToTsv(records) {
  const rows = records.map((r) => [
    r.company, r.recruitmentEmail, r.jobTitle, r.experience, r.location, r.postedTime,
    r.linkedinUrl, r.careersUrl, r.emailSourceUrl, r.applied, '', r.postedTimestamp,
  ].map(cell).join('\t'));
  return [COLUMNS.join('\t'), ...rows].join('\n');
}

// Is this pasted text spreadsheet rows (tab- or comma-separated) rather than free text?
// Rows can be parsed exactly and for free; free text needs the AI.
export function looksLikeRows(raw) {
  const lines = String(raw || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return false;
  const columnar = lines.filter((l) => l.includes('\t') || (l.match(/,/g) || []).length >= 3).length;
  return columnar / lines.length >= 0.6;
}
