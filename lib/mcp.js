'use strict';

// Servidor MCP (protocolo 2025-03-26) sobre stdio, JSON-RPC 2.0.
// Tools expuestas con prefijo pcmaain_*. Cero deps (readline + fetch).

const readline = require('readline');
const { createClient } = require('./client');

const PROTOCOL_VERSION = '2025-03-26';

function tool(name, description, properties, required, handler) {
  return {
    name,
    description,
    inputSchema: { type: 'object', properties, required },
    handler,
  };
}

function buildTools(api) {
  return [
    tool('pcmaain_health', 'Estado de la API PCMA (health check).',
      {}, [],
      async () => api.get('/health')),
    tool('pcmaain_topics_list', 'Listar tópicos. admin=true usa /topics/admin (todos, requiere API key).',
      { admin: { type: 'boolean', description: 'incluir deshabilitados (requiere API key)' } }, [],
      async (params) => (params.admin ? api.get('/topics/admin') : api.get('/topics'))),
    tool('pcmaain_generate', 'Genera una notificación on-demand para un tópico (async 202 + poll). wait=true espera hasta completed/exhausted.',
      {
        id: { type: 'string', description: 'topic_id (p.ej. open-code)' },
        format: { type: 'string', enum: ['text', 'text+audio', 'audio'], description: 'text saltea TTS' },
        date: { type: 'string', description: 'YYYY-MM-DD (default hoy)' },
        push: { type: 'boolean' },
        email: { type: 'boolean' },
        force: { type: 'boolean', description: 'delete + regenerate si ya existe' },
        wait: { type: 'boolean' },
        timeout: { type: 'number', description: 'segundos del poll si wait (default 300)' },
      },
      ['id'],
      async (params) => {
        const body = {
          format: params.format || 'text+audio',
          date: params.date || new Date().toISOString().split('T')[0],
          push: !!params.push,
          email: !!params.email,
          force: !!params.force,
        };
        const started = await api.post(`/topics/${encodeURIComponent(params.id)}/generate`, { json: body });
        if (!params.wait) return started;
        return pollUntilDone(api, params.id, body.date, params.timeout || 300);
      }),
    tool('pcmaain_status', 'Estado de los topics del día.',
      {
        date: { type: 'string', description: 'YYYY-MM-DD (default hoy)' },
        topic_id: { type: 'string' },
      }, [],
      async (params) => api.get('/jobs/status', {
        query: { date: params.date, topic_id: params.topic_id },
      })),
    tool('pcmaain_quota', 'Cuota per-model del día (requiere API key).',
      { date: { type: 'string', description: 'YYYY-MM-DD (default hoy)' } }, [],
      async (params) => api.get('/quota/status', {
        query: { date: params.date },
      })),
    tool('pcmaain_notifications_get', 'Notificaciones de una fecha (opcional filtro por topic_id).',
      {
        date: { type: 'string', description: 'YYYY-MM-DD' },
        topic_id: { type: 'string' },
      },
      ['date'],
      async (params) => {
        const rows = await api.get('/notifications/' + encodeURIComponent(params.date));
        return params.topic_id ? rows.filter((n) => n.topic_id === params.topic_id) : rows;
      }),
  ];
}

async function pollUntilDone(api, id, date, timeoutSec) {
  const deadline = timeoutSec === 0 ? Infinity : Date.now() + timeoutSec * 1000;
  for (;;) {
    if (Date.now() > deadline) {
      throw Object.assign(new Error(`timeout waiting for topic "${id}"`), { timedOut: true });
    }
    const data = await api.get('/jobs/status', { query: { date, topic_id: id } });
    const t = (data.topics || []).find((x) => x.topic_id === id);
    if (t && t.status === 'completed') {
      let notification = null;
      try {
        const rows = await api.get('/notifications/' + encodeURIComponent(date));
        notification = (rows || []).find((x) => x.topic_id === id) || null;
      } catch { /* 404 */ }
      return { ...data, topic: t, notification };
    }
    if (t && t.status === 'exhausted') {
      return { ...data, topic: t, exhausted: true };
    }
    await new Promise((r) => setTimeout(r, Number(process.env.PCMA_AIN_POLL_MS) || 5000));
  }
}

// Procesa un mensaje JSON-RPC (objeto parseado) y responde con `send(frame)`.
// `send` recibe un frame parcial {id, result?} o {id, error?} — el jsonrpc se completa acá.
async function processMessage(msg, { tools, send }) {
  if (!msg || msg.id === undefined || msg.id === null) return; // notification

  try {
    switch (msg.method) {
      case 'initialize':
        send({
          id: msg.id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'pcmaain', version: '1.0.0' },
          },
        });
        break;
      case 'ping':
        send({ id: msg.id, result: {} });
        break;
      case 'tools/list':
        send({
          id: msg.id,
          result: {
            tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
          },
        });
        break;
      case 'tools/call': {
        const { name, arguments: args } = (msg.params || {});
        const t = tools.find((x) => x.name === name);
        if (!t) {
          send({ id: msg.id, error: { code: -32602, message: `Unknown tool: ${name}` } });
          break;
        }
        try {
          const result = await t.handler(args || {});
          send({ id: msg.id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } });
        } catch (err) {
          send({
            id: msg.id,
            result: { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true },
          });
        }
        break;
      }
      default:
        send({ id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } });
    }
  } catch (err) {
    send({ id: msg.id, error: { code: -32603, message: `Internal error: ${err.message}` } });
  }
}

function createMcpServer({ config, stdout, stdin, stderr, version }) {
  const api = createClient(config);
  const tools = buildTools(api);

  function send(frame) {
    stdout.write(JSON.stringify({ jsonrpc: '2.0', ...frame }) + '\n');
  }

  const rl = readline.createInterface({ input: stdin, crlfDelay: Infinity });
  rl.on('line', (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    processMessage(msg, { tools, send }).catch(() => {});
  });

  return {
    tools,
    processMessage: (msg, customSend) => processMessage(msg, { tools, send: customSend || send }),
  };
}

module.exports = { createMcpServer, buildTools, processMessage, pollUntilDone, PROTOCOL_VERSION };
