// Streams every *.jsonl transcript under ~/.claude/projects and aggregates
// usage facts locally. No transcript content is persisted — only counts.
// Node port of the original Python extractor.
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const P = require('./paths');

const PRICE = {
  opus:   { in: 15, out: 75, cw: 18.75, cr: 1.5 },
  sonnet: { in: 3,  out: 15, cw: 3.75,  cr: 0.3 },
  haiku:  { in: 1,  out: 5,  cw: 1.25,  cr: 0.1 },
  fable:  { in: 15, out: 75, cw: 18.75, cr: 1.5 },
  other:  { in: 3,  out: 15, cw: 3.75,  cr: 0.3 },
};
const tierOf = (m) => {
  if (!m) return 'other';
  const s = String(m).toLowerCase();
  for (const k of ['opus', 'sonnet', 'haiku', 'fable']) if (s.includes(k)) return k;
  return 'other';
};

function walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(full);
  }
  return out;
}

function bin(counter, key, n = 1) { counter[key] = (counter[key] || 0) + n; }

function bashBinary(cmd) {
  if (!cmd) return null;
  for (let tok of String(cmd).trim().split(/\s+/)) {
    if (tok.includes('=') && !tok.startsWith('-')) continue;
    if (['sudo', '&&', '||', ';', 'time'].includes(tok)) continue;
    const m = tok.match(/^([a-zA-Z0-9_.\-]+)/);
    return m ? m[1] : null;
  }
  return null;
}
function extOf(fp) {
  if (!fp) return null;
  const b = path.basename(fp);
  if (b.includes('.')) { const e = b.split('.').pop().toLowerCase(); if (e.length >= 1 && e.length <= 6) return e; }
  return 'noext';
}

async function parseFile(file, agg) {
  await new Promise((resolve) => {
    let stream;
    try { stream = fs.createReadStream(file, { encoding: 'utf-8' }); }
    catch { return resolve(); }
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    rl.on('line', (line) => {
      line = line.trim();
      if (!line) return;
      let o;
      try { o = JSON.parse(line); } catch { return; } // skips corrupt/in-flight last lines
      const t = o.type;
      const ts = o.timestamp;
      if (ts) {
        const d = ts.slice(0, 10);
        agg.dates.add(d);
        const hh = parseInt(ts.slice(11, 13), 10);
        if (!Number.isNaN(hh)) bin(agg.byHourUTC, hh);
      }
      if (t === 'assistant') {
        agg.msgAssistant++;
        const m = o.message || {};
        const model = m.model || '(none)';
        bin(agg.models, model);
        const tr = tierOf(model);
        const u = m.usage || {};
        const ti = u.input_tokens || 0, to = u.output_tokens || 0;
        const cw = u.cache_creation_input_tokens || 0, cr = u.cache_read_input_tokens || 0;
        const pr = PRICE[tr];
        agg.costByTier[tr] = (agg.costByTier[tr] || 0) + (ti * pr.in + to * pr.out + cw * pr.cw + cr * pr.cr) / 1e6;
        for (const b of (m.content || [])) {
          if (!b || typeof b !== 'object' || b.type !== 'tool_use') continue;
          const name = b.name || '?';
          const inp = b.input || {};
          agg.toolCalls++;
          bin(agg.tools, name);
          if (name.startsWith('mcp__')) { const parts = name.split('__'); if (parts[1]) bin(agg.mcp, parts[1]); }
          else if (name === 'Bash') { const bb = bashBinary(inp.command); if (bb) bin(agg.bash, bb); }
          else if (['Edit', 'Write', 'Read', 'NotebookEdit'].includes(name)) { const e = extOf(inp.file_path || inp.notebook_path); if (e) bin(agg.ext, e); }
          else if (name === 'Task' || name === 'Agent') bin(agg.agents, inp.subagent_type || '(generic)');
          else if (name === 'Skill') bin(agg.skills, inp.skill || '?');
          else if (name === 'Workflow') agg.workflowRuns++;
          else if (name === 'TodoWrite') agg.todoWrites++;
        }
      } else if (t === 'user') {
        agg.msgUser++;
      }
    });
    rl.on('close', resolve);
    rl.on('error', resolve);
  });
}

async function extract({ onProgress } = {}) {
  const files = walk(P.PROJECTS_DIR, []);
  const agg = {
    dates: new Set(), msgAssistant: 0, msgUser: 0, toolCalls: 0, workflowRuns: 0, todoWrites: 0,
    models: {}, costByTier: {}, tools: {}, mcp: {}, bash: {}, ext: {}, agents: {}, skills: {}, byHourUTC: {},
  };
  let done = 0;
  for (const f of files) {
    await parseFile(f, agg);
    if (onProgress && (++done % 25 === 0 || done === files.length)) onProgress(done, files.length);
  }
  const top = (obj, n = 40) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);
  const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
  const facts = {
    generated_at: new Date().toISOString(),
    files_scanned: files.length,
    active_days: agg.dates.size,
    msg_assistant: agg.msgAssistant,
    msg_user: agg.msgUser,
    tool_calls: agg.toolCalls,
    workflow_runs: agg.workflowRuns,
    todo_writes: agg.todoWrites,
    agent_spawns_total: sum(agg.agents),
    skill_calls_total: sum(agg.skills),
    total_cost_estimate: Math.round(Object.values(agg.costByTier).reduce((a, b) => a + b, 0) * 100) / 100,
    cost_by_tier: Object.fromEntries(Object.entries(agg.costByTier).map(([k, v]) => [k, Math.round(v * 100) / 100])),
    models: top(agg.models, 12),
    tools: top(agg.tools, 30),
    mcp: top(agg.mcp, 20),
    bash_bins: top(agg.bash, 20),
    file_ext: top(agg.ext, 20),
    agent_spawns: top(agg.agents, 20),
    skills: top(agg.skills, 20),
    by_hour_utc: Array.from({ length: 24 }, (_, h) => agg.byHourUTC[h] || 0),
  };
  P.ensureOut();
  fs.writeFileSync(P.FACTS, JSON.stringify(facts, null, 1));
  return facts;
}

module.exports = { extract };
