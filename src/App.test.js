import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the Supabase email login form', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/email/i)).toHaveAttribute('type', 'email');
  expect(screen.getByLabelText(/password/i)).toHaveAttribute('type', 'password');
});
