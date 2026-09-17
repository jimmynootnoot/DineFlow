import { createClient } from '@supabase/supabase-js';

export const httpError = (status, message) => Object.assign(new Error(message), { status });
export function serviceClient() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw httpError(503, 'Server database connection is not configured.');
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function authenticate(request, allowedRoles) {
  const db = serviceClient();
  const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw httpError(401, 'Please sign in.');
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw httpError(401, 'Your session has expired. Please sign in again.');
  const { data: profile, error: profileError } = await db.from('profiles').select('role').eq('id', data.user.id).single();
  if (profileError || !profile) throw httpError(403, 'A restaurant profile is required.');
  if (allowedRoles && !allowedRoles.includes(profile.role)) throw httpError(403, 'You do not have access to this function.');
  return { db, user: data.user, role: profile.role };
}
export async function readAll(makeQuery) {
  const rows = [];
  for (let offset = 0; ; ) {
    const { data, error } = await makeQuery().range(offset, offset + 499);
    if (error) throw error;
    if (!data.length) return rows;
    rows.push(...data); offset += data.length;
  }
}
export function endpoint(run) {
  return async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    if (request.method !== 'POST') return response.status(405).json({ error: 'Use POST.' });
    if (Number(request.headers['content-length'] || 0) > 50000) return response.status(413).json({ error: 'Request is too large.' });
    try { return response.status(200).json(await run(request)); }
    catch (error) { return response.status(error.status || 500).json({ error: error.status ? error.message : 'The request could not be completed. Check the database migration and server connection.' }); }
  };
}
export function languageModelConfig() {
  // Preserve the existing Groq installation while separating chat and embeddings.
  const legacy = process.env.OPENAI_API_KEY || '';
  const groq = process.env.GROQ_API_KEY || (legacy.startsWith('gsk_') ? legacy : '');
  return groq ? { key: groq, url: 'https://api.groq.com/openai/v1/chat/completions', model: process.env.GROQ_MODEL || process.env.OPENAI_MODEL || 'openai/gpt-oss-120b' }
    : { key: legacy, url: 'https://api.openai.com/v1/chat/completions', model: process.env.OPENAI_MODEL || 'gpt-4.1-mini' };
}
export async function generateText(instructions, context) {
  const { key, url, model } = languageModelConfig();
  if (!key) throw httpError(503, 'Language model is not configured.');
  const upstream = await fetch(url, {
    method: 'POST', signal: AbortSignal.timeout(22000),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: instructions }, { role: 'user', content: JSON.stringify(context) }],
      max_completion_tokens: 1200, ...(/^openai\/gpt-oss/.test(model) ? { reasoning_effort: 'low' } : {}) }),
  });
  const data = await upstream.json();
  const answer = data?.choices?.[0]?.message?.content?.trim();
  if (!upstream.ok || !answer) throw httpError(502, 'The language model is temporarily unavailable.');
  return answer;
}
export async function embed(text) {
  const key = process.env.EMBEDDING_API_KEY || (/^sk-/.test(process.env.OPENAI_API_KEY || '') ? process.env.OPENAI_API_KEY : '');
  if (!key) throw httpError(503, 'Embedding provider is not configured.');
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST', signal: AbortSignal.timeout(12000),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', dimensions: 1536, input: text }),
  });
  const data = await response.json();
  if (!response.ok || !data?.data?.[0]?.embedding) throw httpError(502, 'Embedding service is unavailable.');
  return data.data[0].embedding;
}
