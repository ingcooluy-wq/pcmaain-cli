'use strict';

process.env.PCMA_AIN_POLL_MS = '5';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { run } = require('../lib/cli');

const originalFetch = global.fetch;

process.env.PCMA_AIN_API_URL = 'https://stub.example';
process.env.PCMA_AIN_API_KEY = 'stub-key';

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

let requests = [];

function stubRoutes(routes) {
  requests = [];
  global.fetch = async (url, opts = {}) => {
    const parsed = new URL(url);
    const method = opts.method || 'GET';
    requests.push({
      method,
      path: parsed.pathname,
      query: Object.fromEntries(parsed.searchParams.entries()),
      body: opts.body ? JSON.parse(opts.body) : undefined,
    });
    const route = routes.find((r) => {
      if (r.method !== method || r.path !== parsed.pathname) return false;
      if (r.query) {
        for (const [k, v] of Object.entries(r.query)) {
          if (parsed.searchParams.get(k) !== String(v)) return false;
        }
      }
      return true;
    });
    if (!route) return jsonResponse(404, { error: 'not_found', message: `no stub ${method} ${parsed.pathname}` });
    const body = typeof route.body === 'function' ? route.body() : route.body;
    return jsonResponse(route.status || 200, body);
  };
}

async function exec(argv, routes) {
  stubRoutes(routes || []);
  let out = '', err = '';
  const code = await run(argv, {
    stdout: { write: (s) => { out += s; } },
    stderr: { write: (s) => { err += s; } },
    stdin: { on: () => {} },
  });
  return { code, out, err };
}

beforeEach(() => { process.env.PCMA_AIN_POLL_MS = '5'; });
afterEach(() => { global.fetch = originalFetch; });

test('health: tabla humana', async () => {
  const { code, out } = await exec(['health'], [
    { method: 'GET', path: '/health', body: { status: 'ok', db: 'connected', version: '1.0.0', uptime: 5, timestamp: 't' } },
  ]);
  assert.strictEqual(code, 0);
  assert.match(out, /status: ok/);
  assert.match(out, /db: connected/);
});

test('health --json: JSON válido', async () => {
  const { code, out } = await exec(['health', '--json'], [
    { method: 'GET', path: '/health', body: { status: 'ok', db: 'connected', version: '1.0.0', uptime: 5, timestamp: 't' } },
  ]);
  assert.strictEqual(code, 0);
  assert.strictEqual(JSON.parse(out).status, 'ok');
});

test('unknown command: exit 2', async () => {
  const { code, err } = await exec(['nope']);
  assert.strictEqual(code, 2);
  assert.match(err, /unknown command/);
});

test('topics list: tabla y exit 0', async () => {
  const { code, out } = await exec(['topics', 'list'], [
    { method: 'GET', path: '/topics', body: [{ id: 'open-code', title: 'OpenCode', emoji: '💻', accent_color: '#0b4712' }] },
  ]);
  assert.strictEqual(code, 0);
  assert.match(out, /open-code/);
  assert.match(out, /OpenCode/);
});

test('topics create: auto-slugifica el id en el body', async () => {
  const { code } = await exec(['topics', 'create', 'New Topic!', 'Mi Tópico'], [
    { method: 'POST', path: '/topics', status: 201, body: { id: 'new-topic' } },
  ]);
  assert.strictEqual(code, 0);
  const req = requests.find((r) => r.method === 'POST' && r.path === '/topics');
  assert.strictEqual(req.body.id, 'new-topic');
  assert.strictEqual(req.body.title, 'Mi Tópico');
});

test('topics edit: PATCH con solo lo pasado', async () => {
  const { code } = await exec(['topics', 'edit', 'open-code', '--enabled', 'false'], [
    { method: 'PATCH', path: '/topics/open-code', body: { id: 'open-code', enabled: 0 } },
  ]);
  assert.strictEqual(code, 0);
  const req = requests.find((r) => r.method === 'PATCH');
  assert.deepStrictEqual(req.body, { enabled: false });
});

test('generate sin force ante 409: exit 2 y mensaje', async () => {
  const { code, err } = await exec(['generate', 'open-code', '--date', '2026-08-11'], [
    {
      method: 'POST', path: '/topics/open-code/generate', status: 409,
      body: { error: 'conflict', message: 'Notification already exists' },
    },
  ]);
  assert.strictEqual(code, 2);
  assert.match(err, /--force/);
});

test('generate --wait: poll hasta completed y trae notificación', async () => {
  let pollCount = 0;
  const { code, out } = await exec(['generate', 'open-code', '--date', '2026-08-11', '--format', 'text', '--wait', '--json'], [
    {
      method: 'POST', path: '/topics/open-code/generate', status: 202,
      body: { status: 'started', date: '2026-08-11', topic_id: 'open-code', format: 'text', poll: 'p' },
    },
    {
      method: 'GET', path: '/jobs/status',
      body: () => {
        pollCount++;
        const done = pollCount > 2;
        return {
          date: '2026-08-11', completed: done ? 1 : 0, pending: done ? 0 : 1, exhausted: 0,
          topics: [{ topic_id: 'open-code', status: done ? 'completed' : 'pending', attempts: 0 }],
        };
      },
    },
    {
      method: 'GET', path: '/notifications/2026-08-11',
      body: [{ id: 'n1', topic_id: 'open-code', topic_title: 'OpenCode', audio_url: null, model_used: 'm1', sources_count: 3 }],
    },
  ]);
  assert.strictEqual(code, 0);
  const parsed = JSON.parse(out);
  assert.strictEqual(parsed.status, 'completed');
  assert.strictEqual(parsed.notification.topic_id, 'open-code');
  assert.strictEqual(parsed.notification.sources_count, 3);
});

