export const MENU_SORT_OPTIONS = [
  { value: 'default', label: 'Menu order' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'name-asc', label: 'Name: A to Z' },
  { value: 'name-desc', label: 'Name: Z to A' },
];

export function sortMenuItems(items, sortBy) {
  if (sortBy === 'default') return items;

  const sorted = [...items];
  if (sortBy === 'price-asc' || sortBy === 'price-desc') {
    const direction = sortBy === 'price-asc' ? 1 : -1;
    return sorted.sort((a, b) => {
      const aPrice = a.price == null || a.price === '' ? NaN : Number(a.price);
      const bPrice = b.price == null || b.price === '' ? NaN : Number(b.price);
      if (!Number.isFinite(aPrice)) return Number.isFinite(bPrice) ? 1 : 0;
      if (!Number.isFinite(bPrice)) return -1;
      return direction * (aPrice - bPrice);
    });
  }
  if (sortBy === 'name-asc' || sortBy === 'name-desc') {
    const direction = sortBy === 'name-asc' ? 1 : -1;
    return sorted.sort((a, b) => direction * String(a.name || '').localeCompare(String(b.name || ''), 'en'));
  }
  return items;
}
