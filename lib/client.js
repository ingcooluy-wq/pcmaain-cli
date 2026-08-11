'use strict';

// Cliente HTTP mínimo (0 deps, Node >= 18 con fetch global).
// Autentica con header X-API-Key si hay apiKey configurado (endpoints públicos no lo requieren).

class ApiError extends Error {
  constructor(message, { status, code, body } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

function createClient({ apiUrl, apiKey }) {
  const base = String(apiUrl || '').replace(/\/+$/, '');

  async function request(method, path, { query, json, headers } = {}) {
    let url;
    try {
      url = new URL(base + (path || ''));
    } catch (err) {
      throw new ApiError(`Invalid API URL: ${base}`, { status: 0 });
    }

    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }

    const h = { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers };
    if (apiKey) h['X-API-Key'] = apiKey;

    let res;
    try {
      res = await fetch(url.toString(), {
        method,
        headers: h,
        body: json !== undefined ? JSON.stringify(json) : undefined,
      });
    } catch (err) {
      throw new ApiError(`Network error: ${err.message}`, { status: 0 });
    }

    const text = await res.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = text; }
    }

    if (!res.ok) {
      const msg = (data && typeof data === 'object' && (data.message || data.error))
        ? String(data.message || data.error)
        : `HTTP ${res.status}`;
      throw new ApiError(msg, {
        status: res.status,
        code: data && typeof data === 'object' ? data.error : undefined,
        body: data,
      });
    }

    return data;
  }

  return {
    base,
    get: (path, opts) => request('GET', path, opts),
    post: (path, opts) => request('POST', path, opts),
    patch: (path, opts) => request('PATCH', path, opts),
    delete: (path, opts) => request('DELETE', path, opts),
    request,
  };
}

// Descarga binaria (audio) a un archivo local.
async function downloadToFile(url, filePath, { writeFile } = {}) {
  const write = writeFile || require('fs').writeFileSync;
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new ApiError(`Network error downloading audio: ${err.message}`, { status: 0 });
  }
  if (!res.ok) {
    throw new ApiError(`Audio download failed: HTTP ${res.status}`, { status: res.status });
  }
  const buf = Buffer.from(await res.arrayBuffer());
  write(filePath, buf);
  return { filePath, bytes: buf.length, contentType: res.headers.get('content-type') };
}

module.exports = { createClient, ApiError, downloadToFile };
