'use strict';

const { emit, usageError, table } = require('./util');

const SUBCOMMANDS = ['list', 'show', 'create', 'edit', 'enable', 'disable', 'delete'];

async function listTopics(ctx, parsed) {
  const admin = !!parsed.flags.admin || !!parsed.flags.a;
  const data = admin ? await ctx.api.get('/topics/admin') : await ctx.api.get('/topics');
  emit(ctx, data, (rows) => {
    const cols = admin
      ? ['id', 'title', 'emoji', 'enabled']
      : ['id', 'title', 'emoji', 'accent_color'];
    return table(rows.map((t) => ({
      id: t.id,
      title: t.title,
      emoji: t.emoji,
      accent_color: t.accent_color,
      enabled: t.enabled ? 'yes' : 'no',
    })), cols);
  });
}

async function showTopic(ctx, parsed) {
  const id = parsed._[2];
  if (!id) throw usageError('usage: pcmaain topics show <id>');
  const rows = await ctx.api.get('/topics/admin');
  const t = rows.find((r) => r.id === id);
  if (!t) throw usageError(`topic "${id}" not found`);
  emit(ctx, t, (d) => [
    `id: ${d.id}`,
    `title: ${d.title}`,
    `emoji: ${d.emoji}`,
    `accent_color: ${d.accent_color}`,
    `enabled: ${d.enabled ? 'yes' : 'no'}`,
    `created_at: ${d.created_at}`,
    `prompt: ${(d.prompt || '').slice(0, 200)}${(d.prompt || '').length > 200 ? '…' : ''}`,
  ].join('\n'));
}

async function createTopic(ctx, parsed) {
  const [id, title] = parsed._.slice(2);
  if (!id || !title) throw usageError('usage: pcmaain topics create <id> <title> [--emoji E] [--accent-color C] [--prompt P]');
  const slug = String(id).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  const body = {
    id: slug,
    title,
    emoji: parsed.flags.emoji || '📻',
    accent_color: parsed.flags['accent-color'] || '#f8fafc',
    prompt: parsed.flags.prompt || 'Cubre las novedades de esta herramienta.',
  };
  const data = await ctx.api.post('/topics', { json: body });
  emit(ctx, { ...data, ...body }, (d) => `created topic "${d.id}" (title: ${d.title})`);
}

async function editTopic(ctx, parsed) {
  const id = parsed._[2];
  if (!id) throw usageError('usage: pcmaain topics edit <id> [--title T] [--emoji E] [--accent-color C] [--prompt P] [--enabled true|false]');
  const body = {};
  if (parsed.flags.title !== undefined) body.title = parsed.flags.title;
  if (parsed.flags.emoji !== undefined) body.emoji = parsed.flags.emoji;
  if (parsed.flags['accent-color'] !== undefined) body.accent_color = parsed.flags['accent-color'];
  if (parsed.flags.prompt !== undefined) body.prompt = parsed.flags.prompt;
  if (parsed.flags.enabled !== undefined) body.enabled = Boolean(parsed.flags.enabled);
  if (Object.keys(body).length === 0) throw usageError('nothing to edit (pass at least one --flag)');
  const data = await ctx.api.patch(`/topics/${encodeURIComponent(id)}`, { json: body });
  emit(ctx, data, (d) => `updated topic "${d.id}" (enabled: ${d.enabled ? 'yes' : 'no'})`);
}

async function setEnabled(ctx, parsed, enabled) {
  const id = parsed._[2];
  if (!id) throw usageError(`usage: pcmaain topics ${enabled ? 'enable' : 'disable'} <id>`);
  const data = await ctx.api.patch(`/topics/${encodeURIComponent(id)}`, { json: { enabled } });
  emit(ctx, data, (d) => `topic "${d.id}" ${enabled ? 'enabled' : 'disabled'}`);
}

async function deleteTopic(ctx, parsed) {
  const id = parsed._[2];
  if (!id) throw usageError('usage: pcmaain topics delete <id> [-y]');
  if (!parsed.flags.y && !parsed.flags.yes) {
    throw usageError(`confirm with --yes/-y to delete topic "${id}"`);
  }
  const data = await ctx.api.delete(`/topics/${encodeURIComponent(id)}`);
  emit(ctx, data, (d) => `deleted topic "${d.id}"`);
}

module.exports = {
  name: 'topics',
  summary: 'Gestionar tópicos (list/show/create/edit/enable/disable/delete)',
  usage: 'pcmaain topics <list [--admin]|show <id>|create <id> <title>|edit <id>|enable <id>|disable <id>|delete <id> [-y]>',
  needsAuth: false,
  help: [
    'topics: gestión de tópicos',
    '',
    '  pcmaain topics list [--admin]       tópicos públicos (solo enabled); --admin usa /topics/admin',
    '  pcmaain topics show <id>            detalle de un tópico (admin)',
    '  pcmaain topics create <id> <title>  crear tópico (id se auto-slugifica: minúsculas + [a-z0-9-])',
    '    [--emoji E] [--accent-color C] [--prompt P]',
    '  pcmaain topics edit <id> [--title T] [--emoji E] [--accent-color C] [--prompt P] [--enabled true|false]',
    '  pcmaain topics enable <id>          habilitar',
    '  pcmaain topics disable <id>         deshabilitar',
    '  pcmaain topics delete <id> --yes    eliminar (el historial queda intacto)',
    '',
    'Nota: create/edit/enable/disable/delete requieren X-API-Key (config).',
  ].join('\n'),
  async run(ctx, parsed) {
    const sub = parsed._[1];
    if (!sub || sub === 'help') {
      ctx.stdout.write(this.help + '\n');
      return 0;
    }
    if (!SUBCOMMANDS.includes(sub)) throw usageError(`unknown topics subcommand "${sub}"`);
    switch (sub) {
      case 'list': return listTopics(ctx, parsed);
      case 'show': return showTopic(ctx, parsed);
      case 'create': return createTopic(ctx, parsed);
      case 'edit': return editTopic(ctx, parsed);
      case 'enable': return setEnabled(ctx, parsed, true);
      case 'disable': return setEnabled(ctx, parsed, false);
      case 'delete': return deleteTopic(ctx, parsed);
    }
  },
};
