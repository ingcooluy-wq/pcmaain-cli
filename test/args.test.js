'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { parseArgs, coerce } = require('../lib/args');

test('coerce: true/false/number/string', () => {
  assert.strictEqual(coerce('true'), true);
  assert.strictEqual(coerce('false'), false);
  assert.strictEqual(coerce('42'), 42);
  assert.strictEqual(coerce('3.14'), 3.14);
  assert.strictEqual(coerce('text'), 'text');
  assert.strictEqual(coerce(''), '');
});

test('parseArgs: posicionales + flags booleanas', () => {
  const r = parseArgs(['generate', 'open-code', '--force', '--json']);
  assert.deepStrictEqual(r._, ['generate', 'open-code']);
  assert.strictEqual(r.flags.force, true);
  assert.strictEqual(r.flags.json, true);
});

test('parseArgs: --flag=value y --flag value (con valueFlags)', () => {
  const r = parseArgs(['generate', 'open-code', '--format=text', '--date', '2026-08-11'], { valueFlags: ['format', 'date'] });
  assert.strictEqual(r.flags.format, 'text');
  assert.strictEqual(r.flags.date, '2026-08-11');
});

test('parseArgs: flags booleanas no consumen el siguiente posicional', () => {
  const r = parseArgs(['--json', 'topics', 'list', '--admin'], { valueFlags: [] });
  assert.strictEqual(r.flags.json, true);
  assert.strictEqual(r.flags.admin, true);
  assert.deepStrictEqual(r._, ['topics', 'list']);
});

test('parseArgs: flag con valor omitido queda en true', () => {
  const r = parseArgs(['generate', 'x', '--date', '--json'], { valueFlags: ['date'] });
  assert.strictEqual(r.flags.date, true);
  assert.strictEqual(r.flags.json, true);
});

test('parseArgs: --force=false', () => {
  const r = parseArgs(['generate', 'x', '--force=false']);
  assert.strictEqual(r.flags.force, false);
});

test('parseArgs: doble guion corta flags', () => {
  const r = parseArgs(['audio', 'get', '--', '--weird']);
  assert.deepStrictEqual(r._, ['audio', 'get', '--weird']);
  assert.strictEqual(r.flags.weird, undefined);
});
