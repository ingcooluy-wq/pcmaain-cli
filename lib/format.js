'use strict';

// Formato de salida: JSON (--json) o tablas humanas para terminal.

function table(rows, columns) {
  if (!rows || rows.length === 0) return '(no rows)';
  const cols = columns || (typeof rows[0] === 'object' ? Object.keys(rows[0]) : ['value']);
  const normalized = rows.map((r) =>
    typeof r === 'object' ? r : Object.fromEntries(cols.map((c) => [c, r]))
  );
  const widths = cols.map((c) =>
    Math.max(c.length, ...normalized.map((r) => String(r[c] ?? '').length))
  );
  const fmt = (vals) => vals.map((v, i) => String(v).padEnd(widths[i])).join('  ').trimEnd();
  const lines = [fmt(cols), widths.map((w) => '-'.repeat(w)).join('  ')];
  for (const r of normalized) lines.push(fmt(cols.map((c) => r[c] ?? '')));
  return lines.join('\n');
}

function linesOf(array) {
  return (array || []).map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('\n');
}

module.exports = { table, linesOf };
