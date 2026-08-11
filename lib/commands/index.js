'use strict';

const core = require('./core');
const topics = require('./topics');
const generate = require('./generate');
const jobs = require('./jobs');
const notifications = require('./notifications');
const quota = require('./quota');

const mcpCommand = {
  name: 'mcp',
  summary: 'Servidor MCP sobre stdio (para OpenCode / agentes)',
  usage: 'pcmaain mcp',
  needsAuth: false,
  async run(ctx) {
    const { createMcpServer } = require('../mcp');
    const pkg = require('../../package.json');
    if (ctx.stderr) ctx.stderr.write(`pcmaain mcp: server started (tools pcmaain_*)\n`);
    createMcpServer({ config: ctx.config, stdout: ctx.stdout, stdin: ctx.stdin, stderr: ctx.stderr, version: pkg.version });
    await new Promise(() => {}); // queda escuchando en stdin
  },
};

const COMMANDS = [];
function register(...items) {
  for (const item of items) {
    if (Array.isArray(item)) register(...item);
    else COMMANDS.push(item);
  }
}
register(
  core.HELP, core.health, core.version, core.config,
  topics, generate, jobs, notifications, quota, mcpCommand
);

const MAP = new Map(COMMANDS.map((c) => [c.name, c]));

function getCommand(name) {
  return MAP.get(name);
}

function listCommands() {
  return COMMANDS;
}

module.exports = { getCommand, listCommands };
