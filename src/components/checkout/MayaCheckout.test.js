import { act, fireEvent, render, screen } from '@testing-library/react';
import MayaCheckout from './MayaCheckout';
import { recordPayment } from '../../services/reportService';

jest.mock('../../services/reportService', () => ({ recordPayment: jest.fn() }));

function enterCard(number) {
  fireEvent.click(screen.getByRole('button', { name: /Credit or debit card/ }));
  fireEvent.change(screen.getByLabelText('Card number'), { target: { value: number } });
  fireEvent.change(screen.getByLabelText('Name on card'), { target: { value: 'Juan dela Cruz' } });
  fireEvent.change(screen.getByLabelText('Expiry'), { target: { value: '1228' } });
  fireEvent.change(screen.getByLabelText('CVV'), { target: { value: '123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review payment' }));
  fireEvent.click(screen.getByRole('button', { name: 'Authorize payment' }));
  fireEvent.change(screen.getByLabelText('6-digit authorization code'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: /Pay ₱125.00/ }));
}

beforeEach(() => { jest.useFakeTimers(); recordPayment.mockReset(); });
afterEach(() => jest.useRealTimers());

test('approved demo card follows review, authorization, processing and receipt states', async () => {
  recordPayment.mockResolvedValue({ id: '12345678-aaaa-bbbb-cccc-123456789012', status: 'PAID' });
  const complete = jest.fn();
  render(<MayaCheckout open orderId="aaaaaaaa-1111-2222-3333-444444444444" orderNumber="ORD-1042" total={125} onClose={jest.fn()} onPaymentComplete={complete}/>);
  enterCard('4111111111111111');
  expect(screen.getByRole('status')).toHaveTextContent('Authorizing payment');
  await act(async () => { jest.advanceTimersByTime(700); });
  expect(await screen.findByText('Payment complete')).toBeInTheDocument();
  expect(screen.getByText('12345678')).toBeInTheDocument();
  expect(recordPayment).toHaveBeenCalledWith(expect.objectContaining({ method: 'CARD', cardLast4: '1111', sandboxInstrument: '4111111111111111' }));
  expect(complete).toHaveBeenCalledWith(expect.objectContaining({ method: 'CARD', settled: true }));
});

test('declined demo card leaves the order unpaid and offers a retry', async () => {
  const declined = Object.assign(new Error('The demo bank declined this card.'), { code: 'CARD_DECLINED' });
  recordPayment.mockRejectedValue(declined);
  render(<MayaCheckout open orderId="aaaaaaaa-1111-2222-3333-444444444444" total={125} onClose={jest.fn()} onPaymentComplete={jest.fn()}/>);
  enterCard('4000000000000002');
  await act(async () => { jest.advanceTimersByTime(700); });
  expect(await screen.findByText(/couldn’t authorize/)).toBeInTheDocument();
  expect(screen.getByText(/still unpaid/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(screen.getByRole('heading', { name: 'Credit or debit card' })).toBeInTheDocument();
});
