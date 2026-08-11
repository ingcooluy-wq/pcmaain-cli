'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_API_URL = 'https://pcma-notifier-api.onrender.com';
const CONFIG_DIR_NAME = '.pcmaain';
const CONFIG_FILE_NAME = 'config.json';

function defaultConfigPath() {
  return path.join(os.homedir(), CONFIG_DIR_NAME, CONFIG_FILE_NAME);
}

// Orden de resolución (documentado en README):
//   1. env PCMA_AIN_API_URL / PCMA_AIN_API_KEY  (prefijo moderno)
//   2. archivo de config (~/.pcmaain/config.json o NOTIFIER_CONFIG_PATH)
//   3. env legacy PCMA_API_URL / PCMA_API_KEY
//   4. default https://pcma-notifier-api.onrender.com
function loadConfig(overrides) {
  const envPath = process.env.NOTIFIER_CONFIG_PATH || process.env.PCMA_AIN_CONFIG_PATH;
  const filePath = overrides && overrides.configPath
    ? overrides.configPath
    : (envPath || defaultConfigPath());

  let file = {};
  try {
    if (filePath && fs.existsSync(filePath)) {
      file = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {
    // config inválida no debe romper el CLI; se avisa y se usa el resto.
    file = { __error: err.message };
  }

  const apiUrl =
    overrides && overrides.apiUrl
      ? overrides.apiUrl
      : process.env.PCMA_AIN_API_URL || process.env.PCMA_API_URL || file.apiUrl || DEFAULT_API_URL;

  const apiKey =
    overrides && overrides.apiKey !== undefined
      ? overrides.apiKey
      : process.env.PCMA_AIN_API_KEY || process.env.PCMA_API_KEY || file.apiKey || null;

  return {
    apiUrl: String(apiUrl).replace(/\/+$/, ''),
    apiKey,
    configPath: filePath,
    fileExists: file && !file.__error && fs.existsSync(filePath),
    fileError: file && file.__error,
    sources: {
      apiUrl: overrides && overrides.apiUrl ? 'override'
        : process.env.PCMA_AIN_API_URL ? 'env:PCMA_AIN_API_URL'
        : process.env.PCMA_API_URL ? 'env:PCMA_API_URL'
        : file.apiUrl ? 'file' : 'default',
      apiKey: overrides && overrides.apiKey !== undefined ? 'override'
        : process.env.PCMA_AIN_API_KEY ? 'env:PCMA_AIN_API_KEY'
        : process.env.PCMA_API_KEY ? 'env:PCMA_API_KEY'
        : file.apiKey ? 'file' : null,
    },
  };
}

function setConfigValue(key, value, configPath) {
  const filePath = configPath || defaultConfigPath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let file = {};
  if (fs.existsSync(filePath)) {
    file = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  const normalizedKey = key === 'url' ? 'apiUrl' : key === 'key' ? 'apiKey' : key;
  if (!['apiUrl', 'apiKey'].includes(normalizedKey)) {
    const err = new Error(`Invalid config key: ${key} (allowed: apiUrl, apiKey)`);
    err.code = 'USAGE';
    throw err;
  }

  file[normalizedKey] = value;
  fs.writeFileSync(filePath, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
  return { filePath, key: normalizedKey, value };
}

module.exports = {
  DEFAULT_API_URL,
  defaultConfigPath,
  loadConfig,
  setConfigValue,
};
