import { authenticate, endpoint, httpError, readAll } from '../serverlib/platform.mjs';
import { rankRecommendations } from '../serverlib/recommendations.mjs';

export default endpoint(async request => {
  const { db } = await authenticate(request);
  const ids = request.body?.cartIds;
  if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id))) throw httpError(400, 'Invalid cart.');
  if (!ids.length) return { suggestions: [] };
  const [menu, rules] = await Promise.all([
    readAll(() => db.from('menu_items').select('id,name,price,category,available,stock').order('id')),
    readAll(() => db.from('recommendation_rules').select('*').not('run_id','is',null).gt('lift',1).order('id')),
  ]);
  let suggestions = rankRecommendations(ids, menu, rules, []);
  if (!suggestions.length) {
    const orders = await readAll(() => db.from('orders').select('id,order_items(menu_item_id,quantity)').eq('status','completed').eq('payment_status','paid').gte('created_at',new Date(Date.now()-30*86400000).toISOString()).order('id'));
    const quantities = new Map();
    orders.forEach(order => order.order_items.forEach(item => quantities.set(item.menu_item_id,(quantities.get(item.menu_item_id)||0)+item.quantity)));
    suggestions = rankRecommendations(ids, menu, rules, [...quantities].map(([id,quantity]) => ({ id, quantity })));
  }
  return { suggestions };
});
