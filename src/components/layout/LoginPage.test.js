import { fireEvent, render, screen } from '@testing-library/react';
import LoginPage from './LoginPage';

const defaultProps = {
  loginForm: { email: '', password: '', name: '', intent: 'login' },
  loginError: null,
  authNotice: null,
  authLoading: false,
  onLoginChange: jest.fn(),
  onSubmit: jest.fn(),
  onGuestAccess: jest.fn(),
  onOpenSignup: jest.fn(),
  signUpModalOpen: false,
  onCloseSignup: jest.fn(),
};

test('offers account-free ordering when opened from a table QR', () => {
  const onGuestAccess = jest.fn();
  render(
    <LoginPage
      {...defaultProps}
      tableSessionToken="11111111-1111-1111-1111-111111111111"
      onGuestAccess={onGuestAccess}
    />
  );

  expect(screen.getByRole('heading', { name: /ready to order/i })).toBeInTheDocument();
  expect(screen.getByText(/no email or password needed/i)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /continue as guest/i }));
  expect(onGuestAccess).toHaveBeenCalledTimes(1);
});

test('keeps account sign-in available from the QR guest screen', () => {
  render(
    <LoginPage
      {...defaultProps}
      tableSessionToken="11111111-1111-1111-1111-111111111111"
    />
  );

  fireEvent.click(screen.getByRole('button', { name: /sign in instead/i }));

  expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/email/i)).toHaveAttribute('type', 'email');
  expect(screen.getByRole('button', { name: /continue as guest/i })).toBeInTheDocument();
});
