// What a new LEAD must have before it is added: a company, a role, and a way to reach it: a job link or a
// recruiter's email. Jobs you have already applied to (and older rows) are not held to this.
const EMAIL = /^[^@\s,;<>()]+@[^@\s,;<>()]+\.[^@\s,;<>()]+$/;
const text = (v) => String(v ?? '').trim();

export const isHttpLink = (v) => /^https?:\/\/\S+$/i.test(text(v));
export const isEmail = (v) => EMAIL.test(text(v));
export const isLinkOrEmail = (v) => isHttpLink(v) || isEmail(v);

export const isLead = (job) => (job?.status || 'lead') === 'lead';

// The required fields a lead is missing, by the names people see in the form. Empty when it is fine.
// "Link or email" is satisfied by a valid link or email in Contact, or a valid link in Job URL.
export function missingLeadFields(job) {
  const missing = [];
  if (!text(job?.company)) missing.push('Company');
  if (!text(job?.role)) missing.push('Role');
  if (!isLinkOrEmail(job?.contact) && !isHttpLink(job?.jobUrl)) missing.push('Link or email');
  return missing;
}

// A message for a lead that cannot be added yet, or '' when it can.
export function leadError(job) {
  if (!isLead(job)) return '';
  const missing = missingLeadFields(job);
  if (missing.length === 0) return '';
  const typedSomething = (text(job?.contact) && !isLinkOrEmail(job.contact)) || (text(job?.jobUrl) && !isHttpLink(job.jobUrl));
  return `Please enter the missing required fields: ${missing.join(', ')}.`
    + (missing.includes('Link or email') && typedSomething ? ' A link must start with https:// (or enter an email address).' : '');
}

// The Job URL column only accepts real http(s) links (the database rejects anything else).
export function jobUrlError(job) {
  return text(job?.jobUrl) && !isHttpLink(job.jobUrl) ? 'Job URL must be a full link starting with https://.' : '';
}
