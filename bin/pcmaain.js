#!/usr/bin/env node
'use strict';

const { run } = require('../lib/cli');
const pkg = require('../package.json');

run(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
  stdin: process.stdin,
  version: pkg.version,
}).then((code) => {
  process.exitCode = code;
}).catch((err) => {
  process.stderr.write(`pcmaain: unexpected error: ${err.stack || err.message}\n`);
  process.exitCode = 1;
});
