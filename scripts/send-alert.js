'use strict';

// Helper para avisar por mail a ing.cool.uy@gmail.com cuando la sesión necesita
// intervención del usuario. Usa la API de Brevo (igual que el digest del notifier).
// Uso: node scripts/send-alert.js [--subject "x"] [--body "y" | --body-file path]
// Lee BREVO_API_KEY y GMAIL_USER del .env del API (ruta default o PCMA_API_ENV).

const fs = require('fs');
const path = require('path');

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function parseArgs(argv) {
  const out = { subject: null, body: null, bodyFile: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--subject') out.subject = argv[++i];
    else if (a.startsWith('--subject=')) out.subject = a.slice('--subject='.length);
    else if (a === '--body') out.body = argv[++i];
    else if (a.startsWith('--body=')) out.body = a.slice('--body='.length);
    else if (a === '--body-file') out.bodyFile = argv[++i];
    else if (a.startsWith('--body-file=')) out.bodyFile = a.slice('--body-file='.length);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const envPath = process.env.PCMA_API_ENV
    || path.join(__dirname, '..', '..', 'pcma-notifier-api', '.env');
  const env = loadEnv(envPath);

  const apiKey = process.env.BREVO_API_KEY || env.BREVO_API_KEY;
  const senderEmail = process.env.GMAIL_USER || env.GMAIL_USER || 'ing.cool.uy@gmail.com';
  if (!apiKey) {
    console.error('BREVO_API_KEY not found (env or API .env). Cannot send email.');
    process.exit(1);
  }

  const body = args.bodyFile
    ? fs.readFileSync(args.bodyFile, 'utf8')
    : (args.body || 'Se requiere tu atención en la sesión de opencode.');
  const subject = args.subject || '⚠️ PCMA Notifier — se requiere tu atención';

  const html = `<div style="font-family:system-ui,sans-serif;line-height:1.5">
    <p>${body.split(/\r?\n/).map((l) => `<p>${escapeHtml(l)}</p>`).join('')}
    <hr style="border:none;border-top:1px solid #eee">
    <p style="color:#888;font-size:12px">Enviado automáticamente por la sesión de opencode (Plan B pcmaain-cli).</p>
  </div>`;

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'PCMA OpenCode Session', email: senderEmail },
      to: [{ email: 'ing.cool.uy@gmail.com' }],
      subject,
      htmlContent: html,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`Brevo error ${res.status}: ${text}`);
    process.exit(1);
  }
  console.log('Email sent.');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

main().catch((err) => { console.error(err); process.exit(1); });
