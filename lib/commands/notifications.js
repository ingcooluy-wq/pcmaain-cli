'use strict';

const { emit, usageError, table } = require('./util');

module.exports = [
  {
    name: 'notifications',
    summary: 'Listar / consultar notificaciones',
    usage: 'pcmaain notifications <list [--limit N] [--offset N]|get <date> [--topic-id ID]>',
    needsAuth: false,
    help: [
      'notifications: historial de notificaciones',
      '',
      '  pcmaain notifications list [--limit N] [--offset N]   últimas (default 20, max 100)',
      '  pcmaain notifications get <date> [--topic-id ID]      notificaciones de una fecha',
    ].join('\n'),
    async run(ctx, parsed) {
      const sub = parsed._[1];
      if (!sub || sub === 'help') {
        ctx.stdout.write(this.help + '\n');
        return 0;
      }
      if (sub === 'list') {
        const limit = parsed.flags.limit === undefined ? 20 : Math.max(1, Math.min(Number(parsed.flags.limit) || 20, 100));
        const offset = parsed.flags.offset === undefined ? 0 : Number(parsed.flags.offset) || 0;
        const rows = await ctx.api.get('/notifications', { query: { limit, offset } });
        emit(ctx, rows, (data) => table(data.map((n) => ({
          date: n.date,
          topic_id: n.topic_id,
          title: n.topic_title || '',
          audio: n.audio_url ? '🎧' : '',
        })), ['date', 'topic_id', 'title', 'audio']));
        return;
      }
      if (sub === 'get') {
        const date = parsed._[2];
        if (!date) throw usageError('usage: pcmaain notifications get <date> [--topic-id ID]');
        const rows = await ctx.api.get('/notifications/' + encodeURIComponent(date));
        const topicId = parsed.flags['topic-id'] || parsed.flags.topic;
        const filtered = topicId ? rows.filter((n) => n.topic_id === topicId) : rows;
        emit(ctx, filtered, (data) => table(data.map((n) => ({
          topic_id: n.topic_id,
          title: n.topic_title || '',
          audio: n.audio_url ? 'yes' : 'no',
          model: n.model_used || '',
          sources: n.sources_count ?? '',
        })), ['topic_id', 'title', 'audio', 'model', 'sources']));
        return;
      }
      throw usageError(`unknown notifications subcommand "${sub}"`);
    },
  },
  {
    name: 'audio',
    summary: 'Obtener el audio de una notificación',
    usage: 'pcmaain audio get <date> <topicId> [--out file]',
    needsAuth: false,
    help: [
      'audio: descargar el mp3 de una notificación',
      '',
      '  pcmaain audio get <date> <topicId> [--out file]',
      '    Sin --out imprime la audio_url; con --out la descarga.',
    ].join('\n'),
    async run(ctx, parsed) {
      const sub = parsed._[1];
      if (sub === 'help' || !sub) {
        ctx.stdout.write(this.help + '\n');
        return 0;
      }
      if (sub !== 'get') throw usageError(`unknown audio subcommand "${sub}"`);
      const [date, topicId] = parsed._.slice(2);
      if (!date || !topicId) throw usageError('usage: pcmaain audio get <date> <topicId> [--out file]');

      let audio_url = null;
      try {
        const r = await ctx.api.get(`/notifications/${encodeURIComponent(date)}/audio/${encodeURIComponent(topicId)}`);
        audio_url = r.audio_url;
      } catch (err) {
        if (err.status !== 404) throw err;
        // El job cloud guarda el audio en CDN (no en audio_files): fallback al audio_url de la notificación.
        const rows = await ctx.api.get('/notifications/' + encodeURIComponent(date));
        const n = (rows || []).find((x) => x.topic_id === topicId);
        audio_url = n && n.audio_url ? n.audio_url : null;
      }
      if (!audio_url) throw usageError(`no audio found for ${topicId} on ${date}`);
      const out = parsed.flags.out;
      if (!out) {
        emit(ctx, { audio_url }, (d) => d.audio_url);
        return;
      }
      const { downloadToFile } = require('../client');
      const fs = require('fs');
      const dl = await downloadToFile(audio_url, out, { writeFile: fs.writeFileSync });
      emit(ctx, { ...dl, audio_url }, (d) => `audio saved: ${d.filePath} (${d.bytes} bytes, ${d.contentType})`);
    },
  },
];
