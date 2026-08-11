'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadConfig, setConfigValue, DEFAULT_API_URL, defaultConfigPath } = require('../lib/config');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcmaain-config-'));

beforeEach(() => {
  delete process.env.PCMA_AIN_API_URL;
  delete process.env.PCMA_AIN_API_KEY;
  delete process.env.PCMA_AIN_CONFIG_PATH;
  delete process.env.NOTIFIER_CONFIG_PATH;
  delete process.env.PCMA_API_URL;
  delete process.env.PCMA_API_KEY;
});

afterEach(() => {
  delete process.env.PCMA_AIN_API_URL;
  delete process.env.PCMA_AIN_API_KEY;
  delete process.env.PCMA_AIN_CONFIG_PATH;
  delete process.env.NOTIFIER_CONFIG_PATH;
  delete process.env.PCMA_API_URL;
  delete process.env.PCMA_API_KEY;
});

test('default: URL por defecto y sin key', () => {
  const c = loadConfig();
  assert.strictEqual(c.apiUrl, DEFAULT_API_URL);
  assert.strictEqual(c.apiKey, null);
  assert.strictEqual(c.sources.apiUrl, 'default');
});

test('env PCMA_AIN_* tienen prioridad', () => {
  process.env.PCMA_AIN_API_URL = 'https://env.example';
  process.env.PCMA_AIN_API_KEY = 'env-key';
  const c = loadConfig();
  assert.strictEqual(c.apiUrl, 'https://env.example');
  assert.strictEqual(c.apiKey, 'env-key');
  assert.strictEqual(c.sources.apiUrl, 'env:PCMA_AIN_API_URL');
  assert.strictEqual(c.sources.apiKey, 'env:PCMA_AIN_API_KEY');
});

test('fallback a env legacy PCMA_*', () => {
  process.env.PCMA_API_URL = 'https://legacy.example';
  process.env.PCMA_API_KEY = 'legacy-key';
  const c = loadConfig();
  assert.strictEqual(c.apiUrl, 'https://legacy.example');
  assert.strictEqual(c.apiKey, 'legacy-key');
});

test('archivo de config vía NOTIFIER_CONFIG_PATH', () => {
  const file = path.join(tmp, 'custom.json');
  fs.writeFileSync(file, JSON.stringify({ apiUrl: 'https://file.example', apiKey: 'file-key' }));
  process.env.NOTIFIER_CONFIG_PATH = file;
  const c = loadConfig();
  assert.strictEqual(c.apiUrl, 'https://file.example');
  assert.strictEqual(c.apiKey, 'file-key');
  assert.strictEqual(c.sources.apiUrl, 'file');
  fs.unlinkSync(file);
});

test('env gana sobre el archivo', () => {
  const file = path.join(tmp, 'mixed.json');
  fs.writeFileSync(file, JSON.stringify({ apiUrl: 'https://file.example', apiKey: 'file-key' }));
  process.env.NOTIFIER_CONFIG_PATH = file;
  process.env.PCMA_AIN_API_KEY = 'env-key';
  const c = loadConfig();
  assert.strictEqual(c.apiUrl, 'https://file.example');
  assert.strictEqual(c.apiKey, 'env-key');
  fs.unlinkSync(file);
});

test('override explícito (configPath/apiKey) gana a todo', () => {
  process.env.PCMA_AIN_API_KEY = 'env-key';
  const c = loadConfig({ apiKey: 'override-key', apiUrl: 'https://override.example' });
  assert.strictEqual(c.apiKey, 'override-key');
  assert.strictEqual(c.apiUrl, 'https://override.example');
});

test('setConfigValue escribe y normaliza url/key', () => {
  const file = path.join(tmp, 'write.json');
  const r = setConfigValue('url', 'https://x.example', file);
  assert.strictEqual(r.key, 'apiUrl');
  const back = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(back.apiUrl, 'https://x.example');
  fs.unlinkSync(file);
});

test('setConfigValue rechaza claves inválidas', () => {
  assert.throws(() => setConfigValue('bogus', 'v'), (err) => err.code === 'USAGE');
});

test('defaultConfigPath apunta a ~/.pcmaain/config.json', () => {
  assert.ok(defaultConfigPath().endsWith(path.join('.pcmaain', 'config.json')));
});
