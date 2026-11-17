import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const h = vi.hoisted(() => ({ user: null, loaded: true, session: null, signOut: vi.fn(), openUserProfile: vi.fn() }));
vi.mock('@clerk/clerk-react', () => ({
  useUser: () => ({ user: h.loaded ? h.user : null, isLoaded: h.loaded }),
  useClerk: () => ({ openUserProfile: h.openUserProfile }),
}));
vi.mock('../context/JobsContext', () => ({ useJobs: () => ({ session: h.session, signOut: h.signOut }) }));
vi.mock('../lib/api', () => ({ fetchMyPeerCode: vi.fn() }));
import * as api from '../lib/api';
import { resetThemeForTests } from '../lib/useTheme';
import ProfilePage from './ProfilePage';
import { clerkMessage } from '../lib/clerkMessage';

const email = (id, address, verified = true) => ({
  id, emailAddress: address, verification: { status: verified ? 'verified' : 'unverified' },
  prepareVerification: vi.fn().mockResolvedValue(), attemptVerification: vi.fn().mockResolvedValue({ verification: { status: 'verified' } }), destroy: vi.fn().mockResolvedValue(),
});
const clerkError = (text) => Object.assign(new Error('clerk'), { errors: [{ longMessage: text }] });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  document.documentElement.classList.remove('dark', 'light');
  resetThemeForTests();
  const primary = email('e1', 'priya@acme.com');
  h.loaded = true;
  h.user = {
    id: 'u1', firstName: 'Priya', lastName: 'Sharma', hasImage: false, imageUrl: '', createdAt: new Date('2026-03-05').getTime(),
    primaryEmailAddress: primary, primaryEmailAddressId: 'e1',
    emailAddresses: [primary, email('e2', 'work@acme.com'), email('e3', 'old@acme.com', false)],
    update: vi.fn().mockResolvedValue(), setProfileImage: vi.fn().mockResolvedValue(), reload: vi.fn().mockResolvedValue(),
    createEmailAddress: vi.fn(),
  };
  h.session = { user: { email: 'priya@acme.com', user_metadata: { display_name: 'Priya Sharma' } } };
  api.fetchMyPeerCode.mockResolvedValue('PEER-ABC234');
});
afterEach(() => cleanup());

describe('Profile: personal details', () => {
  it('shows your name, email, member-since date and peer code', async () => {
    render(<ProfilePage />);
    expect(screen.getByLabelText('First name').value).toBe('Priya');
    expect(screen.getByLabelText('Last name').value).toBe('Sharma');
    expect(screen.getByText(/Member since March 2026/)).toBeTruthy();
    expect(await screen.findByText('PEER-ABC234')).toBeTruthy();
  });

  it('can only save once something changed, and saves trimmed names to Clerk', async () => {
    render(<ProfilePage />);
    const save = screen.getByText('Save changes').closest('button');
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: '  Priyanka ' } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(h.user.update).toHaveBeenCalledWith({ firstName: 'Priyanka', lastName: 'Sharma' }));
    expect((await screen.findByRole('status')).textContent).toMatch(/peers will see the new name/);
  });

  it('will not save a name that is empty (peers need something to see)', () => {
    render(<ProfilePage />);
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: ' ' } });
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: '' } });
    fireEvent.click(screen.getByText('Save changes'));
    expect(screen.getByRole('alert').textContent).toMatch(/at least a first name/);
    expect(h.user.update).not.toHaveBeenCalled();
  });

  it('shows the reason when Clerk refuses the change', async () => {
    h.user.update.mockRejectedValue(clerkError('Name is too long.'));
    render(<ProfilePage />);
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'x' } });
    fireEvent.click(screen.getByText('Save changes'));
    expect((await screen.findByRole('alert')).textContent).toBe('Name is too long.');
  });

  it('shows a loading state until Clerk has loaded', () => {
    h.loaded = false;
    render(<ProfilePage />);
    expect(screen.getByRole('status').textContent).toMatch(/Loading your profile/);
    expect(screen.queryByLabelText('First name')).toBeNull();
  });
});

