import { supabase } from './supabase';

/**
 * The canonical 25-item seed lives in supabase/dineflow-setup.sql so its
 * descriptions, dietary metadata, recommendation rules, and photos are
 * installed atomically with the schema.
 */
export async function seedMenuItems() {
  const { count, error } = await supabase.from('menu_items').select('id', { count: 'exact', head: true });
  if (error) throw new Error(`${error.message}. Run supabase/dineflow-setup.sql in the Supabase SQL Editor.`);
  if (!count) throw new Error('The menu is empty. Run supabase/dineflow-setup.sql in the Supabase SQL Editor to install the photo menu.');
  return { seeded: false, count, message: `Menu is ready with ${count} items.` };
}

/** Restore service after a sell-out without deleting order history. */
export async function resetAndReseed() {
  const { data, error } = await supabase
    .from('menu_items')
    .update({ available: true, stock: 30 })
    .not('id', 'is', null)
    .select('id');
  if (error) throw error;
  return { seeded: false, count: data?.length || 0, message: `Restored availability for ${data?.length || 0} menu items.` };
}
