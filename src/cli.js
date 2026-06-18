// ccmaxx CLI — Claude Code, maxxed.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const P = require('./paths');
const { extract } = require('./extractor');
const { recommend } = require('./recommender');

const pkg = require('../package.json');
const C = { dim: '\x1b[2m', b: '\x1b[1m', cyan: '\x1b[36m', grn: '\x1b[32m', yel: '\x1b[33m', mag: '\x1b[35m', r: '\x1b[0m' };
const fmt = (n) => (n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n));

function loadFacts() { try { return JSON.parse(fs.readFileSync(P.FACTS, 'utf-8')); } catch { return null; } }
function freshEnough(maxAgeMs) {
  try { return Date.now() - fs.statSync(P.FACTS).mtimeMs < maxAgeMs; } catch { return false; }
}

async function doScan({ force } = {}) {
  if (!force && freshEnough(60 * 60 * 1000)) return loadFacts();
  process.stdout.write(`${C.dim}scanning ~/.claude/projects …${C.r}`);
  const facts = await extract({
    onProgress: (d, t) => { process.stdout.write(`\r${C.dim}scanning … ${d}/${t} files${C.r}   `); },
  });
  process.stdout.write('\r' + ' '.repeat(50) + '\r');
  recommend(facts);
  return facts;
}

function printSummary(f) {
  if (!f) { console.log('no usage data yet — run `ccmaxx scan`'); return; }
  const tiers = Object.entries(f.cost_by_tier || {}).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]);
  console.log(`\n${C.b}${C.cyan}ccmaxx${C.r} ${C.dim}· Claude Code, maxxed${C.r}\n`);
  console.log(`  ${C.b}${fmt(f.msg_assistant)}${C.r} AI messages   ${C.b}${fmt(f.tool_calls)}${C.r} tool calls   ${C.b}${f.active_days}${C.r} active days`);
  console.log(`  ${C.b}$${(f.total_cost_estimate || 0).toLocaleString()}${C.r} est. compute   ${C.dim}(${tiers.map(([k, v]) => `${k} $${Math.round(v).toLocaleString()}`).join('  ')})${C.r}`);
  const topTools = (f.tools || []).slice(0, 6).map((t) => `${t[0]} ${fmt(t[1])}`).join('  ');
  console.log(`  ${C.dim}tools:${C.r} ${topTools}`);
  console.log(`  ${C.dim}agents:${C.r} ${f.agent_spawns_total} spawned   ${C.dim}skills:${C.r} ${f.skill_calls_total} used   ${C.dim}workflows:${C.r} ${f.workflow_runs}`);
}

function printSuggestions() {
  let dyn; try { dyn = JSON.parse(fs.readFileSync(P.DYNAMIC_CHEATS, 'utf-8')); } catch { dyn = null; }
  const fy = dyn && dyn.categories.find((c) => c.name === 'FOR YOU');
  if (!fy || !fy.items.length) { console.log('No personalized suggestions yet — run `ccmaxx scan`.'); return; }
  console.log(`\n${C.b}${C.mag}⚡ FOR YOU${C.r}  ${C.dim}(personalized from your logs)${C.r}\n`);
  fy.items.forEach((it, i) => {
    console.log(`  ${C.b}${i + 1}. ${it.label}${C.r}`);
    console.log(`     ${C.dim}${it.note}${C.r}`);
    console.log(`     ${C.grn}${it.copy.length > 90 ? it.copy.slice(0, 88) + '…' : it.copy}${C.r}\n`);
  });
}

function launchWidget() {
  let electron;
  try { electron = require('electron'); } catch { console.error('electron not installed — run `npm install` in the ccmaxx folder.'); return; }
  const appDir = path.join(__dirname, '..', 'app');
  const child = spawn(electron, [appDir], { detached: true, stdio: 'ignore' });
  child.unref();
  console.log(`${C.dim}widget launched (top-right).${C.r}`);
}

function help() {
  console.log(`
${C.b}${C.cyan}ccmaxx${C.r} ${C.dim}v${pkg.version} · Claude Code, maxxed${C.r}

  ${C.b}ccmaxx${C.r}            scan (if stale) + show summary + launch widget
  ${C.b}ccmaxx scan${C.r}       re-scan your logs → regenerate personalized cheats
  ${C.b}ccmaxx scan -f${C.r}    force a full rescan
  ${C.b}ccmaxx suggest${C.r}    print your top personalized suggestions
  ${C.b}ccmaxx stats${C.r}      usage summary  ${C.dim}(--json for raw)${C.r}
  ${C.b}ccmaxx widget${C.r}     launch the floating widget only
  ${C.b}ccmaxx refresh${C.r}    rescan; an open widget hot-reloads
  ${C.b}ccmaxx help${C.r}       this

  ${C.dim}100% local. Nothing leaves your machine.${C.r}
`);
}

async function main(argv) {
  const cmd = (argv[0] || 'default').toLowerCase();
  const force = argv.includes('-f') || argv.includes('--force');
  switch (cmd) {
    case 'help': case '-h': case '--help': return help();
    case 'version': case '-v': case '--version': return console.log(pkg.version);
    case 'widget': return launchWidget();
    case 'scan': { const f = await doScan({ force: true }); printSummary(f); printSuggestions(); return; }
    case 'refresh': { const f = await doScan({ force: true }); printSummary(f); console.log(`${C.dim}an open widget will hot-reload.${C.r}`); return; }
    case 'stats': {
      let f = loadFacts(); if (!f) f = await doScan({ force: true });
      if (argv.includes('--json')) return console.log(JSON.stringify(f, null, 2));
      return printSummary(f);
    }
    case 'suggest': { let f = loadFacts(); if (!f) f = await doScan({ force: true }); else recommend(f); printSuggestions(); return; }
    case 'default': {
      const f = await doScan({ force });
      printSummary(f); printSuggestions(); launchWidget(); return;
    }
    default: console.log(`unknown command: ${cmd}`); help();
  }
}

module.exports = { main };
