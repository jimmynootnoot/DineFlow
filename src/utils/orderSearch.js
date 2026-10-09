const searchableText = (value) => String(value ?? '').trim().toLowerCase();

export function matchesOrderSearch(order, query) {
  const terms = searchableText(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;

  const fields = [
    order.id, order.orderNumber, order.customerName,
    order.tableNumber, order.tableNumber ? `table ${order.tableNumber}` : '',
    order.orderType, order.status, order.paymentStatus, order.paymentMethod,
    order.notes,
    ...(order.items || []).flatMap((item) => [item.name || item.itemName, item.remarks]),
  ].map(searchableText);

  return terms.every((term) => fields.some((field) => field.includes(term)));
}
