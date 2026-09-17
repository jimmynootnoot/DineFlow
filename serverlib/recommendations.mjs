export function rankRecommendations(cartIds, menu, rules, sales, limit = 3) {
  const selected = new Set(cartIds);
  const byId = new Map(menu.map(item => [item.id, item]));
  const available = id => byId.has(id) && byId.get(id).available && byId.get(id).stock > 0 && !selected.has(id);
  const seen = new Set();
  const suggestions = [];
  for (const rule of [...rules].sort((a, b) => b.lift - a.lift || b.confidence - a.confidence || b.support - a.support)) {
    if (!rule.run_id || rule.lift <= 1 || !rule.antecedent_ids?.length || !rule.consequent_ids?.length) continue;
    if (!rule.antecedent_ids.every(id => selected.has(id))) continue;
    const missing = rule.consequent_ids.filter(id => !selected.has(id));
    if (!missing.length || !missing.every(available)) continue;
    const items = missing.map(id => byId.get(id));
    const key = [...missing].sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push({ id: rule.id, items, reason: `Paired with ${rule.antecedent_ids.map(id => byId.get(id)?.name || 'selected dish').join(' + ')}`,
      source: rule.source, support: Number(rule.support), confidence: Number(rule.confidence), lift: Number(rule.lift), runId: rule.run_id });
    if (suggestions.length === limit) break;
  }
  if (suggestions.length) return suggestions;
  // UC-01 alternative 4a: actual top sellers in the cart's categories.
  const categories = new Set(cartIds.map(id => byId.get(id)?.category).filter(Boolean));
  return sales.filter(row => available(row.id) && categories.has(byId.get(row.id).category) && row.quantity > 0)
    .sort((a, b) => b.quantity - a.quantity || a.id.localeCompare(b.id)).slice(0, limit)
    .map(row => ({ id: row.id, items: [byId.get(row.id)], reason: `Top seller in ${byId.get(row.id).category}`, source: 'bestseller' }));
}
