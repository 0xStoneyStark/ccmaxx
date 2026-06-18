#!/usr/bin/env node
require('../src/cli').main(process.argv.slice(2)).catch((e) => {
  console.error('ccmaxx error:', e && e.message ? e.message : e);
  process.exit(1);
});
