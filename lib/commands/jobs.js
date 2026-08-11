'use strict';

const { emit, usageError, table } = require('./util');

const VALID_MODES = ['daily', 'retry'];

module.exports = [
  {
    name: 'status',
    summary: 'Estado de los topics del día (jobs/status)',
    usage: 'pcmaain status [--date YYYY-MM-DD] [--topic-id ID]',
    needsAuth: false,
    async run(ctx, parsed) {
      const date = parsed.flags.date || new Date().toISOString().split('T')[0];
      const topicId = parsed.flags['topic-id'] || parsed.flags.topic;
      const data = await ctx.api.get('/jobs/status', { query: { date, topic_id: topicId } });
      emit(ctx, data, (d) => {
        const lines = [
          `date: ${d.date} | completed: ${d.completed} | pending: ${d.pending} | exhausted: ${d.exhausted}`,
          '',
          table((d.topics || []).map((t) => ({
            topic_id: t.topic_id,
            title: t.topic_title || '',
            status: t.status,
            attempts: t.attempts,
            sort_order: t.sort_order ?? '',
          })), ['topic_id', 'title', 'status', 'attempts', 'sort_order']),
        ];
        return lines.join('\n');
      });
    },
  },
  {
    name: 'run',
    summary: 'Disparar daily/retry manualmente (requiere X-API-Key)',
    usage: 'pcmaain run <daily|retry>',
    needsAuth: true,
    async run(ctx, parsed) {
      const mode = parsed._[1] || 'daily';
      if (!VALID_MODES.includes(mode)) throw usageError(`invalid mode "${mode}" (allowed: ${VALID_MODES.join(', ')})`);
      const data = await ctx.api.post('/jobs/run', { json: { mode } });
      emit(ctx, data, (d) => `status: ${d.status}\nmode: ${d.mode}\nmessage: ${d.message}`);
    },
  },
];
