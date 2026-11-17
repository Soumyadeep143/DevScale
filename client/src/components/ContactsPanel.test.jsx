import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../lib/api', () => ({
  fetchContacts: vi.fn(),
  createContact: vi.fn(),
  updateContact: vi.fn(),
  deleteContact: vi.fn(),
  fetchSharedContacts: vi.fn(),
  duplicateContact: vi.fn(),
  bulkCreateContacts: vi.fn(),
}));

import * as api from '../lib/api';
import ContactsPanel from './ContactsPanel';

const mine = (over) => ({
  id: 'c1', name: 'Alice', email: 'alice@acme.com', phone: '+1 555 0100', company: 'Acme', designation: 'Recruiter',
  linkedinUrl: '', notes: 'met at career fair', visibility: 'personal', ...over,
});
const shared = (over) => ({
  id: 's1', owner: 'Priya', name: 'Bob', email: 'bob@globex.com', phone: '+1 555 0200', company: 'Globex',
  designation: '', linkedinUrl: '', alreadySaved: false, ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  api.fetchContacts.mockResolvedValue([mine(), mine({ id: 'c2', name: 'Carol', email: 'carol@zeta.io', company: 'Zeta', visibility: 'peer', notes: '' }), mine({ id: 'c3', name: 'Erin', email: 'erin@zeta.io', company: 'Zeta' })]);
  api.fetchSharedContacts.mockResolvedValue([shared()]);
});
afterEach(() => cleanup());

