'use strict';

const { test, afterEach } = require('node:test');
const assert = require('node:assert');
const { buildTools, processMessage, PROTOCOL_VERSION } = require('../lib/mcp');
const { createClient } = require('../lib/client');

const originalFetch = global.fetch;

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function apiWithStub(routes) {
  global.fetch = async (url, opts = {}) => {
    const parsed = new URL(url);
    const method = opts.method || 'GET';
    const route = routes.find((r) => r.method === method && r.path === parsed.pathname);
    if (!route) return jsonResponse(404, { error: 'not_found', message: `no stub ${method} ${parsed.pathname}` });
    const body = typeof route.body === 'function' ? route.body() : route.body;
    return jsonResponse(route.status || 200, body);
  };
  return createClient({ apiUrl: 'https://stub.example', apiKey: 'k' });
}

function collector() {
  const frames = [];
  return { frames, send: (frame) => frames.push(frame) };
}

afterEach(() => { global.fetch = originalFetch; });

test('initialize: devuelve protocolVersion y capabilities', async () => {
  const { frames, send } = collector();
  await processMessage(
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'test' } } },
    { tools: buildTools(apiWithStub([])), send }
  );
  assert.strictEqual(frames.length, 1);
  const res = frames[0];
  assert.strictEqual(res.result.protocolVersion, PROTOCOL_VERSION);
  assert.deepStrictEqual(res.result.capabilities, { tools: { listChanged: false } });
  assert.strictEqual(res.result.serverInfo.name, 'pcmaain');
});

test('ping: responde {}', async () => {
  const { frames, send } = collector();
  await processMessage({ jsonrpc: '2.0', id: 2, method: 'ping' }, { tools: [], send });
  assert.deepStrictEqual(frames[0].result, {});
});

test('notifications (sin id): no responde', async () => {
  const { frames, send } = collector();
  await processMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, { tools: [], send });
  assert.strictEqual(frames.length, 0);
});

test('tools/list: expone las tools pcmaain_*', async () => {
  const { frames, send } = collector();
  await processMessage({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, { tools: buildTools(apiWithStub([])), send });
  const names = frames[0].result.tools.map((t) => t.name);
  assert.ok(names.includes('pcmaain_health'));
  assert.ok(names.includes('pcmaain_topics_list'));
  assert.ok(names.includes('pcmaain_generate'));
  assert.ok(names.includes('pcmaain_status'));
  assert.ok(names.includes('pcmaain_quota'));
  assert.ok(names.includes('pcmaain_notifications_get'));
  assert.ok(names.every((n) => n.startsWith('pcmaain_')));
});

test('tools/call pcmaain_health: resultado en content text', async () => {
  const api = apiWithStub([{ method: 'GET', path: '/health', body: { status: 'ok', db: 'connected', version: '1.0.0', uptime: 1, timestamp: 't' } }]);
  const { frames, send } = collector();
  await processMessage(
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'pcmaain_health', arguments: {} } },
    { tools: buildTools(api), send }
  );
  const res = frames[0].result;
  assert.strictEqual(res.isError, undefined);
  assert.strictEqual(JSON.parse(res.content[0].text).status, 'ok');
});

test('tools/call pcmaain_topics_list: admin=false usa /topics público', async () => {
  const api = apiWithStub([{ method: 'GET', path: '/topics', body: [{ id: 'open-code' }] }]);
  const { frames, send } = collector();
  await processMessage(
    { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'pcmaain_topics_list', arguments: {} } },
    { tools: buildTools(api), send }
  );
  assert.deepStrictEqual(JSON.parse(frames[0].result.content[0].text), [{ id: 'open-code' }]);
});

test('tools/call pcmaain_generate sin wait: devuelve 202 started', async () => {
  const api = apiWithStub([
    {
      method: 'POST', path: '/topics/open-code/generate', status: 202,
      body: { status: 'started', date: '2026-08-11', topic_id: 'open-code', format: 'text', poll: 'p' },
    },
  ]);
  const { frames, send } = collector();
  await processMessage(
    { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'pcmaain_generate', arguments: { id: 'open-code', format: 'text' } } },
    { tools: buildTools(api), send }
  );
  const res = JSON.parse(frames[0].result.content[0].text);
  assert.strictEqual(res.status, 'started');
  assert.strictEqual(res.format, 'text');
});

test('tools/call con tool desconocida: error -32602', async () => {
  const { frames, send } = collector();
  await processMessage(
    { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'pcmaain_bogus', arguments: {} } },
    { tools: [], send }
  );
  assert.strictEqual(frames[0].error.code, -32602);
});

test('tools/call que falla: isError true con mensaje', async () => {
  const api = apiWithStub([{ method: 'GET', path: '/health', status: 500, body: { error: 'boom', message: 'Internal error' } }]);
  const { frames, send } = collector();
  await processMessage(
    { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'pcmaain_health', arguments: {} } },
    { tools: buildTools(api), send }
  );
  assert.strictEqual(frames[0].result.isError, true);
  assert.match(frames[0].result.content[0].text, /Error/);
});

test('método desconocido: error -32601', async () => {
  const { frames, send } = collector();
  await processMessage({ jsonrpc: '2.0', id: 9, method: 'foo/bar' }, { tools: [], send });
  assert.strictEqual(frames[0].error.code, -32601);
});
