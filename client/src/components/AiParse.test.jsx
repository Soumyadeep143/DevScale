import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const ctx = vi.hoisted(() => ({ importJobs: vi.fn(), addJob: vi.fn(), editJob: vi.fn(), promoteLead: vi.fn(), removeJob: vi.fn() }));
vi.mock('../context/JobsContext', () => ({ useJobs: () => ctx }));
vi.mock('../lib/api', () => ({ parseJobsWithAI: vi.fn(), analyzeJob: vi.fn(), ApiError: class ApiError extends Error {} }));
import * as api from '../lib/api';
import ImportModal from './ImportModal';
import JobModal from './JobModal';

const posting = 'Acme Corp is hiring a Backend Engineer in Pune. 0-2 years. Apply at https://acme.com/jobs/7';
const aiJob = (o = {}) => ({ company: 'Acme Corp', role: 'Backend Engineer', status: 'lead', location: 'Pune', experience: '0-2 years', source: 'Careers Page', jobUrl: 'https://acme.com/jobs/7', contact: '', description: 'Build APIs', dateApplied: '', interviewStatus: '', postedTime: '', notes: '', ...o });
// The same job as the 12-column record the AI returns (what "Copy as TSV" is built from).
const aiRecord = (o = {}) => ({ company: 'Acme Corp', recruitmentEmail: '', jobTitle: 'Backend Engineer', experience: '0-2 years', location: 'Pune', postedTime: 'Posted Today', linkedinUrl: '', careersUrl: 'https://acme.com/jobs/7?utm_source=x', emailSourceUrl: '', applied: '', postedTimestamp: '', ...o });
const result = (jobs, records, extra = {}) => ({ jobs, records: records || jobs.map((j) => aiRecord({ company: j.company, jobTitle: j.role })), truncated: false, notices: [], ...extra });

beforeEach(() => { vi.clearAllMocks(); ctx.importJobs.mockResolvedValue(2); });
afterEach(() => cleanup());

const paste = (value) => fireEvent.change(screen.getByRole('textbox'), { target: { value } });

