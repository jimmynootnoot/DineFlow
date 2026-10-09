import { matchesOrderSearch } from './orderSearch';

const order = {
  id: '11111111-2222-3333-4444-555555555555',
  orderNumber: 'DF-2048', customerName: 'María Santos',
  orderType: 'dine-in', tableNumber: 'T-03', status: 'preparing',
  paymentStatus: 'paid', paymentMethod: 'Maya',
  notes: 'Birthday table',
  items: [{ name: 'Pork Sisig', remarks: 'No onion' }, { name: 'Calamansi Juice' }],
};

test.each([
  'df-2048', 'maría', 'SANTOS', 'table t-03', 'sisig', 'calamansi',
  'birthday', 'no onion', 'maya', 'preparing', 'santos sisig',
])('finds orders by %s', (query) => {
  expect(matchesOrderSearch(order, query)).toBe(true);
});

test('empty search includes all orders and unrelated terms do not match', () => {
  expect(matchesOrderSearch(order, '  ')).toBe(true);
  expect(matchesOrderSearch(order, 'Bangsilog')).toBe(false);
  expect(matchesOrderSearch(order, 'Santos Bangsilog')).toBe(false);
});
