'use strict';

const fs = require('fs');
const { emit, usageError } = require('./util');
const { downloadToFile } = require('../client');

const VALID_FORMATS = ['text', 'text+audio', 'audio'];
const DEFAULT_TIMEOUT = 300;
const POLL_INTERVAL_MS = Number(process.env.PCMA_AIN_POLL_MS) || 5000;

async function generate(ctx, parsed) {
  const id = parsed._[1];
  if (!id) throw usageError('usage: pcmaain generate <id> [--format text|text+audio|audio] [--date YYYY-MM-DD] [--push] [--email] [--force] [--wait] [--timeout S] [--out file]');

  const format = parsed.flags.format || 'text+audio';
  if (!VALID_FORMATS.includes(format)) throw usageError(`invalid format "${format}" (allowed: ${VALID_FORMATS.join(', ')})`);

  const date = parsed.flags.date || new Date().toISOString().split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw usageError(`invalid date "${date}" (expected YYYY-MM-DD)`);

  const body = {
    format,
    date,
    push: !!parsed.flags.push,
    email: !!parsed.flags.email,
    force: !!parsed.flags.force,
  };

  let started;
  try {
    started = await ctx.api.post(`/topics/${encodeURIComponent(id)}/generate`, { json: body });
  } catch (err) {
    if (err.status === 409 && !parsed.flags.force) {
      throw usageError(`${err.message}. Re-run with --force to regenerate.`);
    }
    throw err;
  }

  const wait = !!parsed.flags.wait;
  if (!wait) {
    emit(ctx, { ...started, body }, (d) => [
      `status: ${d.status}`,
      `date: ${d.date}`,
      `topic_id: ${d.topic_id}`,
      `format: ${d.format}`,
      `poll: ${d.poll}`,
      `message: ${d.message}`,
      'Run with --wait to poll until completion.',
    ].join('\n'));
    return;
  }

  const timeout = parsed.flags.timeout === undefined ? DEFAULT_TIMEOUT : Number(parsed.flags.timeout);
  if (Number.isNaN(timeout) || timeout < 0) throw usageError('--timeout must be a non-negative number of seconds (0 = no limit)');

  const status = await waitForCompletion(ctx, id, date, timeout);
  emit(ctx, status, (d) => {
    const lines = [
      `date: ${d.date}`,
      `topic_id: ${d.topic_id}`,
      `status: ${d.status}`,
      `attempts: ${d.attempts}`,
    ];
    if (d.audio_url) lines.push(`audio_url: ${d.audio_url}`);
    if (d.notification) {
      const n = d.notification;
      lines.push(`notification: ${n.id}`);
      if (n.model_used) lines.push(`model_used: ${n.model_used}`);
      if (n.sources_count !== undefined && n.sources_count !== null) lines.push(`sources_count: ${n.sources_count}`);
      if (n.image_url) lines.push(`image_url: ${n.image_url}`);
    }
    return lines.join('\n');
  });

  const out = parsed.flags.out;
  if (out && status.notification && status.notification.audio_url) {
    const dl = await downloadToFile(status.notification.audio_url, out, { writeFile: fs.writeFileSync });
    ctx.stdout.write(`audio saved: ${dl.filePath} (${dl.bytes} bytes, ${dl.contentType})\n`);
  } else if (out && status.status === 'completed' && (!status.notification || !status.notification.audio_url)) {
    ctx.stdout.write(`--out given but no audio_url on notification (format=${format}) — nothing to download\n`);
  }
}

async function waitForCompletion(ctx, id, date, timeoutSec) {
  const deadline = timeoutSec === 0 ? Infinity : Date.now() + timeoutSec * 1000;
  for (;;) {
    if (Date.now() > deadline) {
      const partial = await fetchStatus(ctx, date, id);
      throw usageError(`timeout waiting for topic "${id}" (status=${partial.status}). Poll manually: pcmaain status --date ${date}`);
    }
    const status = await fetchStatus(ctx, date, id);
    if (status.status === 'completed') {
      return finalize(ctx, status, date, id);
    }
    if (status.status === 'exhausted') {
      return { ...status, message: 'topic exhausted after 3 attempts' };
    }
    if (status.status === 'pending') {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

async function fetchStatus(ctx, date, topicId) {
  const data = await ctx.api.get('/jobs/status', { query: { date, topic_id: topicId } });
  const t = (data.topics || []).find((x) => x.topic_id === topicId);
  if (!t) return { ...data, topic_id: topicId, status: 'unknown', attempts: 0 };
  return { date: data.date, topic_id: t.topic_id, status: t.status, attempts: t.attempts, sort_order: t.sort_order };
}

async function finalize(ctx, status, date, topicId) {
  let notification = null;
  try {
    const rows = await ctx.api.get('/notifications/' + encodeURIComponent(date));
    const n = (rows || []).find((x) => x.topic_id === topicId);
    if (n) {
      notification = {
        id: n.id,
        topic_id: n.topic_id,
        topic_title: n.topic_title,
        audio_url: n.audio_url,
        image_url: n.image_url,
        model_used: n.model_used,
        sources_count: n.sources_count,
      };
    }
  } catch (err) {
    if (err.status === 404) notification = null;
    else throw err;
  }
  return { ...status, notification };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = {
  name: 'generate',
  summary: 'Generar una notificación on-demand (async 202 + poll; --wait hasta completar)',
  usage: 'pcmaain generate <id> [--format text|text+audio|audio] [--date YYYY-MM-DD] [--push] [--email] [--force] [--wait] [--timeout S] [--out file]',
  needsAuth: true,
  help: [
    'generate: generación on-demand de un tópico (requiere X-API-Key).',
    '',
    '  --format text|text+audio|audio   text saltea TTS (default: text+audio)',
    '  --date YYYY-MM-DD                fecha de la notificación (default: hoy)',
    '  --push                           enviar push al completar',
    '  --email                          enviar digest email al completar',
    '  --force                          delete + regenerate si ya existe (sin force → 409)',
    '  --wait                           poll /jobs/status hasta completed/exhausted',
    '  --timeout S                      timeout del poll en segundos (default 300; 0 = sin límite)',
    '  --out file                       si --wait y el formato trae audio, descarga el mp3',
  ].join('\n'),
  run: generate,
};
