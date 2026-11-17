import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const ctx = vi.hoisted(() => ({ importJobs: vi.fn(), addJob: vi.fn(), editJob: vi.fn(), promoteLead: vi.fn(), removeJob: vi.fn() }));
vi.mock('../context/JobsContext', () => ({ useJobs: () => ctx }));
vi.mock('../lib/api', () => ({ parseJobsWithAI: vi.fn(), analyzeJob: vi.fn(), ApiError: class ApiError extends Error {} }));
import JobModal from './JobModal';
import ImportModal from './ImportModal';

beforeEach(() => { vi.clearAllMocks(); ctx.addJob.mockResolvedValue({}); ctx.importJobs.mockResolvedValue(1); });
afterEach(() => cleanup());

const type = (placeholder, value) => fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });
const submit = () => fireEvent.click(screen.getByRole('button', { name: /^Add job|Add job$/i }));
const openNew = (onClose = vi.fn()) => { render(<JobModal open onClose={onClose} job={null} />); return onClose; };

describe('Add a job: a new lead needs a company, a role and a link or email', () => {
  it('names everything that is missing when the form is empty', () => {
    openNew();
    submit();
    expect(screen.getByRole('alert').textContent).toBe('Please enter the missing required fields: Company, Role, Link or email.');
    expect(ctx.addJob).not.toHaveBeenCalled();
  });

  it('names only what is still missing', () => {
    openNew();
    type('Acme Inc.', 'Acme');
    type('Frontend Engineer', 'Dev');
    submit();
    expect(screen.getByRole('alert').textContent).toBe('Please enter the missing required fields: Link or email.');
    type('Acme Inc.', '');
    type('https://… or name@company.com', 'hr@acme.com');
    submit();
    expect(screen.getByRole('alert').textContent).toBe('Please enter the missing required fields: Company.');
    expect(ctx.addJob).not.toHaveBeenCalled();
  });

  it('adds the lead once company, role and a link are given', async () => {
    const onClose = openNew();
    type('Acme Inc.', 'Acme');
    type('Frontend Engineer', 'Dev');
    type('https://… or name@company.com', 'https://acme.com/jobs/1');
    submit();
    await waitFor(() => expect(ctx.addJob).toHaveBeenCalledTimes(1));
    expect(ctx.addJob.mock.calls[0][0]).toMatchObject({ company: 'Acme', role: 'Dev', status: 'lead', contact: 'https://acme.com/jobs/1' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('an email works instead of a link', async () => {
    openNew();
    type('Acme Inc.', 'Acme');
    type('Frontend Engineer', 'Dev');
    type('https://… or name@company.com', 'recruiter@acme.com');
    submit();
    await waitFor(() => expect(ctx.addJob).toHaveBeenCalled());
  });

  it('a Job URL alone also satisfies the link requirement', async () => {
    openNew();
    type('Acme Inc.', 'Acme');
    type('Frontend Engineer', 'Dev');
    type('https://company.com/careers/123', 'https://acme.com/jobs/9');
    submit();
    await waitFor(() => expect(ctx.addJob).toHaveBeenCalled());
  });

  it('refuses contact text that is neither a link nor an email, and says how to fix it', () => {
    openNew();
    type('Acme Inc.', 'Acme');
    type('Frontend Engineer', 'Dev');
    type('https://… or name@company.com', 'call the office');
    submit();
    expect(screen.getByRole('alert').textContent).toMatch(/Link or email.*must start with https:\/\//);
    expect(ctx.addJob).not.toHaveBeenCalled();
  });

  it('refuses a Job URL that is not a full link (the database would reject it)', () => {
    openNew();
    type('Acme Inc.', 'Acme');
    type('Frontend Engineer', 'Dev');
    type('https://… or name@company.com', 'hr@acme.com');
    type('https://company.com/careers/123', 'acme.com/jobs');
    submit();
    expect(screen.getByRole('alert').textContent).toMatch(/Job URL must be a full link/);
    expect(ctx.addJob).not.toHaveBeenCalled();
  });

  it('marks the contact as required for a new lead', () => {
    openNew();
    expect(screen.getByText('Contact (job link or recruiter email) *')).toBeTruthy();
  });

  it('a job you already applied to does not need a link', async () => {
    openNew();
    type('Acme Inc.', 'Acme');
    type('Frontend Engineer', 'Dev');
    fireEvent.change(screen.getByDisplayValue('Lead'), { target: { value: 'applied' } });
    submit();
    await waitFor(() => expect(ctx.addJob).toHaveBeenCalled());
    expect(ctx.addJob.mock.calls[0][0].status).toBe('applied');
  });

  it('editing an existing lead that has no link is still allowed (older leads are not locked out)', async () => {
    ctx.editJob.mockResolvedValue({});
    render(<JobModal open onClose={vi.fn()} job={{ id: 'l-1', company: 'Old', role: 'Dev', status: 'lead', contact: '' }} />);
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(ctx.editJob).toHaveBeenCalled());
  });
});

describe('Import: rows that are missing required fields are flagged and never imported', () => {
  const paste = (v) => fireEvent.change(screen.getByRole('textbox'), { target: { value: v } });
  // 12-column "Job leads sheet" rows (no Applied value, so they are leads)
  const row = (company, title, linkedin = '', careers = '', email = '') => [company, email, title, '', 'Pune', '', linkedin, careers, '', '', '', ''].join('\t');

  it('flags a lead with no link or email, says why, and leaves it out of the import', async () => {
    render(<ImportModal open onClose={vi.fn()} />);
    paste([row('Acme', 'Dev', '', 'https://acme.com/jobs/1'), row('Globex', 'SRE'), row('Initech', 'QA', '', '', 'hr@initech.com')].join('\n'));
    expect(screen.getByText('Missing: Link or email')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/1 row is missing required fields \(company, role, link or email\) and will not be imported/);
    fireEvent.click(screen.getByText(/^Import 2 jobs$/));
    await waitFor(() => expect(ctx.importJobs).toHaveBeenCalledTimes(1));
    expect(ctx.importJobs.mock.calls[0][0].map((j) => j.company)).toEqual(['Acme', 'Initech']);
  });

  it('flags a missing role, and shows the rows that need attention first', () => {
    render(<ImportModal open onClose={vi.fn()} />);
    paste([row('Acme', 'Dev', '', 'https://acme.com/jobs/1'), row('Globex', '', '', 'https://globex.com/j')].join('\n'));
    expect(screen.getByText('Missing: Role')).toBeTruthy();
    const names = screen.getAllByText(/^(Acme|Globex)$/).map((n) => n.textContent);
    expect(names[0]).toBe('Globex');
  });

  it('cannot import anything when every row is incomplete', () => {
    render(<ImportModal open onClose={vi.fn()} />);
    paste([row('Acme', 'Dev'), row('Globex', 'SRE')].join('\n'));
    expect(screen.getByRole('alert').textContent).toMatch(/2 rows are missing required fields/);
    expect(screen.getByRole('button', { name: /^Import\s*jobs?$/ }).disabled).toBe(true);
  });

  it('applied jobs from the older sheet format are not held to the rule', async () => {
    render(<ImportModal open onClose={vi.fn()} />);
    paste('Acme\tDev\tJuly 24, 2026\tSent\t-\t'); // no link/mail, but it is an application, not a lead
    expect(screen.queryByText(/Missing:/)).toBeNull();
    fireEvent.click(screen.getByText(/^Import 1 job$/));
    await waitFor(() => expect(ctx.importJobs).toHaveBeenCalled());
  });

  it('a complete paste shows no warning at all', () => {
    render(<ImportModal open onClose={vi.fn()} />);
    paste(row('Acme', 'Dev', 'https://in.linkedin.com/jobs/view/1'));
    expect(screen.queryByText(/Missing:/)).toBeNull();
    expect(screen.queryByText(/will not be imported/)).toBeNull();
  });
});
