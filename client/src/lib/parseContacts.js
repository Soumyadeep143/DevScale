// Parses contacts pasted from a spreadsheet (tab-separated) or a CSV. Validation
// mirrors the database CHECK constraints on `contacts`, so most bad rows are
// caught here with a readable reason; the database remains the final authority.

export const MAX_IMPORT_ROWS = 500;

const POSITIONAL = ['name', 'email', 'phone', 'company', 'designation', 'linkedinUrl'];

const HEADER_ALIASES = {
  name: ['name', 'full name', 'contact name'],
  email: ['email', 'e-mail', 'email address', 'mail', 'mail id', 'email id'],
  phone: ['phone', 'phone number', 'phone no', 'mobile', 'mobile number', 'contact number', 'contact no', 'number'],
  company: ['company', 'company name', 'organisation', 'organization', 'employer'],
  designation: ['designation', 'title', 'job title', 'position', 'role'],
  linkedinUrl: ['linkedin', 'linkedin url', 'linkedin profile', 'linkedin link'],
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function stripQuotes(cell) {
  const m = /^"([\s\S]*)"$/.exec(cell);
  return (m ? m[1].replace(/""/g, '"') : cell).trim();
}

function splitCsv(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i += 1; } else quoted = false;
      } else cur += ch;
    } else if (ch === '"' && cur === '') quoted = true;
    else if (ch === ',') { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function splitLine(line) {
  return line.includes('\t') ? line.split('\t').map(stripQuotes) : splitCsv(line);
}

// Returns an index -> field map when the first row looks like a header, else null.
function detectHeader(cells) {
  const map = {};
  cells.forEach((cell, i) => {
    const key = cell.toLowerCase().replace(/[:*]+$/, '').trim();
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(key) && !Object.values(map).includes(field)) { map[i] = field; return; }
    }
  });
  const fields = Object.values(map);
  return fields.includes('email') && fields.length >= 2 ? map : null;
}

function normalizeLinkedin(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  // "linkedin.com/in/x" or "www.linkedin.com/in/x" pasted without a scheme
  if (/^(www\.)?linkedin\.com\//i.test(url)) return `https://${url}`;
  return url;
}

function validate(c) {
  if (!c.name) return 'Missing name';
  if (c.name.length > 200) return 'Name is too long';
  if (!c.email) return 'Missing email';
  if (c.email.length > 320 || !EMAIL_RE.test(c.email)) return `Invalid email "${c.email}"`;
  if (!c.phone) return 'Missing phone number';
  if (c.phone.length > 40) return 'Phone number is too long';
  if (!c.company) return 'Missing company';
  if (c.company.length > 200) return 'Company is too long';
  if (c.designation.length > 200) return 'Designation is too long';
  if (c.linkedinUrl && (!/^https?:\/\//i.test(c.linkedinUrl) || c.linkedinUrl.length > 500)) {
    return 'LinkedIn URL must start with http:// or https://';
  }
  return null;
}

/**
 * @param {string} text pasted text
 * @param {{ existingEmails?: Iterable<string> }} [opts] emails the user already has (skipped as duplicates)
 * @returns {{ rows: object[], skipped: {line:number, reason:string, text:string}[], format: 'header'|'columns', tooMany: boolean }}
 */
export function parseContacts(text, { existingEmails = [] } = {}) {
  const lines = String(text || '').split(/\r?\n/);
  const seen = new Set([...existingEmails].map((e) => String(e).trim().toLowerCase()));
  const rows = [];
  const skipped = [];
  let columnMap = Object.fromEntries(POSITIONAL.map((f, i) => [i, f]));
  let format = 'columns';
  let headerChecked = false;

  lines.forEach((raw, idx) => {
    if (!raw.trim()) return;
    const cells = splitLine(raw);

    if (!headerChecked) {
      headerChecked = true;
      const header = detectHeader(cells);
      if (header) {
        columnMap = header;
        format = 'header';
        return;
      }
    }

    const c = { name: '', email: '', phone: '', company: '', designation: '', linkedinUrl: '' };
    cells.forEach((cell, i) => {
      const field = columnMap[i];
      if (field) c[field] = cell.trim();
    });
    c.linkedinUrl = normalizeLinkedin(c.linkedinUrl);

    const line = idx + 1;
    const reason = validate(c);
    if (reason) { skipped.push({ line, reason, text: raw.trim() }); return; }

    const key = c.email.toLowerCase();
    if (seen.has(key)) {
      skipped.push({ line, reason: rows.some((r) => r.email.toLowerCase() === key) ? 'Duplicate email in the pasted data' : 'Already in your contacts', text: raw.trim() });
      return;
    }
    seen.add(key);
    rows.push(c);
  });

  return { rows, skipped, format, tooMany: rows.length > MAX_IMPORT_ROWS };
}

// Contacts found by the AI, as header + tab-separated rows, so the normal preview, checks and
// duplicate detection apply to them exactly as they do to pasted spreadsheet rows.
export function contactsToTsv(contacts) {
  const head = ['Name', 'Email', 'Phone', 'Company', 'Designation', 'LinkedIn URL'];
  const cell = (v) => String(v || '').replace(/[\t\r\n]+/g, ' ').trim();
  return [head, ...contacts.map((c) => [c.name, c.email, c.phone, c.company, c.designation, c.linkedinUrl].map(cell))]
    .map((r) => r.join('\t')).join('\n');
}
