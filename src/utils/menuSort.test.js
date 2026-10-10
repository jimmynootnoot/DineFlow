import { sortMenuItems } from './menuSort';

const menu = [
  { id: 'sisig', name: 'Sisig', price: 200 },
  { id: 'adobo', name: 'Adobo', price: '95.00' },
  { id: 'batchoy', name: 'Batchoy', price: 120 },
];

const ids = (items) => items.map(item => item.id);

test('preserves menu order and does not mutate the source', () => {
  expect(sortMenuItems(menu, 'default')).toBe(menu);
  expect(ids(sortMenuItems(menu, 'price-asc'))).toEqual(['adobo', 'batchoy', 'sisig']);
  expect(ids(menu)).toEqual(['sisig', 'adobo', 'batchoy']);
});

test('sorts prices in both directions, including numeric strings', () => {
  expect(ids(sortMenuItems(menu, 'price-desc'))).toEqual(['sisig', 'batchoy', 'adobo']);
});

test('sorts names in both directions', () => {
  expect(ids(sortMenuItems(menu, 'name-asc'))).toEqual(['adobo', 'batchoy', 'sisig']);
  expect(ids(sortMenuItems(menu, 'name-desc'))).toEqual(['sisig', 'batchoy', 'adobo']);
});

test('keeps items with invalid prices at the end', () => {
  const withMissingPrice = [...menu, { id: 'unknown', name: 'Unknown', price: 'unlisted' }, { id: 'missing', name: 'Missing', price: null }];
  expect(ids(sortMenuItems(withMissingPrice, 'price-asc'))).toEqual(['adobo', 'batchoy', 'sisig', 'unknown', 'missing']);
  expect(ids(sortMenuItems(withMissingPrice, 'price-desc'))).toEqual(['sisig', 'batchoy', 'adobo', 'unknown', 'missing']);
});