function fill(label, value) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('ContactsPanel', () => {
  it('lists only my personal contacts: one moved to Team has left', async () => {
    render(<ContactsPanel />);
    expect(await screen.findByText('Alice')).toBeTruthy();
    expect(screen.getByText('Erin')).toBeTruthy();
    expect(screen.queryByText('Carol')).toBeNull(); // peer-visible: it lives under Team now
    expect(screen.queryByText('Bob')).toBeNull(); // shared with me lives on the other tab
    expect(screen.queryByLabelText('Filter by visibility')).toBeNull(); // nothing to filter: all are personal
  });

  it('searches by name, email and company', async () => {
    render(<ContactsPanel />);
    await screen.findByText('Alice');
    const box = screen.getByLabelText('Search contacts');
    fireEvent.change(box, { target: { value: 'erin' } });
    expect(screen.queryByText('Alice')).toBeNull();
    expect(screen.getByText('Erin')).toBeTruthy();
    fireEvent.change(box, { target: { value: 'alice@acme' } });
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.queryByText('Erin')).toBeNull();
    fireEvent.change(box, { target: { value: 'zeta' } });
    expect(screen.getByText('Erin')).toBeTruthy();
  });

  it('moves a personal contact to Team with one click, and says where it went', async () => {
    api.updateContact.mockResolvedValue({});
    render(<ContactsPanel />);
    await screen.findByText('Alice');
    fireEvent.click(screen.getByLabelText('Move Alice to Team'));
    await waitFor(() => expect(api.updateContact).toHaveBeenCalledWith('c1', { visibility: 'peer' }));
    expect((await screen.findByRole('status')).textContent).toMatch(/Moved Alice to Team/);
    expect(api.fetchContacts).toHaveBeenCalledTimes(2); // list reloaded
  });

  it('shows the server error if the move fails, and keeps the contact', async () => {
    api.updateContact.mockRejectedValue(new Error('nope'));
    render(<ContactsPanel />);
    await screen.findByText('Alice');
    fireEvent.click(screen.getByLabelText('Move Alice to Team'));
    expect((await screen.findByRole('alert')).textContent).toContain('nope');
    expect(screen.getByText('Alice')).toBeTruthy();
  });

  it('adds a contact with the entered fields and visibility', async () => {
    api.createContact.mockResolvedValue({});
    render(<ContactsPanel />);
    await screen.findByText('Alice');
    fireEvent.click(screen.getByText('Add contact'));
    fill('Name *', 'Dan');
    fill('Company *', 'Initech');
    fill('Email *', 'dan@initech.com');
    fill('Phone number *', '+1 555 0300');
    fill('Workspace', 'peer');
    fireEvent.submit(screen.getByLabelText('Name *').closest('form'));
    await waitFor(() => expect(api.createContact).toHaveBeenCalledTimes(1));
    expect(api.createContact.mock.calls[0][0]).toMatchObject({
      name: 'Dan', company: 'Initech', email: 'dan@initech.com', phone: '+1 555 0300', visibility: 'peer',
    });
  });

  it('shows the server error and keeps the form open when saving fails', async () => {
    api.createContact.mockRejectedValue(new Error('new row violates check constraint "contacts_email_check"'));
    render(<ContactsPanel />);
    await screen.findByText('Alice');
    fireEvent.click(screen.getByText('Add contact'));
    fill('Name *', 'Dan');
    fill('Company *', 'Initech');
    fill('Email *', 'dan@initech.com');
    fill('Phone number *', '1');
    fireEvent.submit(screen.getByLabelText('Name *').closest('form'));
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((a) => a.textContent.includes('contacts_email_check'))).toBe(true);
    expect(screen.getByLabelText('Name *')).toBeTruthy(); // still open
  });

  it('edits one of my contacts', async () => {
    api.updateContact.mockResolvedValue({});
    render(<ContactsPanel />);
    fireEvent.click(await screen.findByLabelText('Edit Alice'));
    fill('Phone number *', '+1 999 0000');
    fireEvent.click(screen.getByText('Save changes'));
    await waitFor(() => expect(api.updateContact).toHaveBeenCalledWith('c1', expect.objectContaining({ phone: '+1 999 0000', name: 'Alice' })));
  });

  it('deletes a contact only after confirmation', async () => {
    api.deleteContact.mockResolvedValue();
    const confirmSpy = vi.spyOn(window, 'confirm');
    render(<ContactsPanel />);
    const del = await screen.findByLabelText('Delete Alice');

    confirmSpy.mockReturnValueOnce(false);
    fireEvent.click(del);
    expect(api.deleteContact).not.toHaveBeenCalled();

    confirmSpy.mockReturnValueOnce(true);
    fireEvent.click(del);
    await waitFor(() => expect(api.deleteContact).toHaveBeenCalledWith('c1'));
    confirmSpy.mockRestore();
  });

  it('shows shared contacts with the owner and no edit or delete controls', async () => {
    render(<ContactsPanel mode="team" />);
    fireEvent.click(await screen.findByRole('tab', { name: /Shared with me/ }));
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByText('Shared by Priya')).toBeTruthy();
    expect(screen.queryByLabelText('Edit Bob')).toBeNull();
    expect(screen.queryByLabelText('Delete Bob')).toBeNull();
  });

  it('saves a shared contact into my own contacts', async () => {
    api.duplicateContact.mockResolvedValue({});
    render(<ContactsPanel mode="team" />);
    fireEvent.click(await screen.findByRole('tab', { name: /Shared with me/ }));
    fireEvent.click(screen.getByText('Save to my contacts'));
    await waitFor(() => expect(api.duplicateContact).toHaveBeenCalledWith('s1'));
  });

  it('does not offer to save a contact I already have', async () => {
    api.fetchSharedContacts.mockResolvedValue([shared({ alreadySaved: true })]);
    render(<ContactsPanel mode="team" />);
    fireEvent.click(await screen.findByRole('tab', { name: /Shared with me/ }));
    expect(screen.getByText('In your contacts')).toBeTruthy();
    expect(screen.queryByText('Save to my contacts')).toBeNull();
  });

  it('Personal mode has no tabs and lists my personal contacts', async () => {
    render(<ContactsPanel mode="personal" />);
    expect(await screen.findByText('Alice')).toBeTruthy();
    expect(screen.queryByText('Carol')).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByText('Bob')).toBeNull();
  });

  it('Team mode: Shared by me lists only my peer-visible contacts, still editable', async () => {
    render(<ContactsPanel mode="team" />);
    expect(await screen.findByText('Carol')).toBeTruthy();
    expect(screen.queryByText('Alice')).toBeNull(); // personal contact stays out of Team
    expect(screen.getByLabelText('Edit Carol')).toBeTruthy();
    expect(screen.queryByLabelText('Filter by visibility')).toBeNull();
  });

  it('Team mode: a new contact defaults to Peer visibility', async () => {
    api.createContact.mockResolvedValue({});
    render(<ContactsPanel mode="team" />);
    await screen.findByText('Carol');
    fireEvent.click(screen.getByText('Add contact'));
    fill('Name *', 'Dan');
    fill('Company *', 'Initech');
    fill('Email *', 'dan@initech.com');
    fill('Phone number *', '1');
    fireEvent.submit(screen.getByLabelText('Name *').closest('form'));
    await waitFor(() => expect(api.createContact).toHaveBeenCalledTimes(1));
    expect(api.createContact.mock.calls[0][0].visibility).toBe('peer');
  });

  it('Personal mode: a new contact defaults to Personal visibility', async () => {
    api.createContact.mockResolvedValue({});
    render(<ContactsPanel mode="personal" />);
    await screen.findByText('Alice');
    fireEvent.click(screen.getByText('Add contact'));
    fill('Name *', 'Dan');
    fill('Company *', 'Initech');
    fill('Email *', 'dan@initech.com');
    fill('Phone number *', '1');
    fireEvent.submit(screen.getByLabelText('Name *').closest('form'));
    await waitFor(() => expect(api.createContact).toHaveBeenCalledTimes(1));
    expect(api.createContact.mock.calls[0][0].visibility).toBe('personal');
  });

  it('imports pasted contacts, skipping ones I already have, then refreshes the list', async () => {
    api.bulkCreateContacts.mockResolvedValue(1);
    render(<ContactsPanel mode="personal" />);
    await screen.findByText('Alice');
    fireEvent.click(screen.getByText('Import'));
    fireEvent.change(screen.getByLabelText('Paste contacts'), {
      target: { value: 'Alice Again\talice@acme.com\t1\tAcme\nNew Person\tnew@zeta.io\t2\tZeta' },
    });
    expect(screen.getByText('Line 1: Already in your contacts')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Import 1 contact$/ }));
    await waitFor(() => expect(api.bulkCreateContacts).toHaveBeenCalledTimes(1));
    expect(api.bulkCreateContacts.mock.calls[0][0].map((r) => r.email)).toEqual(['new@zeta.io']);
    expect(api.bulkCreateContacts.mock.calls[0][1]).toBe('personal');
    await waitFor(() => expect(api.fetchContacts).toHaveBeenCalledTimes(2)); // list reloaded
  });
});
