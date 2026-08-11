'use strict';

const { emit, usageError, table } = require('./util');

module.exports = [
  {
    name: 'quota',
    summary: 'Cuota per-model del día (requiere X-API-Key)',
    usage: 'pcmaain quota [--date YYYY-MM-DD]',
    needsAuth: true,
    async run(ctx, parsed) {
      const date = parsed.flags.date || new Date().toISOString().split('T')[0];
      const data = await ctx.api.get('/quota/status', { query: { date } });
      emit(ctx, data, (d) => table(d.models.map((m) => ({
        model: m.model,
        requests: m.requests,
        limit: m.limit,
        percent: `${m.percent}%`,
      })), ['model', 'requests', 'limit', 'percent']));
    },
  },
  {
    name: 'push',
    summary: 'Enviar push de prueba (requiere X-API-Key)',
    usage: 'pcmaain push test [--title T] [--body B] [--topic ID]',
    needsAuth: true,
    help: [
      'push: test de notificaciones push (FCM + Web)',
      '',
      '  pcmaain push test [--title T] [--body B] [--topic ID]',
    ].join('\n'),
    async run(ctx, parsed) {
      const sub = parsed._[1];
      if (sub === 'help' || !sub) {
        ctx.stdout.write(this.help + '\n');
        return 0;
      }
      if (sub !== 'test') throw usageError(`unknown push subcommand "${sub}"`);
      const data = await ctx.api.post('/test-push', {
        json: {
          title: parsed.flags.title,
          body: parsed.flags.body,
          topic: parsed.flags.topic,
        },
      });
      emit(ctx, data, (d) => `push sent: ${JSON.stringify(d)}`);
    },
  },
];
