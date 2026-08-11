'use strict';

const { parseArgs } = require('./args');
const { loadConfig } = require('./config');
const { createClient, ApiError } = require('./client');
const { getCommand, listCommands } = require('./commands');

const VALUE_FLAGS = [
  'format', 'date', 'timeout', 'out', 'emoji', 'accent-color', 'prompt',
  'title', 'body', 'topic', 'topic-id', 'limit', 'offset', 'enabled',
];

async function run(argv, io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const stdin = io.stdin || process.stdin;

  const parsed = parseArgs(argv || [], { valueFlags: VALUE_FLAGS });

  if (parsed.flags.version || parsed.flags.v) {
    stdout.write(`${io.version || '0.0.0'}\n`);
    return 0;
  }

  const [cmdName] = parsed._;
  if (!cmdName || parsed.flags.help || parsed.flags.h) {
    const help = getCommand('help');
    await help.run({ stdout, stderr, json: false, config: loadConfig(), argv: parsed, stdin }, parsed);
    return cmdName ? 0 : 0;
  }

  const config = loadConfig();
  const api = createClient(config);
  const ctx = {
    api,
    config,
    json: !!parsed.flags.json,
    stdout,
    stderr,
    stdin,
    argv: parsed,
  };

  const cmd = getCommand(cmdName);
  if (!cmd) {
    stderr.write(`pcmaain: unknown command "${cmdName}". Run "pcmaain help".\n`);
    return 2;
  }

  try {
    const code = await cmd.run(ctx, parsed);
    return code === undefined ? 0 : code;
  } catch (err) {
    if (err instanceof ApiError) {
      stderr.write(`pcmaain: ${err.message}${err.status ? ` (HTTP ${err.status})` : ''}\n`);
      return 1;
    }
    if (err.code === 'USAGE') {
      stderr.write(`pcmaain: ${err.message}\n`);
      return 2;
    }
    stderr.write(`pcmaain: ${err.stack || err.message}\n`);
    return 1;
  }
}

module.exports = { run, listCommands };
