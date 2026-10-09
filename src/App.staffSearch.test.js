import { fireEvent, render, screen, within } from '@testing-library/react';
import App from './App';
import { subscribeMenu } from './services/menuService';
import { subscribeOrders } from './services/orderService';

let mockRole = 'Staff';
jest.mock('./hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'crew-1', role: mockRole, name: 'Crew' } }),
}));
jest.mock('./services/menuService', () => ({ subscribeMenu: jest.fn(), getMenuItems: jest.fn() }));
jest.mock('./services/orderService', () => ({ subscribeOrders: jest.fn(), updateOrderStatus: jest.fn() }));
jest.mock('./components/panels/DashboardPerformance', () => () => null);
jest.mock('./components/assistant/AssistantPanel', () => () => null);

const orders = [
  {
    id: 'order-1', orderNumber: 'DF-101', customerName: 'Maria Santos',
    orderType: 'dine-in', tableNumber: '4', status: 'confirmed',
    paymentStatus: 'paid', totalAmount: 125,
    items: [{ name: 'Bangsilog', quantity: 1 }], notes: 'No onions',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'order-2', orderNumber: 'DF-202', customerName: 'Jose Reyes',
    orderType: 'takeout', status: 'preparing', paymentStatus: 'unpaid',
    totalAmount: 95, items: [{ name: 'Adobo Rice Bowl', quantity: 1 }],
    createdAt: new Date().toISOString(),
  },
];

beforeEach(() => {
  mockRole = 'Staff';
  subscribeMenu.mockImplementation((publish) => {
    publish([]);
    return { refresh: jest.fn(), unsubscribe: jest.fn() };
  });
  subscribeOrders.mockImplementation((publish) => {
    publish(orders);
    return { refresh: jest.fn(), unsubscribe: jest.fn() };
  });
});

test('staff can find an order by customer, dish, and table and clear the search', async () => {
  render(<App />);
  const search = await screen.findByRole('searchbox', { name: 'Search orders' });
  const table = screen.getByRole('table');

  fireEvent.change(search, { target: { value: 'Maria bangsilog' } });
  expect(within(table).getByText('DF-101')).toBeInTheDocument();
  expect(within(table).queryByText('DF-202')).not.toBeInTheDocument();

  fireEvent.change(search, { target: { value: 'table 4' } });
  expect(within(table).getByText('DF-101')).toBeInTheDocument();
  expect(within(table).queryByText('DF-202')).not.toBeInTheDocument();

  fireEvent.change(search, { target: { value: 'missing' } });
  expect(screen.getByText(/No orders match your search/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
  expect(within(table).getByText('DF-101')).toBeInTheDocument();
  expect(within(table).getByText('DF-202')).toBeInTheDocument();
});

test('kitchen crew can search active tickets by order number and notes', async () => {
  mockRole = 'Kitchen';
  render(<App />);
  const search = await screen.findByRole('searchbox', { name: 'Search kitchen tickets' });

  fireEvent.change(search, { target: { value: 'DF-202' } });
  expect(screen.getByText('Jose Reyes')).toBeInTheDocument();
  expect(screen.queryByText('Maria Santos')).not.toBeInTheDocument();

  fireEvent.change(search, { target: { value: 'no onions' } });
  expect(screen.getByText('Maria Santos')).toBeInTheDocument();
  expect(screen.queryByText('Jose Reyes')).not.toBeInTheDocument();
});