describe('Import with AI', () => {
  it('suggests the AI for free text, but not for spreadsheet rows', () => {
    render(<ImportModal open onClose={vi.fn()} />);
    paste('Acme\tDev\tJuly 24, 2026\tSent\t-\thr@acme.com');
    expect(screen.queryByText(/looks like free text/)).toBeNull();
    paste(posting);
    expect(screen.getByText(/looks like free text/)).toBeTruthy();
  });

  it('reads free text with the AI, shows the result for review, and imports exactly what is left', async () => {
    api.parseJobsWithAI.mockResolvedValue({ jobs: [aiJob(), aiJob({ company: 'Globex', role: 'SRE' })], truncated: false });
    render(<ImportModal open onClose={vi.fn()} />);
    paste(posting);
    fireEvent.click(screen.getByRole('button', { name: 'Read with AI' }));
    expect(await screen.findByText('Globex')).toBeTruthy();
    expect(api.parseJobsWithAI).toHaveBeenCalledWith(posting);
    expect(screen.getByText(/check these before importing/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Remove Globex')); // the person can drop a wrong row
    expect(screen.queryByText('Globex')).toBeNull();
    fireEvent.click(screen.getByText(/^Import 1 job$/));
    await waitFor(() => expect(ctx.importJobs).toHaveBeenCalledTimes(1));
    const rows = ctx.importJobs.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ company: 'Acme Corp', role: 'Backend Engineer', location: 'Pune', jobUrl: 'https://acme.com/jobs/7', visibility: 'personal' });
  });

  it('shows notices from the server, such as a link whose job is already filled', async () => {
    api.parseJobsWithAI.mockResolvedValue({ jobs: [aiJob()], truncated: false, notices: ['The page says this job may already be filled or closed.'] });
    render(<ImportModal open onClose={vi.fn()} />);
    paste('https://careers.wexinc.com/job/1');
    fireEvent.click(screen.getByRole('button', { name: 'Read with AI' }));
    expect((await screen.findByRole('status')).textContent).toMatch(/filled or closed/);
  });

  it('does nothing to your data until you press Import', async () => {
    api.parseJobsWithAI.mockResolvedValue({ jobs: [aiJob()], truncated: false });
    render(<ImportModal open onClose={vi.fn()} />);
    paste(posting);
    fireEvent.click(screen.getByRole('button', { name: 'Read with AI' }));
    await screen.findByText('Acme Corp');
    expect(ctx.importJobs).not.toHaveBeenCalled();
  });

  it('copies the reviewed rows as 12-column TSV, minus any row you removed', async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.assign(navigator, { clipboard: { writeText } });
    api.parseJobsWithAI.mockResolvedValue(result([aiJob(), aiJob({ company: 'Globex', role: 'SRE' })]));
    render(<ImportModal open onClose={vi.fn()} />);
    paste(posting);
    fireEvent.click(screen.getByRole('button', { name: 'Read with AI' }));
    await screen.findByText('Globex');
    fireEvent.click(screen.getByLabelText('Remove Globex'));
    fireEvent.click(screen.getByText('Copy as 12-column TSV'));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const lines = writeText.mock.calls[0][0].split('\n');
    expect(lines).toHaveLength(2); // header + the one remaining job
    expect(lines[0].split('\t')).toHaveLength(12);
    expect(lines[0].startsWith('Company\tRecruitment Email\tJob Title')).toBe(true);
    expect(lines[1].split('\t')[0]).toBe('Acme Corp');
    expect(lines[1]).toContain('https://acme.com/jobs/7?utm_source=x'); // link kept whole
    expect(await screen.findByText('Copied')).toBeTruthy();
  });

  it('says so if the browser blocks copying', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('blocked')) } });
    api.parseJobsWithAI.mockResolvedValue(result([aiJob()]));
    render(<ImportModal open onClose={vi.fn()} />);
    paste(posting);
    fireEvent.click(screen.getByRole('button', { name: 'Read with AI' }));
    await screen.findByText('Acme Corp');
    fireEvent.click(screen.getByText('Copy as 12-column TSV'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/blocked the clipboard/);
  });

  it('discards the reviewed result if the pasted text changes', async () => {
    api.parseJobsWithAI.mockResolvedValue({ jobs: [aiJob()], truncated: false });
    render(<ImportModal open onClose={vi.fn()} />);
    paste(posting);
    fireEvent.click(screen.getByRole('button', { name: 'Read with AI' }));
    await screen.findByText('Acme Corp');
    paste(posting + ' and more');
    expect(screen.queryByText('Acme Corp')).toBeNull();
    expect(screen.getByRole('button', { name: 'Read with AI' })).toBeTruthy();
  });

  it('explains when the AI is not set up, when nothing was found, and when text was cut short', async () => {
    api.parseJobsWithAI.mockRejectedValueOnce(new Error('No Groq API key set. Run: supabase secrets set GROQ_API_KEY=...'));
    render(<ImportModal open onClose={vi.fn()} />);
    paste(posting);
    fireEvent.click(screen.getByRole('button', { name: 'Read with AI' }));
    expect((await screen.findByText(/needs a GROQ_API_KEY/))).toBeTruthy();
    api.parseJobsWithAI.mockResolvedValueOnce({ jobs: [], truncated: false });
    fireEvent.click(screen.getByRole('button', { name: 'Read with AI' }));
    expect(await screen.findByText(/could not find a job/)).toBeTruthy();
    api.parseJobsWithAI.mockResolvedValueOnce({ jobs: [aiJob()], truncated: true });
    fireEvent.click(screen.getByRole('button', { name: 'Read with AI' }));
    expect(await screen.findByText(/only the first part was read/)).toBeTruthy();
  });

  it('spreadsheet rows still import exactly, without calling the AI', async () => {
    render(<ImportModal open onClose={vi.fn()} />);
    paste('Acme\tDev\tJuly 24, 2026\tSent\t-\thr@acme.com');
    fireEvent.click(screen.getByText(/^Import 1 job$/));
    await waitFor(() => expect(ctx.importJobs).toHaveBeenCalled());
    expect(api.parseJobsWithAI).not.toHaveBeenCalled();
    expect(ctx.importJobs.mock.calls[0][0][0]).toMatchObject({ company: 'Acme', role: 'Dev', status: 'applied' });
  });

  it('lead rows from the AI follow the chosen visibility', async () => {
    api.parseJobsWithAI.mockResolvedValue({ jobs: [aiJob()], truncated: false });
    render(<ImportModal open onClose={vi.fn()} />);
    paste(posting);
    fireEvent.click(screen.getByRole('button', { name: 'Read with AI' }));
    await screen.findByText('Acme Corp');
    fireEvent.change(screen.getByLabelText('Lead visibility:'), { target: { value: 'peer' } });
    fireEvent.click(screen.getByText(/^Import 1 job$/));
    await waitFor(() => expect(ctx.importJobs.mock.calls[0][0][0].visibility).toBe('peer'));
  });
});

