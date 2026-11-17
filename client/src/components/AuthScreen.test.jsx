import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const h = vi.hoisted(() => ({ isSignedIn: false, signOut: vi.fn(), retryAuth: vi.fn(), authError: '' }));
vi.mock('@clerk/clerk-react', () => ({
  SignIn: () => <div data-testid="clerk-signin" />,
  SignUp: () => <div data-testid="clerk-signup" />,
  useAuth: () => ({ isSignedIn: h.isSignedIn }),
  useClerk: () => ({ signOut: h.signOut }),
}));
vi.mock('../context/JobsContext', () => ({ useJobs: () => ({ authError: h.authError, retryAuth: h.retryAuth }) }));

import AuthScreen from './AuthScreen';

beforeEach(() => { vi.clearAllMocks(); Object.assign(h, { isSignedIn: false, authError: '' }); });
afterEach(() => cleanup());

describe('AuthScreen (Clerk)', () => {
  it('shows Clerk sign-in first and can switch to sign-up and back', () => {
    render(<AuthScreen />);
    expect(screen.getByTestId('clerk-signin')).toBeTruthy();
    fireEvent.click(screen.getByText('Create an account'));
    expect(screen.getByTestId('clerk-signup')).toBeTruthy();
    expect(screen.queryByTestId('clerk-signin')).toBeNull();
    fireEvent.click(screen.getByText('Sign in'));
    expect(screen.getByTestId('clerk-signin')).toBeTruthy();
  });

  it('explains a failed account setup and offers retry and sign out', () => {
    Object.assign(h, { isSignedIn: true, authError: 'permission denied' });
    render(<AuthScreen />);
    expect(screen.getByRole('alert').textContent).toContain('permission denied');
    fireEvent.click(screen.getByText('Try again'));
    expect(h.retryAuth).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Sign out'));
    expect(h.signOut).toHaveBeenCalled();
  });

  it('shows a loading state while a signed-in account is being prepared', () => {
    h.isSignedIn = true;
    render(<AuthScreen />);
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByTestId('clerk-signin')).toBeNull();
  });
});
