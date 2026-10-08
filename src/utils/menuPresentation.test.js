import { getMenuImage, getMenuImageFallback } from './menuPresentation';

test('uses a dish-specific image for signature Filipino dishes', () => {
  expect(getMenuImage({ name: 'Chicken Inasal (Paa)', image: 'https://example.com/wrong.jpg' }))
    .toBe('/menu/chicken-inasal.png');
  expect(getMenuImage({ name: 'Pork Sisig', image: 'https://example.com/wrong.jpg' }))
    .toBe('/menu/pork-sisig.png');
  expect(getMenuImage({ name: 'Halo-Halo', image: 'https://example.com/wrong.jpg' }))
    .toBe('/menu/halo-halo.png');
});

test('keeps a supplied image for dishes without a curated replacement', () => {
  expect(getMenuImage({ name: 'Barako Coffee', category: 'Beverages', image: '/coffee.jpg' }))
    .toBe('/coffee.jpg');
});

test('falls back to a category-appropriate local image', () => {
  expect(getMenuImageFallback({ name: 'Catch of the Day', category: 'Seafood' }))
    .toBe('/menu/grilled-bangus.png');
  expect(getMenuImage({ name: 'House Dessert', category: 'Desserts' }))
    .toBe('/menu/halo-halo.png');
});
