import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';
import { subscribeMenu } from './services/menuService';
import { subscribeOrders, updateOrderStatus } from './services/orderService';

jest.mock('./hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'cook-1', role: 'Kitchen', name: 'Cook' } }),
}));
jest.mock('./services/menuService', () => ({ subscribeMenu: jest.fn(), getMenuItems: jest.fn() }));
jest.mock('./services/orderService', () => ({ subscribeOrders: jest.fn(), updateOrderStatus: jest.fn() }));
jest.mock('./components/panels/DashboardPerformance', () => () => null);

test('kitchen status advances on screen after saving, without a realtime event', async () => {
  const order = {
    id: 'order-1', orderNumber: 'DF-001', customerName: 'Guest',
    orderType: 'takeout', status: 'confirmed', paymentStatus: 'unpaid', items: [],
    createdAt: new Date().toISOString(),
  };
  subscribeMenu.mockImplementation((publish) => {
    publish([]);
    return { refresh: jest.fn(), unsubscribe: jest.fn() };
  });
  const refresh = jest.fn();
  subscribeOrders.mockImplementation((publish) => {
    publish([order]);
    refresh.mockImplementation(async () => {
      publish([{ ...order, status: 'preparing' }]);
    });
    return { refresh, unsubscribe: jest.fn() };
  });
  updateOrderStatus.mockResolvedValue();

  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: /Start Preparing/i }));

  expect(await screen.findByRole('button', { name: /Mark Ready/i })).toBeInTheDocument();
  expect(updateOrderStatus).toHaveBeenCalledWith('order-1', 'preparing');
  expect(refresh).toHaveBeenCalledTimes(1);
});