test('generate --wait con status exhausted: exit 0 y exhaust', async () => {
  const { code, out } = await exec(['generate', 'open-code', '--date', '2026-08-11', '--format', 'text', '--wait', '--json'], [
    {
      method: 'POST', path: '/topics/open-code/generate', status: 202,
      body: { status: 'started', date: '2026-08-11', topic_id: 'open-code', format: 'text', poll: 'p' },
    },
    {
      method: 'GET', path: '/jobs/status',
      body: { date: '2026-08-11', completed: 0, pending: 0, exhausted: 1, topics: [{ topic_id: 'open-code', status: 'exhausted', attempts: 3 }] },
    },
  ]);
  assert.strictEqual(code, 0);
  assert.strictEqual(JSON.parse(out).status, 'exhausted');
});

test('generate --wait timeout: exit 2', async () => {
  const { code, err } = await exec(['generate', 'open-code', '--date', '2026-08-11', '--format', 'text', '--wait', '--timeout', '0.2', '--json'], [
    {
      method: 'POST', path: '/topics/open-code/generate', status: 202,
      body: { status: 'started', date: '2026-08-11', topic_id: 'open-code', format: 'text', poll: 'p' },
    },
    {
      method: 'GET', path: '/jobs/status',
      body: { date: '2026-08-11', completed: 0, pending: 1, exhausted: 0, topics: [{ topic_id: 'open-code', status: 'pending', attempts: 0 }] },
    },
  ]);
  assert.strictEqual(code, 2);
  assert.match(err, /timeout/);
});

test('status: resumen completed/pending', async () => {
  const { code, out } = await exec(['status', '--date', '2026-08-11'], [
    {
      method: 'GET', path: '/jobs/status',
      body: {
        date: '2026-08-11', completed: 1, pending: 1, exhausted: 0,
        topics: [
          { topic_id: 'kiro-cli', topic_title: 'Kiro', status: 'completed', attempts: 0, sort_order: 0 },
          { topic_id: 'open-code', topic_title: 'OpenCode', status: 'pending', attempts: 1, sort_order: 1 },
        ],
      },
    },
  ]);
  assert.strictEqual(code, 0);
  assert.match(out, /completed: 1/);
  assert.match(out, /pending: 1/);
  assert.match(out, /open-code/);
});

test('run retry: POST /jobs/run con {mode}', async () => {
  const { code, out } = await exec(['run', 'retry'], [
    { method: 'POST', path: '/jobs/run', body: { status: 'started', mode: 'retry', message: 'ok' } },
  ]);
  assert.strictEqual(code, 0);
  const req = requests.find((r) => r.method === 'POST' && r.path === '/jobs/run');
  assert.deepStrictEqual(req.body, { mode: 'retry' });
  assert.match(out, /mode: retry/);
});

test('quota: tabla por modelo', async () => {
  const { code, out } = await exec(['quota', '--date', '2026-08-11'], [
    {
      method: 'GET', path: '/quota/status',
      body: { date: '2026-08-11', models: [{ model: 'gemini-2.5-flash', requests: 1, limit: 20, percent: 5 }] },
    },
  ]);
  assert.strictEqual(code, 0);
  assert.match(out, /gemini-2.5-flash/);
  assert.match(out, /5%/);
});

test('notifications get: filtra por topic y muestra tabla', async () => {
  const { code, out } = await exec(['notifications', 'get', '2026-08-11', '--topic-id', 'open-code'], [
    {
      method: 'GET', path: '/notifications/2026-08-11',
      body: [
        { topic_id: 'kiro-cli', topic_title: 'Kiro', audio_url: 'a', model_used: 'm', sources_count: 5 },
        { topic_id: 'open-code', topic_title: 'OpenCode', audio_url: null, model_used: 'm', sources_count: 2 },
      ],
    },
  ]);
  assert.strictEqual(code, 0);
  assert.match(out, /open-code/);
  assert.doesNotMatch(out, /kiro-cli/);
});

test('audio get sin --out: imprime la URL (fallback CDN)', async () => {
  const { code, out } = await exec(['audio', 'get', '2026-08-11', 'kiro-cli'], [
    { method: 'GET', path: '/notifications/2026-08-11/audio/kiro-cli', status: 404, body: { error: 'audio_not_found' } },
    {
      method: 'GET', path: '/notifications/2026-08-11',
      body: [{ topic_id: 'kiro-cli', audio_url: 'https://cdn.example/a.mp3' }],
    },
  ]);
  assert.strictEqual(code, 0);
  assert.match(out, /https:\/\/cdn\.example\/a\.mp3/);
});

test('push test: POST /test-push', async () => {
  const { code, out } = await exec(['push', 'test', '--title', 'Hola', '--body', 'Test', '--topic', 'open-code'], [
    { method: 'POST', path: '/test-push', body: { ok: true, fcm: 0, web: 0 } },
  ]);
  assert.strictEqual(code, 0);
  const req = requests.find((r) => r.path === '/test-push');
  assert.deepStrictEqual(req.body, { title: 'Hola', body: 'Test', topic: 'open-code' });
  assert.match(out, /push sent/);
});

test('config show: enmascara la API key', async () => {
  const { code, out } = await exec(['config', 'show']);
  assert.strictEqual(code, 0);
  assert.doesNotMatch(out, /stub-key/);
  assert.match(out, /stub/);
});

test('error de red: exit 1', async () => {
  global.fetch = async () => { throw new TypeError('fetch failed'); };
  let out = '', err = '';
  const code = await run(['health'], {
    stdout: { write: (s) => { out += s; } },
    stderr: { write: (s) => { err += s; } },
    stdin: { on: () => {} },
  });
  assert.strictEqual(code, 1);
  assert.match(err, /Network error/);
});
