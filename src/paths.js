// Cross-platform paths. Claude Code uses ~/.claude on macOS, Linux, and Windows.
const os = require('os');
const path = require('path');
const fs = require('fs');

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');

module.exports = {
  HOME,
  CLAUDE_DIR,
  PROJECTS_DIR: path.join(CLAUDE_DIR, 'projects'),
  SKILLS_DIR: path.join(CLAUDE_DIR, 'skills'),
  AGENTS_DIR: path.join(CLAUDE_DIR, 'agents'),
  STATS_CACHE: path.join(CLAUDE_DIR, 'stats-cache.json'),
  // ccmaxx's own output dir (created on demand)
  OUT_DIR: path.join(HOME, '.ccmaxx'),
  FACTS: path.join(HOME, '.ccmaxx', 'usage_facts.json'),
  DYNAMIC_CHEATS: path.join(HOME, '.ccmaxx', 'cheats_dynamic.json'),
  CONFIG: path.join(HOME, '.ccmaxx', 'config.json'),
  ensureOut() {
    fs.mkdirSync(path.join(HOME, '.ccmaxx'), { recursive: true });
    return path.join(HOME, '.ccmaxx');
  },
};