describe('Add job: auto-fill', () => {
  const box = () => screen.getByLabelText(/Paste a job posting/);

  it('fills the form from pasted text, leaving it editable and unsaved', async () => {
    api.parseJobsWithAI.mockResolvedValue({ jobs: [aiJob({ status: 'applied', dateApplied: '2026-07-24' })], truncated: false });
    render(<JobModal open onClose={vi.fn()} job={null} />);
    fireEvent.change(box(), { target: { value: posting } });
    fireEvent.click(screen.getByText('Auto-fill'));
    await waitFor(() => expect(screen.getByPlaceholderText('Acme Inc.').value).toBe('Acme Corp'));
    expect(screen.getByPlaceholderText('Frontend Engineer').value).toBe('Backend Engineer');
    expect(screen.getByPlaceholderText('Bengaluru, India').value).toBe('Pune');
    expect(screen.getByRole('status').textContent).toMatch(/Check the fields/);
    expect(ctx.addJob).not.toHaveBeenCalled(); // nothing saved until the person adds it
  });

  it('never blanks what was already typed when the AI found nothing for that field', async () => {
    api.parseJobsWithAI.mockResolvedValue({ jobs: [aiJob({ location: '' })], truncated: false });
    render(<JobModal open onClose={vi.fn()} job={null} />);
    fireEvent.change(screen.getByPlaceholderText('Bengaluru, India'), { target: { value: 'Remote' } });
    fireEvent.change(box(), { target: { value: posting } });
    fireEvent.click(screen.getByText('Auto-fill'));
    await waitFor(() => expect(screen.getByPlaceholderText('Acme Inc.').value).toBe('Acme Corp'));
    expect(screen.getByPlaceholderText('Bengaluru, India').value).toBe('Remote');
  });

  it('passes a pasted link through to be read, and shows the notice', async () => {
    api.parseJobsWithAI.mockResolvedValue({ jobs: [aiJob({ jobUrl: 'https://careers.wexinc.com/job/1' })], truncated: false, notices: ['The page says this job may already be filled or closed.'] });
    render(<JobModal open onClose={vi.fn()} job={null} />);
    fireEvent.change(box(), { target: { value: 'https://careers.wexinc.com/job/1?utm_source=linkedin' } });
    fireEvent.click(screen.getByText('Auto-fill'));
    await waitFor(() => expect(screen.getByPlaceholderText('https://company.com/careers/123').value).toBe('https://careers.wexinc.com/job/1'));
    expect(api.parseJobsWithAI).toHaveBeenCalledWith('https://careers.wexinc.com/job/1?utm_source=linkedin');
    expect(screen.getByRole('status').textContent).toMatch(/filled or closed/);
  });

  it('says so when several jobs were found, and fills the first', async () => {
    api.parseJobsWithAI.mockResolvedValue({ jobs: [aiJob(), aiJob({ company: 'Globex' })], truncated: false });
    render(<JobModal open onClose={vi.fn()} job={null} />);
    fireEvent.change(box(), { target: { value: posting } });
    fireEvent.click(screen.getByText('Auto-fill'));
    expect((await screen.findByRole('status')).textContent).toMatch(/Found 2 jobs/);
    expect(screen.getByPlaceholderText('Acme Inc.').value).toBe('Acme Corp');
  });

  it('shows an error, and leaves the form alone, when the AI fails', async () => {
    api.parseJobsWithAI.mockRejectedValue(new Error('Groq is down'));
    render(<JobModal open onClose={vi.fn()} job={null} />);
    fireEvent.change(box(), { target: { value: posting } });
    fireEvent.click(screen.getByText('Auto-fill'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/needs a GROQ_API_KEY/);
    expect(screen.getByPlaceholderText('Acme Inc.').value).toBe('');
  });

  it('is not offered when editing an existing job, and needs text to press', () => {
    const { unmount } = render(<JobModal open onClose={vi.fn()} job={{ id: 'j1', company: 'Acme', role: 'Dev', status: 'applied' }} />);
    expect(screen.queryByLabelText(/Paste a job posting/)).toBeNull();
    unmount();
    render(<JobModal open onClose={vi.fn()} job={null} />);
    expect(screen.getByText('Auto-fill').closest('button').disabled).toBe(true);
  });
});
