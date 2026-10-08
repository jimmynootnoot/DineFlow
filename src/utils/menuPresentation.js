const DISH_IMAGES = new Map([
  ['adobo rice bowl', '/menu/chicken-adobo.png'],
  ['bangsilog', '/menu/bangsilog.png'],
  ['barako coffee', '/menu/barako-coffee.png'],
  ['batchoy', '/menu/batchoy.png'],
  ['beef tapa bowl', '/menu/beef-tapa-bowl.png'],
  ['bibingka', '/menu/bibingka.png'],
  ['bicol express bowl', '/menu/bicol-express-bowl.png'],
  ['bottled water', '/menu/bottled-water.png'],
  ['calamansi juice', '/menu/calamansi-juice.png'],
  ['calamares', '/menu/calamares.png'],
  ['chicharon bulaklak', '/menu/chicharon-bulaklak.png'],
  ['chicken inasal', '/menu/chicken-inasal.png'],
  ['chicken inasal (paa)', '/menu/chicken-inasal.png'],
  ['chicken inasal (pecho)', '/menu/chicken-inasal.png'],
  ['chicken sisig', '/menu/chicken-sisig.png'],
  ['chicksilog', '/menu/chicksilog.png'],
  ['ensaladang talong', '/menu/ensaladang-talong.png'],
  ['garlic rice', '/menu/garlic-rice.png'],
  ['grilled bangus', '/menu/grilled-bangus.png'],
  ['halo-halo', '/menu/halo-halo.png'],
  ['inihaw na liempo', '/menu/inihaw-na-liempo.png'],
  ['inihaw na pusit', '/menu/inihaw-na-pusit.png'],
  ['kinilaw na tanigue', '/menu/kinilaw-na-tanigue.png'],
  ['leche flan', '/menu/leche-flan.png'],
  ['lechon kawali bowl', '/menu/lechon-kawali-bowl.png'],
  ['lomi', '/menu/lomi.png'],
  ['longsilog', '/menu/longsilog.png'],
  ['lumpiang shanghai', '/menu/lumpiang-shanghai.png'],
  ['mango shake', '/menu/mango-shake.png'],
  ['pancit bam-i', '/menu/pancit-bam-i.png'],
  ['pancit bihon', '/menu/pancit-bihon.png'],
  ['pancit canton', '/menu/pancit-canton.png'],
  ['plain rice', '/menu/plain-rice.png'],
  ['pork bbq skewer', '/menu/pork-bbq-skewer.png'],
  ['pork sisig', '/menu/pork-sisig.png'],
  ["sago't gulaman", '/menu/sago-gulaman.png'],
  ['sisig rice bowl', '/menu/sisig-rice-bowl.png'],
  ['sizzling bulalo', '/menu/sizzling-bulalo.png'],
  ['sizzling gambas', '/menu/sizzling-gambas.png'],
  ['sizzling tofu', '/menu/sizzling-tofu.png'],
  ['softdrinks in can', '/menu/softdrinks-in-can.png'],
  ['sotanghon guisado', '/menu/sotanghon-guisado.png'],
  ['spamsilog', '/menu/spamsilog.png'],
  ['tapsilog', '/menu/tapsilog.png'],
  ['tocilog', '/menu/tocilog.png'],
  ['turon', '/menu/turon.png'],
]);

const CATEGORY_FALLBACKS = {
  chicken: '/menu/chicken-inasal.png',
  pork: '/menu/pork-sisig.png',
  beef: '/menu/beef-tapa-bowl.png',
  seafood: '/menu/grilled-bangus.png',
  noodles: '/menu/pancit-canton.png',
  appetizers: '/menu/lumpiang-shanghai.png',
  sides: '/menu/garlic-rice.png',
  desserts: '/menu/halo-halo.png',
  beverages: '/menu/calamansi-juice.png',
  bowls: '/menu/chicken-adobo.png',
  'rice meals': '/menu/chicken-adobo.png',
};

const matchingDishImage = (name = '') => DISH_IMAGES.get(String(name).trim().toLowerCase());

export const getMenuImageFallback = (item = {}) => (
  matchingDishImage(item.name)
  || CATEGORY_FALLBACKS[String(item.category || '').toLowerCase()]
  || '/menu/chicken-adobo.png'
);

export const getMenuImage = (item = {}) => matchingDishImage(item.name) || item.image || getMenuImageFallback(item);
