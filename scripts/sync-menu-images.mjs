import { createClient } from '@supabase/supabase-js';

const IMAGE_BY_DISH = new Map([
  ['Adobo Rice Bowl', '/menu/chicken-adobo.png'],
  ['Chicken Adobo', '/menu/chicken-adobo.png'],
  ['Chicken Inasal', '/menu/chicken-inasal.png'],
  ['Chicken Inasal (Paa)', '/menu/chicken-inasal.png'],
  ['Chicken Inasal (Pecho)', '/menu/chicken-inasal.png'],
  ['Chicken Sisig', '/menu/pork-sisig.png'],
  ['Pork Sisig', '/menu/pork-sisig.png'],
  ['Sisig Rice Bowl', '/menu/pork-sisig.png'],
  ['Pancit Canton', '/menu/pancit-canton.png'],
  ['Lumpiang Shanghai', '/menu/lumpiang-shanghai.png'],
  ['Halo-Halo', '/menu/halo-halo.png'],
  ['Grilled Bangus', '/menu/grilled-bangus.png'],
  ['Bangsilog', '/menu/grilled-bangus.png'],
  ['Calamansi Juice', '/menu/calamansi-juice.png'],
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
