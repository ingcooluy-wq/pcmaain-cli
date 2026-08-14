# AGENTS.md — pcmaain-cli

Guía para agentes de IA que trabajen sobre este repo (`gxc-ai-dlc/src/pcma-notifier-cli`).
CLI + MCP server que opera el ecosistema **PCMA AI Notifier** desde la terminal o desde
OpenCode (bin global `pcmaain`).

## Comandos

- Tests: `npm test` (runner Node `node --test test/*.test.js`; stubs HTTP, sin red).
- Ejecutar local: `node bin/pcmaain.js <comando>` o `node lib/index.js`.
- Sin build step (CommonJS, Node ≥ 18 con `fetch` global). **Cero dependencias.**
- Exit codes: `0` ok · `1` error API/runtime · `2` error de uso.

## Arquitectura (resumen)

- `bin/pcmaain.js` — entrypoint, registra comandos y subcomandos.
- `lib/` — implementación: `http.js` (client fetch), `config.js` (resolución de config),
  `commands/*.js`, `mcp.js` (server JSON-RPC sobre stdio, protocolo MCP 2025-03-26).
- Tools MCP expuestas: `pcmaain_health`, `pcmaain_topics_list`, `pcmaain_generate`,
  `pcmaain_status`, `pcmaain_quota`, `pcmaain_notifications_get`.

## Configuración (orden de resolución)

1. Env: `PCMA_AIN_API_URL` / `PCMA_AIN_API_KEY`
2. Archivo: `~/.pcmaain/config.json` (o `NOTIFIER_CONFIG_PATH`)
3. Env legacy: `PCMA_API_URL` / `PCMA_API_KEY`
4. Default: `https://pcma-notifier-api.onrender.com`

Comandos admin (`topics create/edit/delete`, `generate`, `run`, `quota`, `push test`)
requieren API key; los públicos (`health`, `topics list`, `status`, `notifications`,
`audio`) no.

## Reglas del repo

- No commitear secretos ni tokens (API key, Telegram, mailbox). La config se resuelve
  desde env o `~/.pcmaain/config.json`; nunca hardcodear credenciales.
- `generate --wait` hace poll de `/jobs/status` hasta `completed`/`exhausted`
  (intervalo `PCMA_AIN_POLL_MS`, default 5000 ms).
- Compatibilidad: mantener las tools MCP y el contrato con la API (`/topics`,
  `/jobs/status`, `/quota/status`, `/notifications`, `/audio`) — ver `README.md`.
