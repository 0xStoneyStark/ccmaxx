const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = os.homedir();
const FACTS = path.join(HOME, '.ccmaxx', 'usage_facts.json');
const DYNAMIC = path.join(HOME, '.ccmaxx', 'cheats_dynamic.json');
const BUNDLED = path.join(__dirname, '..', 'data', 'cheats.json');

function readJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; } }

// big number -> {value, num, prefix, suffix, dec} for the count-up animation
function kfmt(n, prefix) {
  prefix = prefix || '';
  if (n >= 1000) { const num = n / 1000; return { value: prefix + num.toFixed(1) + 'k', num, prefix, suffix: 'k', dec: 1 }; }
  const num = Math.round(n); return { value: prefix + num, num, prefix, suffix: '', dec: 0 };
}

function buildStats(f) {
  if (!f) return [];
  const cbt = f.cost_by_tier || {};
  const total = f.total_cost_estimate || 0;
  const opusPct = total > 0 ? Math.round((cbt.opus || 0) / total * 100) : 0;
  const cost = kfmt(total, '$');
  const msgs = kfmt(f.msg_assistant || 0);
  const tools = kfmt(f.tool_calls || 0);
  return [
    { label: 'est. compute', ...cost },
    { label: 'AI messages', ...msgs },
    { label: 'tool calls', ...tools },
    { label: 'active days', value: String(f.active_days || 0), num: f.active_days || 0, dec: 0 },
    { label: 'on Opus', value: opusPct + '%', num: opusPct, suffix: '%', dec: 0 },
    { label: 'agents spawned', value: String(f.agent_spawns_total || 0), num: f.agent_spawns_total || 0, dec: 0 },
  ];
}

function buildFromCheats() {
  const dyn = readJSON(DYNAMIC) || readJSON(BUNDLED) || { categories: [] };
  const cats = dyn.categories || [];
  const suggestions = [];
  const rows = [];
  for (const c of cats) {
    if (c.name === 'FOR YOU') {
      for (const it of (c.items || [])) {
        const tag = ['high', 'med', 'low'].includes(it.tag) ? it.tag : 'med';
        suggestions.push({ headline: it.label, reason: it.note, tag });
      }
    } else {
      const cat = c.name && c.name.startsWith('SETTINGS') ? 'SETTINGS' : c.name;
      for (const it of (c.items || [])) {
        rows.push({ category: cat, label: it.label, note: it.note, copy: it.copy });
      }
    }
  }
  return { suggestions, rows };
}

const facts = readJSON(FACTS);
const { suggestions, rows } = buildFromCheats();

contextBridge.exposeInMainWorld('ccApi', {
  stats: buildStats(facts),
  suggestions,
  rows,
  reload: () => {
    const f = readJSON(FACTS);
    const r = buildFromCheats();
    return { stats: buildStats(f), suggestions: r.suggestions, rows: r.rows };
  },
  onUpdate: (cb) => ipcRenderer.on('cheats-updated', () => cb()),
  copy: (t) => ipcRenderer.invoke('copy', t),
  setState: (w, h, corner) => ipcRenderer.send('set-state', { w, h, corner }),
  setOnTop: (v) => ipcRenderer.send('set-on-top', v),
  quit: () => ipcRenderer.send('quit'),
});
