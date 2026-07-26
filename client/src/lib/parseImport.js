// Parses rows pasted (Ctrl+V) straight out of Google Sheets — tab-separated —
// or a comma-separated CSV export, and maps either of the user's two known
// sheet layouts onto the app's unified job shape.

function splitRows(text) {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function splitCols(line) {
  if (line.includes('\t')) return line.split('\t').map((c) => c.trim());
  // naive CSV split (fields in this data don't contain embedded commas/quotes)
  return line.split(',').map((c) => c.trim());
}

function normalizeDate(raw) {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toISOString().slice(0, 10);
}

function mapStatus(raw) {
  const s = String(raw || '').toLowerCase();
  if (s.includes('reject')) return 'rejected';
  if (s.includes('offer')) return 'offer';
  if (s.includes('interview')) return 'interviewing';
  if (s.includes('sent') || s.includes('applied') || s === 'true') return 'applied';
  return 'lead';
}

const SHEET1_HEADER = ['company', 'role', 'date applied', 'status', 'interview status', 'job link/mail'];
const SHEET2_HEADER = ['company', 'recruitment email', 'job title', 'experience', 'location', 'posted time'];

function looksLikeHeader(cols) {
  const norm = cols.map((c) => c.toLowerCase());
  const hits1 = SHEET1_HEADER.filter((h) => norm.includes(h)).length;
  const hits2 = SHEET2_HEADER.filter((h) => norm.includes(h)).length;
  return hits1 >= 3 || hits2 >= 3;
}

function detectFormat(cols) {
  if (cols.length <= 7) return 'sheet1';
  return 'sheet2';
}

function mapSheet1(cols) {
  const [company, role, dateApplied, status, interviewStatus, linkOrMail] = cols;
  return {
    company: company || '',
    role: role || '',
    location: '',
    experience: '',
    status: mapStatus(status),
    dateApplied: normalizeDate(dateApplied),
    interviewStatus: interviewStatus && interviewStatus !== '-' ? interviewStatus : '',
    contact: linkOrMail || '',
    source: 'Import',
    postedTime: '',
    notes: '',
  };
}

function mapSheet2(cols) {
  const [company, email, role, experience, location, postedTime, linkedin, careers, emailSourceUrl, applied, , postedTimestamp] = cols;
  return {
    company: company || '',
    role: role || '',
    location: location || '',
    experience: (experience && experience !== 'Not stated') ? experience : '',
    status: mapStatus(applied),
    dateApplied: '',
    interviewStatus: '',
    contact: linkedin || careers || emailSourceUrl || email || '',
    source: linkedin ? 'LinkedIn' : (careers ? 'Careers Page' : 'Import'),
    postedTime: postedTime || postedTimestamp || '',
    notes: '',
  };
}

/**
 * @param {string} text raw pasted text
 * @param {'auto'|'sheet1'|'sheet2'} format
 * @returns {{jobs: object[], skipped: number, format: string}}
 */
export function parsePastedJobs(text, format = 'auto') {
  const lines = splitRows(text);
  if (lines.length === 0) return { jobs: [], skipped: 0, format };

  let rows = lines.map(splitCols);
  let detected = format;

  if (looksLikeHeader(rows[0])) {
    if (detected === 'auto') {
      const norm = rows[0].map((c) => c.toLowerCase());
      detected = SHEET2_HEADER.filter((h) => norm.includes(h)).length >= 3 ? 'sheet2' : 'sheet1';
    }
    rows = rows.slice(1);
  } else if (detected === 'auto') {
    detected = detectFormat(rows[0]);
  }

  const mapper = detected === 'sheet2' ? mapSheet2 : mapSheet1;
  let skipped = 0;
  const jobs = rows
    .map((cols) => mapper(cols))
    .filter((job) => {
      if (!job.company && !job.role) {
        skipped += 1;
        return false;
      }
      return true;
    });

  return { jobs, skipped, format: detected };
}
