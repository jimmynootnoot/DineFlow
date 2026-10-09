import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useAuth } from './useAuth';
import { supabase } from '../services/supabase';

jest.mock('../services/supabase', () => ({
  supabaseConfigError: null,
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
      signInAnonymously: jest.fn(),
      signOut: jest.fn(),
    },
    from: jest.fn(),
  },
}));

function AuthHarness() {
  const { user, handleGuestAccess, authLoading } = useAuth();
  return (
    <div>
      <button onClick={handleGuestAccess} disabled={authLoading}>Start guest</button>
      <span>{user ? `${user.name}:${user.role}:${user.isGuest}` : 'No user'}</span>
    </div>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  supabase.auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } });
  supabase.auth.signInAnonymously.mockResolvedValue({
    data: {
      user: {
        id: 'guest-user',
        email: null,
        is_anonymous: true,
        user_metadata: { full_name: 'Guest' },
      },
    },
    error: null,
  });
  supabase.from.mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({ data: { full_name: 'Guest', role: 'Customer' }, error: null }),
      }),
    }),
  });
});

test('creates an anonymous customer session for QR ordering', async () => {
  render(<AuthHarness />);
  await waitFor(() => expect(screen.getByRole('button', { name: /start guest/i })).toBeEnabled());

  fireEvent.click(screen.getByRole('button', { name: /start guest/i }));

  await screen.findByText('Guest:Customer:true');
  expect(supabase.auth.signInAnonymously).toHaveBeenCalledWith({
    options: { data: { full_name: 'Guest' } },
  });
});
