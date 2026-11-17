import { describe, expect, it } from 'vitest';
import { isEmail, isHttpLink, isLead, jobUrlError, leadError, missingLeadFields } from './leadRules';

const lead = (o = {}) => ({ status: 'lead', company: 'Acme', role: 'Dev', contact: 'https://acme.com/jobs/1', jobUrl: '', ...o });

describe('links and emails', () => {
  it('recognises real http(s) links and real email addresses, nothing vaguer', () => {
    for (const ok of ['https://a.com/x', 'http://a.com', 'HTTPS://A.COM/X?y=1&z=2']) expect(isHttpLink(ok)).toBe(true);
    for (const bad of ['www.a.com', 'a.com', 'ftp://a.com', 'javascript:alert(1)', 'https://', 'https://a b.com', 'Checked Sep 4, 2026', '']) expect(isHttpLink(bad)).toBe(false);
    for (const ok of ['hr@acme.com', ' a.b+c@x.co.in ']) expect(isEmail(ok)).toBe(true);
    for (const bad of ['hr@', '@acme.com', 'hr at acme dot com', 'a@b', 'a@b.com, c@d.com', '']) expect(isEmail(bad)).toBe(false);
  });
});

describe('missingLeadFields', () => {
  it('is empty for a complete lead, whether the contact is a link or an email', () => {
    expect(missingLeadFields(lead())).toEqual([]);
    expect(missingLeadFields(lead({ contact: 'recruiter@acme.com' }))).toEqual([]);
  });
  it('a Job URL alone also counts as the link', () => {
    expect(missingLeadFields(lead({ contact: '', jobUrl: 'https://acme.com/jobs/1' }))).toEqual([]);
  });
  it('names every missing field, in the order shown in the form', () => {
    expect(missingLeadFields({})).toEqual(['Company', 'Role', 'Link or email']);
    expect(missingLeadFields(lead({ company: '' }))).toEqual(['Company']);
    expect(missingLeadFields(lead({ role: '   ' }))).toEqual(['Role']);
    expect(missingLeadFields(lead({ contact: '' }))).toEqual(['Link or email']);
    expect(missingLeadFields(lead({ company: '', role: '', contact: '' }))).toEqual(['Company', 'Role', 'Link or email']);
  });
  it('text that is neither a link nor an email does not count', () => {
    expect(missingLeadFields(lead({ contact: 'call me' }))).toEqual(['Link or email']);
    expect(missingLeadFields(lead({ contact: '', jobUrl: 'jobs.acme.com' }))).toEqual(['Link or email']);
  });
});

describe('leadError', () => {
  it('lists what is missing in one message', () => {
    expect(leadError(lead({ company: '', contact: '' }))).toBe('Please enter the missing required fields: Company, Link or email.');
    expect(leadError(lead({ company: '', role: '', contact: '' }))).toBe('Please enter the missing required fields: Company, Role, Link or email.');
  });
  it('explains the format when something was typed but is not a link or email', () => {
    expect(leadError(lead({ contact: 'call me' }))).toMatch(/must start with https:\/\/ \(or enter an email address\)/);
    expect(leadError(lead({ contact: '' }))).not.toMatch(/https/); // nothing typed: no format hint
  });
  it('says nothing for a complete lead, and nothing for jobs that are not leads', () => {
    expect(leadError(lead())).toBe('');
    expect(leadError({ status: 'applied', company: '', role: '' })).toBe('');
    expect(isLead({ status: 'interviewing' })).toBe(false);
    expect(isLead({})).toBe(true); // no status means a lead
  });
});

describe('jobUrlError', () => {
  it('only complains about a typed Job URL that is not a full link', () => {
    expect(jobUrlError({ jobUrl: '' })).toBe('');
    expect(jobUrlError({ jobUrl: 'https://a.com/x' })).toBe('');
    expect(jobUrlError({ jobUrl: 'a.com/x' })).toMatch(/starting with https/);
  });
});