describe('Profile: photo', () => {
  const choose = (file) => fireEvent.change(screen.getByLabelText('Choose a profile photo'), { target: { files: [file] } });
  const img = (type = 'image/png', size = 1000) => { const f = new File(['x'], 'me.png', { type }); Object.defineProperty(f, 'size', { value: size }); return f; };

  it('uploads a good image', async () => {
    render(<ProfilePage />);
    const f = img();
    choose(f);
    await waitFor(() => expect(h.user.setProfileImage).toHaveBeenCalledWith({ file: f }));
    expect((await screen.findByText('Photo updated.'))).toBeTruthy();
  });

  it('refuses files that are not images or are too big, without calling Clerk', () => {
    render(<ProfilePage />);
    choose(img('application/pdf'));
    expect(screen.getByRole('alert').textContent).toMatch(/PNG, JPG, WebP or GIF/);
    choose(img('image/png', 11 * 1024 * 1024));
    expect(screen.getByRole('alert').textContent).toMatch(/over 10 MB/);
    expect(h.user.setProfileImage).not.toHaveBeenCalled();
  });

  it('offers Remove only when there is a photo, and removes it', async () => {
    const { unmount } = render(<ProfilePage />);
    expect(screen.queryByText('Remove')).toBeNull();
    unmount();
    h.user.hasImage = true; h.user.imageUrl = 'https://img.clerk.com/x.png';
    render(<ProfilePage />);
    fireEvent.click(screen.getByText('Remove'));
    await waitFor(() => expect(h.user.setProfileImage).toHaveBeenCalledWith({ file: null }));
  });

  it('shows the Clerk error if the upload fails', async () => {
    h.user.setProfileImage.mockRejectedValue(clerkError('Image could not be processed.'));
    render(<ProfilePage />);
    choose(img());
    expect((await screen.findByRole('alert')).textContent).toBe('Image could not be processed.');
  });
});

describe('Profile: email addresses', () => {
  it('lists every address with its status and who is primary', () => {
    render(<ProfilePage />);
    expect(screen.getAllByText('priya@acme.com').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Primary')).toHaveLength(1);
    expect(screen.getAllByText('Verified')).toHaveLength(2);
    expect(screen.getAllByText('Unverified')).toHaveLength(1);
  });

  it('only offers "Make primary" for verified addresses that are not primary, and never lets the primary be removed', () => {
    render(<ProfilePage />);
    expect(screen.getAllByText('Make primary')).toHaveLength(1); // work@acme.com
    expect(screen.queryByLabelText('Remove priya@acme.com')).toBeNull();
    expect(screen.getByLabelText('Remove work@acme.com')).toBeTruthy();
    expect(screen.getByLabelText('Remove old@acme.com')).toBeTruthy();
  });

  it('makes an address primary', async () => {
    render(<ProfilePage />);
    fireEvent.click(screen.getByText('Make primary'));
    await waitFor(() => expect(h.user.update).toHaveBeenCalledWith({ primaryEmailAddressId: 'e2' }));
    expect((await screen.findByRole('status')).textContent).toMatch(/work@acme.com is now your primary/);
  });

  it('removes an address', async () => {
    render(<ProfilePage />);
    fireEvent.click(screen.getByLabelText('Remove old@acme.com'));
    await waitFor(() => expect(h.user.emailAddresses[2].destroy).toHaveBeenCalled());
    expect((await screen.findByRole('status')).textContent).toMatch(/Removed old@acme.com/);
  });

  it('adds an address: sends a code, then verifies it', async () => {
    const created = email('e9', 'new@acme.com', false);
    h.user.createEmailAddress.mockResolvedValue(created);
    render(<ProfilePage />);
    fireEvent.click(screen.getByText('Add an email'));
    fireEvent.change(screen.getByLabelText('New email address'), { target: { value: ' new@acme.com ' } });
    fireEvent.click(screen.getByText('Send code'));
    await waitFor(() => expect(h.user.createEmailAddress).toHaveBeenCalledWith({ email: 'new@acme.com' }));
    expect(created.prepareVerification).toHaveBeenCalledWith({ strategy: 'email_code' });
    expect(await screen.findByText(/We sent a 6-digit code to/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: ' 424242 ' } });
    fireEvent.click(screen.getByText('Verify'));
    await waitFor(() => expect(created.attemptVerification).toHaveBeenCalledWith({ code: '424242' }));
    expect((await screen.findByRole('status')).textContent).toMatch(/Email verified/);
    expect(screen.queryByLabelText('Verification code')).toBeNull();
    expect(h.user.reload).toHaveBeenCalled();
  });

  it('keeps the code box open and explains when the code is wrong', async () => {
    const created = email('e9', 'new@acme.com', false);
    created.attemptVerification.mockResolvedValue({ verification: { status: 'unverified' } });
    h.user.createEmailAddress.mockResolvedValue(created);
    render(<ProfilePage />);
    fireEvent.click(screen.getByText('Add an email'));
    fireEvent.change(screen.getByLabelText('New email address'), { target: { value: 'new@acme.com' } });
    fireEvent.click(screen.getByText('Send code'));
    await screen.findByText(/We sent a 6-digit code/);
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '000000' } });
    fireEvent.click(screen.getByText('Verify'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/did not match/);
    expect(screen.getByLabelText('Verification code')).toBeTruthy();
  });

  it('can resend the code or cancel (which removes the unverified address)', async () => {
    const created = email('e9', 'new@acme.com', false);
    h.user.createEmailAddress.mockResolvedValue(created);
    render(<ProfilePage />);
    fireEvent.click(screen.getByText('Add an email'));
    fireEvent.change(screen.getByLabelText('New email address'), { target: { value: 'new@acme.com' } });
    fireEvent.click(screen.getByText('Send code'));
    await screen.findByText(/We sent a 6-digit code/);
    fireEvent.click(screen.getByText('Send a new code'));
    await waitFor(() => expect(created.prepareVerification).toHaveBeenCalledTimes(2));
    expect((await screen.findByRole('status')).textContent).toMatch(/new code/);
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => expect(created.destroy).toHaveBeenCalled());
    expect(screen.queryByLabelText('Verification code')).toBeNull();
  });

  it('shows Clerk\'s reason when an address cannot be added (already used, invalid)', async () => {
    h.user.createEmailAddress.mockRejectedValue(clerkError('That email address is taken. Please try another.'));
    render(<ProfilePage />);
    fireEvent.click(screen.getByText('Add an email'));
    fireEvent.change(screen.getByLabelText('New email address'), { target: { value: 'priya@acme.com' } });
    fireEvent.click(screen.getByText('Send code'));
    expect((await screen.findByRole('alert')).textContent).toBe('That email address is taken. Please try another.');
  });
});

