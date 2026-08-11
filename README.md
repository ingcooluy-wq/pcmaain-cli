# pcmaain-cli

CLI + MCP server para **PCMA AI Notifier** (bin: `pcmaain`).

Opera el sistema desde la terminal o desde OpenCode vía MCP: health, tópicos,
generación on-demand, estado de jobs, cuota Gemini, notificaciones y audio.

- **Cero dependencias** (solo Node ≥ 18 con `fetch` global).
- Exit codes: `0` ok · `1` error de API/runtime · `2` error de uso.
- Salida `--json` global para scripting.

## Instalación

```bash
npm install -g pcmaain-cli
```

## Configuración (orden de resolución)

1. Env: `PCMA_AIN_API_URL` / `PCMA_AIN_API_KEY`
2. Archivo: `~/.pcmaain/config.json` (o `NOTIFIER_CONFIG_PATH`)
3. Env legacy: `PCMA_API_URL` / `PCMA_API_KEY`
4. Default: `https://pcma-notifier-api.onrender.com`

```bash
pcmaain config set apiUrl https://pcma-notifier-api.onrender.com
pcmaain config set apiKey <tu-x-api-key>
pcmaain config show
```

Los comandos públicos (`health`, `topics list`, `status`, `notifications`, `audio`)
no requieren API key; los admin (`topics create/edit/delete`, `generate`, `run`,
`quota`, `push test`) sí.

## Comandos

| Comando | Descripción |
|---|---|
| `pcmaain health` | Health check de la API |
| `pcmaain topics list [--admin]` | Tópicos públicos (solo enabled); `--admin` todos (key) |
| `pcmaain topics show <id>` | Detalle de un tópico |
| `pcmaain topics create <id> <title> [--emoji E] [--accent-color C] [--prompt P]` | Crear (el id se auto-slugifica: minúsculas + `[a-z0-9-]`) |
| `pcmaain topics edit <id> [--title T] [--emoji E] [--accent-color C] [--prompt P] [--enabled true\|false]` | Editar |
| `pcmaain topics enable\|disable <id>` | Habilitar / deshabilitar |
| `pcmaain topics delete <id> --yes` | Eliminar (el historial queda intacto) |
| `pcmaain generate <id> [--format text\|text+audio\|audio] [--date YYYY-MM-DD] [--push] [--email] [--force] [--wait] [--timeout S] [--out file]` | Generación on-demand (async 202 + poll) |
| `pcmaain status [--date YYYY-MM-DD] [--topic-id ID]` | Estado de los jobs del día |
| `pcmaain run <daily\|retry>` | Disparar job manual |
| `pcmaain notifications list [--limit N] [--offset N]` | Historial |
| `pcmaain notifications get <date> [--topic-id ID]` | Notificaciones de una fecha |
| `pcmaain audio get <date> <topicId> [--out file]` | Audio de una notificación (descarga o URL) |
| `pcmaain quota [--date YYYY-MM-DD]` | Cuota per-model del día (key) |
| `pcmaain push test [--title T] [--body B] [--topic ID]` | Push de prueba (key) |
| `pcmaain config <show\|get\|set\|path>` | Configuración |
| `pcmaain mcp` | Servidor MCP sobre stdio |
| `pcmaain help [command]` · `pcmaain version` | Ayuda / versión |

### Ejemplos

```bash
pcmaain health
pcmaain topics list
pcmaain generate open-code --format text --wait --json
pcmaain generate open-code --force --format text+audio --wait --out audio.mp3
pcmaain status --date 2026-08-11
pcmaain audio get 2026-08-11 kiro-cli --out kiro.mp3
```

`generate --wait` hace poll de `/jobs/status` hasta `completed`/`exhausted`
(intervalo configurable con env `PCMA_AIN_POLL_MS`, default 5000 ms) y, si el
formato trae audio y se pasa `--out`, descarga el mp3.

## MCP server (OpenCode / agentes)

El comando `pcmaain mcp` levanta un servidor JSON-RPC sobre stdio (protocolo MCP
2025-03-26) con las tools `pcmaain_health`, `pcmaain_topics_list`,
`pcmaain_generate`, `pcmaain_status`, `pcmaain_quota`,
`pcmaain_notifications_get`.

### Snippet OpenCode

```jsonc
// opencode.json (global: ~/.config/opencode/opencode.json, o por proyecto)
{
  "mcp": {
    "pcmaain": {
      "type": "local",
      "command": ["pcmaain", "mcp"],
      "enabled": true
    }
  }
}
```

La config de `pcmaain` (URL/key) se resuelve igual que el CLI: env
`PCMA_AIN_API_URL`/`PCMA_AIN_API_KEY` o `~/.pcmaain/config.json`. Para que el
agente use admin/generate, setear la API key (p.ej. `pcmaain config set apiKey
<key>`).

## Tests

```bash
npm test    # node --test test/*.test.js (stubs HTTP, sin red)
```

## Licencia

MIT
