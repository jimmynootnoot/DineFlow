const DISH_IMAGE_RULES = [
  [/adobo/i, '/menu/chicken-adobo.png'],
  [/chicken inasal|inasal \(paa\)|inasal \(pecho\)/i, '/menu/chicken-inasal.png'],
  [/sisig/i, '/menu/pork-sisig.png'],
  [/pancit canton/i, '/menu/pancit-canton.png'],
  [/lumpiang shanghai|turon/i, '/menu/lumpiang-shanghai.png'],
  [/halo-halo/i, '/menu/halo-halo.png'],
  [/grilled bangus|bangsilog/i, '/menu/grilled-bangus.png'],
  [/calamansi juice/i, '/menu/calamansi-juice.png'],
];

const CATEGORY_FALLBACKS = {
  chicken: '/menu/chicken-inasal.png',
  pork: '/menu/pork-sisig.png',
  beef: '/menu/chicken-adobo.png',
  seafood: '/menu/grilled-bangus.png',
  noodles: '/menu/pancit-canton.png',
  appetizers: '/menu/lumpiang-shanghai.png',
  sides: '/menu/lumpiang-shanghai.png',
  desserts: '/menu/halo-halo.png',
  beverages: '/menu/calamansi-juice.png',
  bowls: '/menu/chicken-adobo.png',
  'rice meals': '/menu/chicken-adobo.png',
};

const matchingDishImage = (name = '') => DISH_IMAGE_RULES.find(([pattern]) => pattern.test(name))?.[1];

export const getMenuImageFallback = (item = {}) => (
  matchingDishImage(item.name)
  || CATEGORY_FALLBACKS[String(item.category || '').toLowerCase()]
  || '/menu/chicken-adobo.png'
);

export const getMenuImage = (item = {}) => matchingDishImage(item.name) || item.image || getMenuImageFallback(item);
