import { supabase } from './supabase';

const mapRow = (row) => ({
  id: row.id, customerId: row.customer_id, orderId: row.order_id,
  requestType: row.request_type, message: row.message, status: row.status,
  resolution: row.resolution || '', createdAt: row.created_at, updatedAt: row.updated_at,
});

export async function createEscalation({ customerId, orderId, sessionId, requestType, message }) {
  const { data, error } = await supabase.from('staff_escalations').insert({
    customer_id: customerId, order_id: orderId || null,
    request_type: requestType, message,
    chat_session_id: sessionId || null,
  }).select('*').single();
  if (error) throw error;
  return mapRow(data);
}

export async function getEscalations() {
  const { data, error } = await supabase.from('staff_escalations').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapRow);
}

export async function updateEscalation(id, status, resolution = '') {
  const { error } = await supabase.from('staff_escalations').update({ status, resolution }).eq('id', id);
  if (error) throw error;
}
