import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../lib/api', () => ({ parseContactsWithAI: vi.fn() }));
import * as api from '../lib/api';
import ContactModal from './ContactModal';

beforeEach(() => vi.resetAllMocks());
afterEach(() => cleanup());

describe('ContactModal Auto-fill', () => {
  it('fills only what the AI found and keeps what was typed', async () => {
    api.parseContactsWithAI.mockResolvedValue({ contacts: [{ name: 'Priya Sharma', email: 'priya@acme.com', phone: '', company: 'Acme', designation: 'Recruiter', linkedinUrl: '' }] });
    render(<ContactModal open onClose={() => {}} onSave={() => {}} />);
    fireEvent.change(screen.getByLabelText('Phone number *'), { target: { value: '12345' } });
    fireEvent.change(screen.getByLabelText(/Paste a recruiter/), { target: { value: 'Priya from Acme priya@acme.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Auto-fill/ }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Filled in/));
    expect(screen.getByLabelText('Name *').value).toBe('Priya Sharma');
    expect(screen.getByLabelText('Email *').value).toBe('priya@acme.com');
    expect(screen.getByLabelText('Phone number *').value).toBe('12345');
  });
  it('shows an error when nobody is found, and is not offered when editing', async () => {
    api.parseContactsWithAI.mockResolvedValue({ contacts: [] });
    const { rerender } = render(<ContactModal open onClose={() => {}} onSave={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Paste a recruiter/), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: /Auto-fill/ }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not find a contact/);
    rerender(<ContactModal open onClose={() => {}} onSave={() => {}} contact={{ id: '1', name: 'A', email: 'a@b.co', phone: '1', company: 'C' }} />);
    expect(screen.queryByRole('button', { name: /Auto-fill/ })).toBeNull();
  });
});
