'use strict';

const { table } = require('../format');

function emit(ctx, data, render) {
  if (ctx.json) {
    ctx.stdout.write(JSON.stringify(data, null, 2) + '\n');
  } else if (render) {
    ctx.stdout.write(render(data) + '\n');
  } else {
    ctx.stdout.write(JSON.stringify(data, null, 2) + '\n');
  }
}

function usageError(message) {
  const err = new Error(message);
  err.code = 'USAGE';
  return err;
}

module.exports = { emit, usageError, table };
