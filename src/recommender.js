// Reads installed skills/agents + usage facts, applies the rule catalog,
// and writes a personalized cheats_dynamic.json the widget consumes.
const fs = require('fs');
const path = require('path');
const P = require('./paths');
const { RULE_CATALOG, signals } = require('./rules');

const BASE_CHEATS = path.join(__dirname, '..', 'data', 'cheats.json');

function loadInventory() {
  const agents = new Set();
  const skills = new Set();
  try {
    for (const f of fs.readdirSync(P.AGENTS_DIR)) {
      if (f.endsWith('.md')) agents.add(f.replace(/\.md$/, ''));
    }
  } catch {}
  try {
    for (const e of fs.readdirSync(P.SKILLS_DIR, { withFileTypes: true })) {
      skills.add(e.name.replace(/\.md$/, ''));
    }
  } catch {}
  return { agents, skills };
}

function recommend(facts) {
  const base = JSON.parse(fs.readFileSync(BASE_CHEATS, 'utf-8'));
  const inv = loadInventory();
  const s = signals(facts);

  // run rules → personalized items
  const items = [];
  for (const rule of RULE_CATALOG) {
    let r;
    try { r = rule.run(s, inv); } catch { r = null; }
    if (r) items.push(r);
  }
  items.sort((a, b) => b.priority - a.priority);
  // dedupe by label (e.g. file-ext-specialist and specialist-agents can both suggest the same agent);
  // items are priority-sorted, so the first occurrence (highest priority) wins.
  const seen = new Set();
  const deduped = items.filter((i) => {
    const k = String(i.label).trim().toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
  const tagFor = (p) => (p >= 90 ? 'high' : p >= 70 ? 'med' : 'low');
  // Note: AGENTS are inventory-validated below and in the rules; SKILLS are NOT filtered against
  // ~/.claude/skills because most skills ship via plugins/ECC (not that dir), so filtering would
  // wrongly drop valid core skills. Rules only reference broadly-available skills + installed agents.
  const forYou = deduped.slice(0, 8).map((i) => ({ label: i.label, note: i.note, copy: i.copy, tag: tagFor(i.priority) }));

  // filter the AGENTS category to specialists the user actually has (if we could read any)
  const categories = base.categories.map((c) => {
    if (c.name === 'AGENTS' && inv.agents.size > 0) {
      const kept = c.items.filter((it) => {
        const name = String(it.label).split(' ')[0];
        return inv.agents.has(name) || ['Explore'].includes(name);
      });
      return { ...c, items: kept.length ? kept : c.items };
    }
    return c;
  });

  const dynamic = {
    generated_at: new Date().toISOString(),
    personalized: forYou.length > 0,
    categories: forYou.length
      ? [{ name: 'FOR YOU', items: forYou }, ...categories]
      : categories,
  };

  P.ensureOut();
  fs.writeFileSync(P.DYNAMIC_CHEATS, JSON.stringify(dynamic, null, 1));
  return { forYou, inventory: { agents: inv.agents.size, skills: inv.skills.size } };
}

module.exports = { recommend, loadInventory };
