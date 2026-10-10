import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';
import { subscribeMenu } from './services/menuService';
import { subscribeOrders } from './services/orderService';
import { serverRequest } from './services/platformService';

let mockRole = 'Customer';
jest.mock('./hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', role: mockRole, name: 'Tester' } }),
}));
jest.mock('./services/menuService', () => ({ subscribeMenu: jest.fn(), getMenuItems: jest.fn() }));
jest.mock('./services/orderService', () => ({ subscribeOrders: jest.fn(), updateOrderStatus: jest.fn() }));
jest.mock('./services/platformService', () => ({ serverRequest: jest.fn() }));
jest.mock('./services/supabase', () => ({ supabase: {}, supabaseConfigError: null }));
jest.mock('./components/panels/DashboardPerformance', () => () => null);
jest.mock('./components/assistant/AssistantPanel', () => () => null);

const menu = [
  { id: 'sisig', name: 'Sisig', category: 'Mains', price: 200, available: true, stock: 10 },
  { id: 'adobo', name: 'Adobo', category: 'Mains', price: 95, available: true, stock: 10 },
  { id: 'batchoy', name: 'Batchoy', category: 'Noodles', price: 120, available: true, stock: 10 },
  { id: 'bibingka', name: 'Bibingka', category: 'Desserts', price: 75, available: false, stock: 0 },
];

beforeEach(() => {
  mockRole = 'Customer';
  serverRequest.mockResolvedValue({ enabled: false });
  subscribeMenu.mockImplementation((publish) => {
    publish(menu);
    return { refresh: jest.fn(), unsubscribe: jest.fn() };
  });
  subscribeOrders.mockImplementation((publish) => {
    publish([]);
    return { refresh: jest.fn(), unsubscribe: jest.fn() };
  });
});

test('ordering menu sorts available dishes by price while preserving category filtering', async () => {
  render(<App />);
  const sort = await screen.findByRole('combobox', { name: 'Sort ordering menu' });
  const names = () => [...document.querySelectorAll('.menu-card__name h4')].map(node => node.textContent);

  fireEvent.change(sort, { target: { value: 'price-desc' } });
  expect(names()).toEqual(['Sisig', 'Batchoy', 'Adobo']);

  fireEvent.click(screen.getByRole('button', { name: 'Mains' }));
  expect(names()).toEqual(['Sisig', 'Adobo']);

  fireEvent.change(sort, { target: { value: 'price-asc' } });
  expect(names()).toEqual(['Adobo', 'Sisig']);
});

test('management menu filters availability and sorts prices', async () => {
  mockRole = 'Management';
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Menu Items' }));
  const sort = screen.getByRole('combobox', { name: 'Sort menu items' });
  const availability = screen.getByRole('combobox', { name: 'Filter menu by availability' });
  const names = () => [...document.querySelectorAll('.menu-admin-card__heading h3')].map(node => node.textContent);

  fireEvent.change(sort, { target: { value: 'price-asc' } });
  expect(names()).toEqual(['Bibingka', 'Adobo', 'Batchoy', 'Sisig']);

  fireEvent.change(availability, { target: { value: 'available' } });
  expect(names()).toEqual(['Adobo', 'Batchoy', 'Sisig']);

  fireEvent.change(availability, { target: { value: 'sold-out' } });
  expect(names()).toEqual(['Bibingka']);

  fireEvent.click(screen.getByRole('button', { name: 'Mains' }));
  expect(screen.getByText('No dishes match these filters.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(names()).toEqual(['Sisig', 'Adobo', 'Batchoy', 'Bibingka']);
});
