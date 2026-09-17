import { supabase } from './supabase';

const mapItem = (row) => ({
  id: row.id, menuItemId: row.menu_item_id, name: row.name,
  price: Number(row.price) || 0, quantity: Number(row.quantity) || 1,
  remarks: row.remarks || '', image: row.image_url || '',
});

const mapOrder = (row) => ({
  id: row.id, orderNumber: row.order_number, customerId: row.customer_id,
  customerName: row.customer_name, orderType: row.order_type, tableNumber: row.table_number,
  notes: row.notes || '', status: row.status, subtotal: Number(row.subtotal) || 0,
  serviceFee: Number(row.service_fee) || 0, totalAmount: Number(row.total_amount) || 0,
  paymentMethod: row.payment_method, paymentStatus: row.payment_status,
  cashierId: row.cashier_id, createdAt: row.created_at, updatedAt: row.updated_at,
  tableId: row.table_id, discountType: row.discount_type, discountAmount: Number(row.discount_amount || 0),
  discountEligibleAmount: Number(row.discount_eligible_amount || 0), vatExemption: Number(row.vat_exemption || 0),
  payments: (row.payments || []).map(payment => ({id:payment.id,method:payment.method,amount:Number(payment.amount),amountTendered:Number(payment.amount_tendered),changeDue:Number(payment.change_due),status:payment.status})),
  items: (row.order_items || []).map(mapItem),
});

export async function placeOrder(orderData) {
  const items = (orderData.items || []).map((item) => ({
    id: item.id || item.menuItemId,
    quantity: Number(item.quantity) || 1,
    remarks: item.remarks || '',
  }));
  const { data, error } = await supabase.rpc('place_order', {
    p_customer_name: orderData.customerName || 'Walk-in',
    p_order_type: orderData.orderType || 'takeout',
    p_table_number: orderData.tableNumber || null,
    p_notes: orderData.notes || '',
    p_payment_method: orderData.paymentMethod || 'cash',
    p_items: items,
    p_table_session_token: orderData.tableSessionToken || null,
  });
  if (error) throw error;
  return data;
}

export async function getAllOrders() {
  const rows = [];
  for (let offset = 0; ; ) {
    const { data, error } = await supabase.from('orders').select('*, order_items(*), payments(*)').order('created_at', { ascending: false }).order('id').range(offset, offset + 499);
    if (error) throw error;
    if (!data.length) return rows.map(mapOrder);
    rows.push(...data); offset += data.length;
  }
}

export function subscribeOrders(callback) {
  let active = true;
  let timer;
  const load = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try { const rows=await getAllOrders(); if (active) callback(rows); }
      catch (error) { console.error('[orderService] Supabase read failed:', error.message); if (active) callback([]); }
    }, 80);
  };
  load();
  const channel = supabase.channel('orders-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, load)
    .subscribe();
  return () => { active = false; clearTimeout(timer); void supabase.removeChannel(channel); };
}

export async function getOrdersByCustomer(customerId) { return (await getAllOrders()).filter((order) => order.customerId === customerId); }
export async function getOrdersByStatus(status) { return (await getAllOrders()).filter((order) => order.status === status); }
export async function getTodaysOrders() {
  const today = new Date().toDateString();
  return (await getAllOrders()).filter((order) => new Date(order.createdAt).toDateString() === today);
}
export async function updateOrderStatus(id, status) {
  const { error } = await supabase.rpc('update_order_status', { p_order_id: id, p_status: status });
  if (error) throw error;
}
