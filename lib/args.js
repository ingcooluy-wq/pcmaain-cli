'use strict';

// Parser de argumentos mínimo (0 deps):
//   --flag            → boolean true (salvo que esté en `valueFlags`)
//   --flag=value      → value (coercion: true/false/number/string)
//   --flag value      → value SOLO si el flag toma valor y el siguiente no arranca con '-'
//   -x                → boolean true (alias corto)
//   --                → todo lo siguiente es posicional
//   `_`               → posicionales
function parseArgs(argv, opts = {}) {
  const known = new Set(opts.valueFlags || []);
  const result = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') {
      result._.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      let name = a.slice(2);
      let value;
      const eq = name.indexOf('=');
      if (eq !== -1) {
        value = name.slice(eq + 1);
        name = name.slice(0, eq);
      }
      if (value === undefined) {
        if (known.has(name)) {
          const next = argv[i + 1];
          if (next !== undefined && next !== '' && !next.startsWith('-')) {
            value = next;
            i++;
          } else {
            value = true;
          }
        } else {
          value = true;
        }
      }
      result.flags[name] = coerce(value);
    } else if (a.startsWith('-') && a.length > 1 && !/^-\d/.test(a)) {
      result.flags[a.slice(1)] = true;
    } else {
      result._.push(a);
    }
  }
  return result;
}

function coerce(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  const num = Number(value);
  if (value !== '' && !Number.isNaN(num) && /^-?\d+(\.\d+)?$/.test(value)) return num;
  return value;
}

module.exports = { parseArgs, coerce };
