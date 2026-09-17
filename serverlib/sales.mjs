export function periodBounds(start, end) {
  const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value;
  if (!valid(start) || !valid(end) || start > end) throw new Error('Choose a valid start and end date.');
  const from = new Date(`${start}T00:00:00+08:00`);
  const to = new Date(new Date(`${end}T00:00:00+08:00`).getTime()+86400000);
  const days = (to-from)/86400000;
  if (days > 366) throw new Error('Select at most 366 days.');
  return { from:from.toISOString(),to:to.toISOString(),previousFrom:new Date(from.getTime()-(to-from)).toISOString(),days };
}
export function aggregateSales(orders, bounds) {
  const inRange = (order,from,to) => new Date(order.created_at).getTime() >= new Date(from).getTime() && new Date(order.created_at).getTime() < new Date(to).getTime();
  const current = orders.filter(o => inRange(o,bounds.from,bounds.to));
  const paid = current.filter(o => o.status === 'completed' && o.payment_status === 'paid');
  const prior = orders.filter(o => inRange(o,bounds.previousFrom,bounds.from) && o.status === 'completed' && o.payment_status === 'paid');
  const cents = n => Math.round(Number(n)*100);
  const revenue = paid.reduce((n,o) => n+cents(o.total_amount),0);
  const priorRevenue = prior.reduce((n,o) => n+cents(o.total_amount),0);
  const items = new Map();
  for (const order of paid) for (const item of order.order_items || []) {
    const key = item.menu_item_id || item.name;
    const row = items.get(key) || { id:key,name:item.name,quantity:0,grossCents:0 };
    row.quantity += item.quantity; row.grossCents += cents(item.price)*item.quantity; items.set(key,row);
  }
  return { totalOrders:current.length,completedOrders:paid.length,cancelledOrders:current.filter(o=>o.status==='cancelled').length,
    revenue:revenue/100,previousRevenue:priorRevenue/100,averageOrderValue:paid.length ? Math.round(revenue/paid.length)/100 : 0,
    changePercent:priorRevenue ? (revenue-priorRevenue)/priorRevenue*100 : null,
    discounts:paid.reduce((n,o)=>n+cents(o.discount_amount||0)+cents(o.vat_exemption||0),0)/100,
    items:[...items.values()].sort((a,b)=>b.quantity-a.quantity).map(({grossCents,...row})=>({...row,grossRevenue:grossCents/100})) };
}
export function salesSummary(aggregates) {
  const a = aggregates;
  return `${a.totalOrders} orders were recorded in this period. ${a.completedOrders} completed, paid orders generated PHP ${a.revenue.toFixed(2)}, with an average of PHP ${a.averageOrderValue.toFixed(2)}. ${a.changePercent == null ? 'There is no prior-period revenue baseline.' : `Revenue changed by ${a.changePercent.toFixed(1)}% against the previous equal-length period.`}${a.items[0] ? ` ${a.items[0].name} led with ${a.items[0].quantity} sold.` : ''}`;
}
