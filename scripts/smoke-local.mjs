import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const origin = process.env.SMOKE_ORIGIN || 'http://127.0.0.1:5173';
const page = await fetch(origin);
assert.equal(page.status, 200);
assert.match(await page.text(), /id="root"/);
for (const route of ['assistant', 'recommendations', 'sales-insight', 'maya']) {
  const response = await fetch(`${origin}/api/${route}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(response.status, 401, `${route} must reject unauthenticated requests`);
  assert.equal(typeof (await response.json()).error, 'string');
}
assert.equal((await fetch(`${origin}/api/nonexistent`)).status, 404);
const bundles = await readdir(new URL('../dist/assets/', import.meta.url));
const source = (await Promise.all(bundles.filter(name => name.endsWith('.js')).map(name =>
  readFile(new URL(`../dist/assets/${name}`, import.meta.url), 'utf8')))).join('\n');
for (const file of ['.env', '.env.local']) {
  let environment;
  try { environment = await readFile(new URL(`../${file}`, import.meta.url), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  for (const line of environment.split(/\r?\n/)) {
    const match = line.match(/^\s*(SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY|GROQ_API_KEY|EMBEDDING_API_KEY|MAYA_SECRET_KEY)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const value = match[2].replace(/^['"]|['"]$/g, '');
    if (value.length > 12) assert.equal(source.includes(value), false, 'A server credential must never appear in a browser bundle');
  }
}
console.log('Local page, API authentication, unknown route, and browser credential checks passed.');
