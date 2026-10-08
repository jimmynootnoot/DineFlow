import { getMenuImage, getMenuImageFallback } from './menuPresentation';

test('uses a dish-specific image for signature Filipino dishes', () => {
  expect(getMenuImage({ name: 'Chicken Inasal (Paa)', image: 'https://example.com/wrong.jpg' }))
    .toBe('/menu/chicken-inasal.png');
  expect(getMenuImage({ name: 'Pork Sisig', image: 'https://example.com/wrong.jpg' }))
    .toBe('/menu/pork-sisig.png');
  expect(getMenuImage({ name: 'Halo-Halo', image: 'https://example.com/wrong.jpg' }))
    .toBe('/menu/halo-halo.png');
  expect(getMenuImage({ name: 'Bangsilog', image: 'https://example.com/wrong.jpg' }))
    .toBe('/menu/bangsilog.png');
  expect(getMenuImage({ name: 'Chicken Sisig', image: 'https://example.com/wrong.jpg' }))
    .toBe('/menu/chicken-sisig.png');
});

test('uses exact replacements for the expanded Filipino catalog', () => {
  expect(getMenuImage({ name: 'Barako Coffee', category: 'Beverages', image: '/coffee.jpg' }))
    .toBe('/menu/barako-coffee.png');
  expect(getMenuImage({ name: 'Leche Flan', category: 'Desserts', image: '/dessert.jpg' }))
    .toBe('/menu/leche-flan.png');
  expect(getMenuImage({ name: 'Pancit Bihon', category: 'Noodles', image: '/noodles.jpg' }))
    .toBe('/menu/pancit-bihon.png');
});

test('keeps a supplied image only when no curated dish replacement exists', () => {
  expect(getMenuImage({ name: 'Seasonal Special', category: 'Rice Meals', image: '/special.jpg' }))
    .toBe('/special.jpg');
});

test('falls back to a category-appropriate local image', () => {
  expect(getMenuImageFallback({ name: 'Catch of the Day', category: 'Seafood' }))
    .toBe('/menu/grilled-bangus.png');
  expect(getMenuImage({ name: 'House Dessert', category: 'Desserts' }))
    .toBe('/menu/halo-halo.png');
});
