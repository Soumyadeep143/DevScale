import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../lib/api', () => ({ bulkCreateContacts: vi.fn(), parseContactsWithAI: vi.fn() }));
import * as api from '../lib/api';
import ContactImportModal from './ContactImportModal';

beforeEach(() => vi.resetAllMocks());
afterEach(() => cleanup());

const paste = (text) => fireEvent.change(screen.getByLabelText('Paste contacts'), { target: { value: text } });
const GOOD = 'Priya\tpriya@acme.com\t123\tAcme\nBob\tbob@globex.com\t456\tGlobex';

function setup(props) {
  const onClose = vi.fn();
  const onImported = vi.fn();
  render(<ContactImportModal open onClose={onClose} onImported={onImported} {...props} />);
  return { onClose, onImported };
}

describe('ContactImportModal', () => {
  it('previews what will be imported and what is skipped, with reasons', () => {
    setup();
    paste(`${GOOD}\nBroken\tnot-an-email\t1\tCo`);
    expect(screen.getByText('Priya')).toBeTruthy();
    expect(screen.getByText(/2/, { selector: 'strong' })).toBeTruthy();
    expect(screen.getByText('Line 3: Invalid email "not-an-email"')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Import 2 contacts/ })).toBeTruthy();
  });

  it('disables Import until there is something valid to import', () => {
    setup();
    expect(screen.getByRole('button', { name: /Import/ }).disabled).toBe(true);
    paste('Broken\tx\t1\tCo');
    expect(screen.getByRole('button', { name: /Import/ }).disabled).toBe(true);
  });

  it('skips emails the user already has', () => {
    setup({ existingEmails: ['priya@acme.com'] });
    paste(GOOD);
    expect(screen.getByText('Line 1: Already in your contacts')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Import 1 contact$/ })).toBeTruthy();
  });

  it('imports the valid rows with the chosen visibility and reports the result', async () => {
    api.bulkCreateContacts.mockResolvedValue(2);
    const { onImported } = setup();
    paste(GOOD);
    fireEvent.change(screen.getByLabelText('Visibility:'), { target: { value: 'peer' } });
    fireEvent.click(screen.getByRole('button', { name: /Import 2 contacts/ }));
    await waitFor(() => expect(api.bulkCreateContacts).toHaveBeenCalledTimes(1));
    const [rows, visibility] = api.bulkCreateContacts.mock.calls[0];
    expect(visibility).toBe('peer');
    expect(rows.map((r) => r.email)).toEqual(['priya@acme.com', 'bob@globex.com']);
    expect(await screen.findByText('Imported 2 contacts')).toBeTruthy();
    expect(onImported).toHaveBeenCalledWith(2);
  });

  it('uses the default visibility it was given', async () => {
    api.bulkCreateContacts.mockResolvedValue(2);
    setup({ defaultVisibility: 'peer' });
    paste(GOOD);
    fireEvent.click(screen.getByRole('button', { name: /Import 2 contacts/ }));
    await waitFor(() => expect(api.bulkCreateContacts.mock.calls[0][1]).toBe('peer'));
  });

  it('shows the server error and stays open when the import fails', async () => {
    api.bulkCreateContacts.mockRejectedValue(new Error('permission denied'));
    const { onImported } = setup();
    paste(GOOD);
    fireEvent.click(screen.getByRole('button', { name: /Import 2 contacts/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('permission denied');
    expect(onImported).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Paste contacts')).toBeTruthy();
  });

  it('refuses an oversized paste', () => {
    setup();
    paste(Array.from({ length: 501 }, (_, i) => `N${i}\tn${i}@x.com\t1\tCo`).join('\n'));
    expect(screen.getByRole('alert').textContent).toContain('at most 500');
    expect(screen.getByRole('button', { name: /Import/ }).disabled).toBe(true);
  });

  it('Read with AI turns messy text into checked rows, which are then imported as usual', async () => {
    api.parseContactsWithAI.mockResolvedValue({ contacts: [{ name: 'Priya Sharma', email: 'priya@acme.com', phone: '+91 98765 43210', company: 'Acme', designation: 'Recruiter', linkedinUrl: '' }], truncated: false });
    api.bulkCreateContacts.mockResolvedValue(1);
    setup();
    expect(screen.getByRole('button', { name: /Read with AI/ }).disabled).toBe(true);
    paste('Hi, I am Priya from Acme, reach me at priya@acme.com');
    fireEvent.click(screen.getByRole('button', { name: /Read with AI/ }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Found 1 contact/));
    expect(screen.getByLabelText('Paste contacts').value).toMatch(/^Name\tEmail\tPhone/);
    fireEvent.click(screen.getByRole('button', { name: /Import 1 contact/ }));
    await waitFor(() => expect(api.bulkCreateContacts).toHaveBeenCalled());
    expect(api.bulkCreateContacts.mock.calls[0][0][0].email).toBe('priya@acme.com');
  });

  it('shows a clear message when the AI finds nobody or fails, and keeps the text', async () => {
    api.parseContactsWithAI.mockResolvedValueOnce({ contacts: [], truncated: false });
    setup();
    paste('nothing useful');
    fireEvent.click(screen.getByRole('button', { name: /Read with AI/ }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not find a contact/);
    expect(screen.getByLabelText('Paste contacts').value).toBe('nothing useful');
    api.parseContactsWithAI.mockRejectedValueOnce(new Error('Couldn’t reach the AI server'));
    fireEvent.click(screen.getByRole('button', { name: /Read with AI/ }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/reach the AI server/));
  });
});
