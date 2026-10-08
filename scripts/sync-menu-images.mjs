import { createClient } from '@supabase/supabase-js';

const IMAGE_BY_DISH = new Map([
  ['Adobo Rice Bowl', '/menu/chicken-adobo.png'],
  ['Bangsilog', '/menu/bangsilog.png'],
  ['Barako Coffee', '/menu/barako-coffee.png'],
  ['Batchoy', '/menu/batchoy.png'],
  ['Beef Tapa Bowl', '/menu/beef-tapa-bowl.png'],
  ['Bibingka', '/menu/bibingka.png'],
  ['Bicol Express Bowl', '/menu/bicol-express-bowl.png'],
  ['Bottled Water', '/menu/bottled-water.png'],
  ['Calamansi Juice', '/menu/calamansi-juice.png'],
  ['Calamares', '/menu/calamares.png'],
  ['Chicharon Bulaklak', '/menu/chicharon-bulaklak.png'],
  ['Chicken Inasal (Paa)', '/menu/chicken-inasal.png'],
  ['Chicken Inasal (Pecho)', '/menu/chicken-inasal.png'],
  ['Chicken Sisig', '/menu/chicken-sisig.png'],
  ['Chicksilog', '/menu/chicksilog.png'],
  ['Ensaladang Talong', '/menu/ensaladang-talong.png'],
  ['Garlic Rice', '/menu/garlic-rice.png'],
  ['Grilled Bangus', '/menu/grilled-bangus.png'],
  ['Halo-Halo', '/menu/halo-halo.png'],
  ['Inihaw na Liempo', '/menu/inihaw-na-liempo.png'],
  ['Inihaw na Pusit', '/menu/inihaw-na-pusit.png'],
  ['Kinilaw na Tanigue', '/menu/kinilaw-na-tanigue.png'],
  ['Leche Flan', '/menu/leche-flan.png'],
  ['Lechon Kawali Bowl', '/menu/lechon-kawali-bowl.png'],
  ['Lomi', '/menu/lomi.png'],
  ['Longsilog', '/menu/longsilog.png'],
  ['Lumpiang Shanghai', '/menu/lumpiang-shanghai.png'],
  ['Mango Shake', '/menu/mango-shake.png'],
  ['Pancit Bam-i', '/menu/pancit-bam-i.png'],
  ['Pancit Bihon', '/menu/pancit-bihon.png'],
  ['Pancit Canton', '/menu/pancit-canton.png'],
  ['Plain Rice', '/menu/plain-rice.png'],
  ['Pork BBQ Skewer', '/menu/pork-bbq-skewer.png'],
  ['Pork Sisig', '/menu/pork-sisig.png'],
  ["Sago't Gulaman", '/menu/sago-gulaman.png'],
  ['Sisig Rice Bowl', '/menu/sisig-rice-bowl.png'],
  ['Sizzling Bulalo', '/menu/sizzling-bulalo.png'],
  ['Sizzling Gambas', '/menu/sizzling-gambas.png'],
  ['Sizzling Tofu', '/menu/sizzling-tofu.png'],
  ['Softdrinks in Can', '/menu/softdrinks-in-can.png'],
  ['Sotanghon Guisado', '/menu/sotanghon-guisado.png'],
  ['Spamsilog', '/menu/spamsilog.png'],
  ['Tapsilog', '/menu/tapsilog.png'],
  ['Tocilog', '/menu/tocilog.png'],
  ['Turon', '/menu/turon.png'],
]);

const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const shouldApply = process.argv.includes('--apply');

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: menu, error: readError } = await supabase
  .from('menu_items')
  .select('id, name, image_url')
  .order('name');

if (readError) throw readError;

const changes = (menu || [])
  .filter((item) => IMAGE_BY_DISH.has(item.name))
  .map((item) => ({
    ...item,
    nextImageUrl: IMAGE_BY_DISH.get(item.name),
  }));

console.log(`${shouldApply ? 'Applying' : 'Previewing'} ${changes.length} menu image updates:`);
for (const item of changes) {
  console.log(`- ${item.name}: ${item.image_url || '(none)'} -> ${item.nextImageUrl}`);
}

if (!shouldApply) {
  console.log('No changes written. Run again with --apply to update Supabase.');
  process.exit(0);
}

for (const item of changes) {
  const { data, error } = await supabase
    .from('menu_items')
    .update({ image_url: item.nextImageUrl })
    .eq('id', item.id)
    .select('id, name, image_url')
    .single();

  if (error) throw new Error(`Failed to update ${item.name}: ${error.message}`);
  if (data.image_url !== item.nextImageUrl) throw new Error(`Verification failed for ${item.name}.`);
}

console.log(`Updated and verified ${changes.length} Supabase menu records.`);
