import { supabase } from './supabase';
import { getAllOrders } from './orderService';
import { csvCell } from './platformService';

export async function getDailySales(date = new Date()) {
  const day = new Date(date).toDateString();
  const orders = (await getAllOrders()).filter((order) => new Date(order.createdAt).toDateString() === day);
  const completed = orders.filter((order) => order.status === 'completed' && order.paymentStatus === 'paid');
  const cancelled = orders.filter((order) => order.status === 'cancelled');
  const totalRevenue = completed.reduce((sum, order) => sum + order.totalAmount, 0);
  return { totalOrders: orders.length, completedOrders: completed.length, cancelledOrders: cancelled.length,
    totalRevenue, averageOrderValue: completed.length ? totalRevenue / completed.length : 0, orders };
}

export async function getBestSellers(limit = 5) {
  const cutoff = Date.now() - 30 * 86400000;
  const orders = (await getAllOrders()).filter((order) => order.status === 'completed' && order.paymentStatus === 'paid' && new Date(order.createdAt).getTime() >= cutoff);
  const totals = {};
  orders.forEach((order) => order.items.forEach((item) => {
    const key = item.name || item.menuItemId;
    if (!totals[key]) totals[key] = { name: key, image: item.image || '', quantity: 0, revenue: 0 };
    totals[key].quantity += item.quantity;
    totals[key].revenue += item.price * item.quantity;
  }));
  return Object.values(totals).sort((a, b) => b.quantity - a.quantity).slice(0, limit);
}

export async function getStatusDistribution() {
  const distribution = { pending: 0, preparing: 0, ready: 0, completed: 0, cancelled: 0 };
  (await getAllOrders()).forEach((order) => { if (order.status in distribution) distribution[order.status] += 1; });
  return distribution;
}

export async function getPeriodComparison(days = 7) {
  const orders = (await getAllOrders()).filter((order) => order.status === 'completed' && order.paymentStatus === 'paid');
  const now = Date.now();
  const span = days * 86400000;
  const sumRange = (from, to) => orders.filter((order) => {
    const time = new Date(order.createdAt).getTime(); return time >= from && time < to;
  }).reduce((sum, order) => sum + order.totalAmount, 0);
  const currentRevenue = sumRange(now - span, now + 1);
  const previousRevenue = sumRange(now - span * 2, now - span);
  return { days, currentRevenue, previousRevenue,
    changePercent: previousRevenue ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : null };
}

export async function recordPayment({ orderId, method, amount, cardLast4, sandboxOtp }) {
  if (String(method).toUpperCase() !== 'CASH') {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error('Please sign in again before completing payment.');

    const response = await fetch('/api/payment', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ orderId, amount: Number(amount), cardLast4, sandboxOtp, method: String(method || 'CARD').toUpperCase() }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Payment processing failed.');
    return result;
  }

  const { data, error } = await supabase.rpc('record_order_payment', {
    p_order_id: orderId, p_method: method, p_amount: Number(amount), p_card_last4: cardLast4 || null,
  });
  if (error) throw error;
  return data;
}

export function exportOrdersCSV(orders, filename = 'dineflow-orders.csv') {
  const headers = ['Order #', 'Customer', 'Items', 'Total (PHP)', 'Payment', 'Payment status', 'Order status', 'Type', 'Table', 'Date'];
  const rows = orders.map((order) => [order.orderNumber, order.customerName,
    order.items.map((item) => `${item.name} x${item.quantity}`).join('; '), order.totalAmount,
    order.paymentMethod, order.paymentStatus, order.status, order.orderType,
    order.tableNumber || '', new Date(order.createdAt).toLocaleString('en-PH')].map(csvCell).join(','));
  const blob = new Blob([[headers.map(csvCell).join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}
