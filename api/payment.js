// Cash is deliberately absent: it is settled at the counter by staff,
// never authorised through this endpoint.
const ONLINE_METHODS = new Set(['CARD', 'GCASH', 'BANK', 'QR']);

const config = () => ({
  supabaseUrl: process.env.SUPABASE_URL?.replace(/\/$/, ''),
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  sandboxOtp: process.env.MAYA_SANDBOX_OTP || '123456',
});

async function authenticate(request) {
  const { supabaseUrl, serviceKey } = config();
  const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!supabaseUrl || !serviceKey || !token) return null;
  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${token}` },
  });
  return authResponse.ok ? authResponse.json() : null;
}

const rpc = (name, body) => {
  const { supabaseUrl, serviceKey } = config();
  return fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
};

// PostgREST reports an absent function as PGRST202, which is how we
// detect that multi-method-payments.sql has not been applied yet.
const isMissingFunction = (status, payload) =>
  status === 404 || payload?.code === 'PGRST202' || /Could not find the function/i.test(payload?.message || '');

async function consumeQuota(userId) {
  // Payments have their own bucket once the migration is applied;
  // before that they share the assistant's, which means a chatty
  // customer can be refused at checkout.
  let result = await rpc('consume_payment_quota', { p_user_id: userId });
  if (!result.ok) {
    const payload = await result.json().catch(() => ({}));
    if (!isMissingFunction(result.status, payload)) return false;
    result = await rpc('consume_assistant_quota', { p_user_id: userId });
  }
  return result.ok && await result.json() === true;
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });
  if (!config().supabaseUrl || !config().serviceKey) return response.status(503).json({ error: 'Payment server is not configured' });
  if (Number(request.headers['content-length'] || 0) > 10_000) return response.status(413).json({ error: 'Request is too large' });
  const user = await authenticate(request);
  if (!user) return response.status(401).json({ error: 'Authentication required' });
  if (!await consumeQuota(user.id)) return response.status(429).json({ error: 'Too many payment attempts' });

  const { orderId, amount, cardLast4, sandboxOtp, method } = request.body || {};
  if (!/^[0-9a-f-]{36}$/i.test(String(orderId || ''))) return response.status(400).json({ error: 'Invalid order' });
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) return response.status(400).json({ error: 'Invalid amount' });
  // Every online method settles against a 4-digit reference: the card
  // tail, the wallet mobile tail, the bank account tail, or the QR
  // reference. Cash never reaches this endpoint — it is owed at the
  // counter, not authorised here.
  if (!ONLINE_METHODS.has(String(method || 'CARD').toUpperCase())) {
    return response.status(400).json({ error: 'Unsupported payment method' });
  }
  if (!/^\d{4}$/.test(String(cardLast4 || ''))) return response.status(400).json({ error: 'Invalid payment reference' });
  if (String(sandboxOtp || '') !== config().sandboxOtp) return response.status(402).json({ error: 'Sandbox payment authorization failed' });

  const chosen = String(method || 'CARD').toUpperCase();

  // settle_online_payment records the method the customer actually
  // chose. Without the migration we fall back to settle_maya_payment,
  // which hardcodes MAYA_SANDBOX — the payment still succeeds, it is
  // just labelled as a Maya card payment in reports.
  let settlement = await rpc('settle_online_payment', {
    p_order_id: orderId, p_customer_id: user.id, p_amount: Number(amount),
    p_reference: cardLast4, p_method: chosen,
  });
  let result = await settlement.json().catch(() => ({}));

  if (!settlement.ok && isMissingFunction(settlement.status, result)) {
    settlement = await rpc('settle_maya_payment', {
      p_order_id: orderId, p_customer_id: user.id, p_amount: Number(amount), p_card_last4: cardLast4,
    });
    result = await settlement.json().catch(() => ({}));
  }

  if (!settlement.ok) return response.status(400).json({ error: result?.message || 'Payment settlement failed' });
  return response.status(200).json(result);
}
