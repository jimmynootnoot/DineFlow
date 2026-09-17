import { supabase } from './supabase';

export async function uploadDishImage(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('Choose a JPEG, PNG or WebP image up to 5 MB.');
  const extension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
  const path=`${crypto.randomUUID()}.${extension}`;
  const {error}=await supabase.storage.from('dish-images').upload(path,file,{contentType:file.type,upsert:false});
  if(error)throw error;
  return supabase.storage.from('dish-images').getPublicUrl(path).data.publicUrl;
}

const asList = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value !== 'string' || !value.trim()) return [];
  const text = value.trim();
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      // Fall through to comma-separated parsing for legacy rows.
    }
  }
  return text.replace(/^\{/, '').replace(/\}$/, '').split(',')
    .map((part) => part.trim().replace(/^"|"$/g, '')).filter(Boolean);
};

const fromRow = (row, categoryNames = new Map()) => ({
  id: row.id,
  name: row.name,
  description: row.description || '',
  category: row.category || categoryNames.get(row.category_id) || 'Menu',
  price: Number(row.price) || 0,
  image: row.image_url || '',
  stock: row.stock == null ? (row.is_available === false || row.is_active === false ? 0 : 30) : Number(row.stock),
  available: Boolean(row.available ?? row.is_available ?? row.is_active ?? true),
  ingredients: asList(row.ingredients),
  allergens: asList(row.allergens),
  spiceLevel: row.spice_level || 'none',
  servingSize: row.serving_size || '1 serving',
  prepMinutes: Number(row.prep_minutes ?? row.preparation_minutes) || 15,
  featured: Boolean(row.featured),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toRow = (item) => ({
  name: item.name || item.itemName || '',
  description: item.description || '',
  category: item.category?.trim() || 'Sides',
  price: Number(item.price) || 0,
  image_url: item.image || item.imageUrl || '',
  stock: Number(item.stock) || 0,
  available: item.available !== false,
  ingredients: item.ingredients || [],
  allergens: item.allergens || [],
  spice_level: item.spiceLevel || 'none',
  serving_size: item.servingSize || '1 serving',
  prep_minutes: Number(item.prepMinutes) || 15,
  featured: Boolean(item.featured),
});

export async function getMenuItems() {
  const [{ data, error }, categoryResult] = await Promise.all([
    supabase.from('menu_items').select('*').order('name'),
    supabase.from('categories').select('id, name'),
  ]);
  if (error) throw error;
  const categoryNames = new Map((categoryResult.data || []).map((category) => [category.id, category.name]));
  return (data || []).map((row) => fromRow(row, categoryNames));
}

export function subscribeMenu(callback) {
  let active = true;
  const load = async () => {
    try {
      const items = await getMenuItems();
      if (active) callback(items);
    } catch (error) {
      console.error('[menuService] Supabase read failed:', error.message);
      if (active) callback([]);
    }
  };
  void load();
  const channel = supabase.channel('menu-items-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, load)
    .subscribe();
  return () => { active = false; void supabase.removeChannel(channel); };
}

export async function addMenuItem(item) {
  const { data, error } = await supabase.from('menu_items').insert(toRow(item)).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function updateMenuItem(id, data) {
  const { error } = await supabase.from('menu_items').update(toRow(data)).eq('id', id);
  if (error) throw error;
}

export async function updateMenuItemAvailability(id, available) {
  const { error } = await supabase.from('menu_items').update({ available }).eq('id', id);
  if (error) throw error;
}

export async function deleteMenuItem(id) {
  const { error } = await supabase.from('menu_items').delete().eq('id', id);
  if (error) throw error;
}
