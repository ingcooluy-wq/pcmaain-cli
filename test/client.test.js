'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { createClient, ApiError } = require('../lib/client');

const originalFetch = global.fetch;

function stubFetch(handler) {
  global.fetch = async (url, opts = {}) => {
    const parsed = new URL(url);
    const route = handler(parsed, opts);
    return new Response(JSON.stringify(route.body), {
      status: route.status || 200,
      headers: { 'content-type': 'application/json' },
    });
  };
}

beforeEach(() => {
  delete process.env.PCMA_AIN_POLL_MS;
});
afterEach(() => {
  global.fetch = originalFetch;
});

test('get: arma URL, envía X-API-Key y parsea JSON', async () => {
  let seen = null;
  stubFetch((url, opts) => {
    seen = { url: url.toString(), headers: opts.headers };
    return { body: { ok: true, v: 1 } };
  });
  const api = createClient({ apiUrl: 'https://api.example.com/', apiKey: 'secret-key' });
  const data = await api.get('/health', { query: { date: '2026-08-11', extra: undefined } });
  assert.strictEqual(data.ok, true);
  assert.ok(seen.url.startsWith('https://api.example.com/health'));
  assert.ok(seen.url.includes('date=2026-08-11'));
  assert.ok(!seen.url.includes('extra'));
  assert.strictEqual(seen.headers['X-API-Key'], 'secret-key');
});

test('post: envía JSON body y Content-Type', async () => {
  let seen = null;
  stubFetch((url, opts) => {
    seen = { method: opts.method, body: JSON.parse(opts.body), headers: opts.headers };
    return { status: 202, body: { status: 'started' } };
  });
  const api = createClient({ apiUrl: 'https://api.example.com', apiKey: 'k' });
  const data = await api.post('/topics/open-code/generate', { json: { format: 'text' } });
  assert.strictEqual(seen.method, 'POST');
  assert.deepStrictEqual(seen.body, { format: 'text' });
  assert.strictEqual(seen.headers['Content-Type'], 'application/json');
  assert.strictEqual(data.status, 'started');
});

test('error: 401/409/500 lanza ApiError con status y code', async () => {
  stubFetch((url, opts) => ({ status: 409, body: { error: 'conflict', message: 'exists' } }));
  const api = createClient({ apiUrl: 'https://api.example.com' });
  await assert.rejects(
    () => api.post('/topics/x/generate', { json: {} }),
    (err) => err instanceof ApiError && err.status === 409 && err.code === 'conflict' && err.message === 'exists'
  );
});

test('error: sin API key no envía el header', async () => {
  let seen = null;
  stubFetch((url, opts) => { seen = opts.headers; return { body: [] }; });
  const api = createClient({ apiUrl: 'https://api.example.com' });
  await api.get('/topics');
  assert.strictEqual(seen['X-API-Key'], undefined);
});

test('error de red envuelto en ApiError status 0', async () => {
  global.fetch = async () => { throw new TypeError('fetch failed'); };
  const api = createClient({ apiUrl: 'https://api.example.com' });
  await assert.rejects(() => api.get('/health'), (err) => err instanceof ApiError && err.status === 0);
});

test('API URL inválida lanza ApiError', async () => {
  const api = createClient({ apiUrl: 'not a url' });
  await assert.rejects(() => api.get('/health'), (err) => err instanceof ApiError && err.status === 0);
});