describe('Profile: appearance, security, peer code', () => {
  it('switches the theme', () => {
    render(<ProfilePage />);
    fireEvent.click(screen.getByRole('button', { name: /Light/ }));
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(screen.getByRole('button', { name: /Light/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /Dark/ }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('opens Clerk\'s secure window for password and security, in the current theme', () => {
    render(<ProfilePage />);
    fireEvent.click(screen.getByText(/Password & security/));
    expect(h.openUserProfile).toHaveBeenCalledTimes(1);
    expect(h.openUserProfile.mock.calls[0][0].appearance.variables).toBeTruthy();
  });

  it('signs out', () => {
    render(<ProfilePage />);
    fireEvent.click(screen.getByText('Sign out'));
    expect(h.signOut).toHaveBeenCalled();
  });

  it('copies the peer code', async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.assign(navigator, { clipboard: { writeText } });
    render(<ProfilePage />);
    await screen.findByText('PEER-ABC234');
    fireEvent.click(screen.getByLabelText('Copy peer code'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('PEER-ABC234'));
    expect(await screen.findByText('Copied')).toBeTruthy();
  });

  it('copes with a blocked clipboard and a peer code that could not load', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('blocked')) } });
    render(<ProfilePage />);
    await screen.findByText('PEER-ABC234');
    fireEvent.click(screen.getByLabelText('Copy peer code'));
    expect(screen.queryByText('Copied')).toBeNull();
    cleanup();
    api.fetchMyPeerCode.mockRejectedValue(new Error('offline'));
    render(<ProfilePage />);
    expect(screen.getByLabelText('Copy peer code').disabled).toBe(true);
  });

  it('has a Back button only when the page gives one', () => {
    const onBack = vi.fn();
    const { rerender } = render(<ProfilePage onBack={onBack} />);
    fireEvent.click(screen.getByText('Back'));
    expect(onBack).toHaveBeenCalled();
    rerender(<ProfilePage />);
    expect(screen.queryByText('Back')).toBeNull();
    void within;
  });
});

describe('clerkMessage', () => {
  it('prefers the long message, then the short one, then the error text, then a fallback', () => {
    expect(clerkMessage({ errors: [{ longMessage: 'Long', message: 'Short' }] })).toBe('Long');
    expect(clerkMessage({ errors: [{ message: 'Short' }] })).toBe('Short');
    expect(clerkMessage(new Error('plain'))).toBe('plain');
    expect(clerkMessage({})).toMatch(/did not work/);
  });
});
