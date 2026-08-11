'use strict';

const { emit, usageError } = require('./util');
const { loadConfig, setConfigValue, defaultConfigPath } = require('../config');

const HELP = {
  name: 'help',
  summary: 'Mostrar ayuda',
  usage: 'pcmaain help [command]',
  needsAuth: false,
  async run(ctx, parsed) {
    const { getCommand, listCommands } = require('./index');
    const [target] = parsed._.slice(1);
    if (target) {
      const cmd = getCommand(target);
      if (!cmd) throw usageError(`unknown command "${target}"`);
      ctx.stdout.write((cmd.help || usageText(cmd)) + '\n');
      return 0;
    }
    const lines = [
      'pcmaain — CLI + MCP para PCMA AI Notifier',
      '',
      'Uso: pcmaain <comando> [subcomando] [opciones]',
      '',
      'Opciones globales:',
      '  --json          salida JSON estructurada',
      '  -h, --help      ayuda',
      '  -v, --version   versión',
      '',
      'Comandos:',
    ];
    for (const c of listCommands()) {
      lines.push(`  ${c.name.padEnd(18)} ${c.summary}`);
    }
    lines.push('', 'Config: env PCMA_AIN_API_URL/PCMA_AIN_API_KEY → ~/.pcmaain/config.json → PCMA_API_URL/PCMA_API_KEY → default');
    ctx.stdout.write(lines.join('\n') + '\n');
    return 0;
  },
};

function usageText(cmd) {
  return `${cmd.name}: ${cmd.summary}\n\nUso: ${cmd.usage}\n`;
}

module.exports = {
  HELP,
  health: {
    name: 'health',
    summary: 'Estado de la API (health check)',
    usage: 'pcmaain health [--json]',
    needsAuth: false,
    async run(ctx) {
      const data = await ctx.api.get('/health');
      emit(ctx, data, (d) => `status: ${d.status}\ndb: ${d.db}\nversion: ${d.version}\nuptime: ${d.uptime}s\ntimestamp: ${d.timestamp}`);
    },
  },
  version: {
    name: 'version',
    summary: 'Mostrar versión del CLI',
    usage: 'pcmaain version',
    needsAuth: false,
    async run(ctx) {
      const pkg = require('../../package.json');
      emit(ctx, { cli: pkg.version }, (d) => `pcmaain-cli ${d.cli}`);
    },
  },
  config: {
    name: 'config',
    summary: 'Ver/editar configuración (~/.pcmaain/config.json)',
    usage: 'pcmaain config <show|get <key>|set <key> <value>|path>',
    needsAuth: false,
    async run(ctx, parsed) {
      const [sub, key, value] = parsed._.slice(1);
      if (!sub) throw usageError('usage: pcmaain config <show|get <key>|set <key> <value>|path>');

      if (sub === 'path') {
        emit(ctx, { path: defaultConfigPath() }, (d) => d.path);
        return;
      }

      if (sub === 'show') {
        const c = loadConfig();
        const data = {
          apiUrl: c.apiUrl,
          apiKey: c.apiKey ? `${String(c.apiKey).slice(0, 6)}…${String(c.apiKey).slice(-4)}` : null,
          configPath: c.configPath,
          fileExists: c.fileExists,
          sources: c.sources,
        };
        emit(ctx, data, (d) => [
          `apiUrl: ${d.apiUrl} (${d.sources.apiUrl})`,
          `apiKey: ${d.apiKey || '(none)'} (${d.sources.apiKey || 'none'})`,
          `configPath: ${d.configPath}`,
          `fileExists: ${d.fileExists}`,
        ].join('\n'));
        return;
      }

      if (sub === 'get') {
        if (!key) throw usageError('usage: pcmaain config get <apiUrl|apiKey>');
        const c = loadConfig();
        const normalized = key === 'url' ? 'apiUrl' : key === 'key' ? 'apiKey' : key;
        if (!['apiUrl', 'apiKey'].includes(normalized)) throw usageError('invalid key (allowed: apiUrl, apiKey)');
        emit(ctx, { [normalized]: c[normalized] }, (d) => String(d[normalized] ?? ''));
        return;
      }

      if (sub === 'set') {
        if (!key || value === undefined) throw usageError('usage: pcmaain config set <apiUrl|apiKey> <value>');
        const result = setConfigValue(key, value);
        emit(ctx, result, (d) => `${d.key}=${String(d.value).slice(0, 6)}… escrito en ${d.filePath}`);
        return;
      }

      throw usageError(`unknown config subcommand "${sub}"`);
    },
  },
};
