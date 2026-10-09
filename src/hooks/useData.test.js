import { act, renderHook } from '@testing-library/react';
import { useMenu, useOrders } from './useData';
import { subscribeMenu } from '../services/menuService';
import { subscribeOrders } from '../services/orderService';

jest.mock('../services/menuService', () => ({ subscribeMenu: jest.fn(), getMenuItems: jest.fn() }));
jest.mock('../services/orderService', () => ({ subscribeOrders: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
});

test('order status refresh updates the screen without a realtime event', async () => {
  const refresh = jest.fn();
  subscribeOrders.mockImplementation((publish) => {
    publish([{ id: 'order-1', status: 'confirmed' }]);
    refresh.mockImplementation(async () => {
      const latest = [{ id: 'order-1', status: 'preparing' }];
      publish(latest);
      return latest;
    });
    return { refresh, unsubscribe: jest.fn() };
  });

  const { result } = renderHook(() => useOrders('staff-1'));
  expect(result.current.orders[0].status).toBe('confirmed');
  await act(async () => { await result.current.refresh(); });
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(result.current.orders[0].status).toBe('preparing');
});

test('menu availability refresh updates the screen without a realtime event', async () => {
  const refresh = jest.fn();
  subscribeMenu.mockImplementation((publish) => {
    publish([{ id: 'dish-1', available: true }]);
    refresh.mockImplementation(async () => {
      const latest = [{ id: 'dish-1', available: false }];
      publish(latest);
      return latest;
    });
    return { refresh, unsubscribe: jest.fn() };
  });

  const { result } = renderHook(() => useMenu('manager-1'));
  expect(result.current.menu[0].available).toBe(true);
  await act(async () => { await result.current.refresh(); });
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(result.current.menu[0].available).toBe(false);
});
