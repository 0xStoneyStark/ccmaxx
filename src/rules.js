// Deterministic rule catalog: usage signal -> grounded suggestion.
// Every suggestion references a REAL Claude Code feature. No hallucination.
// Each rule returns null or an item {priority, label, note, copy}.

// extension -> {language, reviewer agent}
const LANG = {
  py: ['Python', 'python-reviewer'], cs: ['C#', 'csharp-reviewer'],
  jsx: ['React', 'react-reviewer'], tsx: ['React/TS', 'react-reviewer'],
  ts: ['TypeScript', 'typescript-reviewer'], js: ['JavaScript', 'typescript-reviewer'],
  go: ['Go', 'go-reviewer'], rs: ['Rust', 'rust-reviewer'],
  java: ['Java', 'java-reviewer'], kt: ['Kotlin', 'kotlin-reviewer'],
  swift: ['Swift', 'swift-reviewer'], cpp: ['C++', 'cpp-reviewer'],
};

function signals(facts) {
  const m = (arr, k) => { const f = (arr || []).find((x) => x[0] === k); return f ? f[1] : 0; };
  const total = facts.total_cost_estimate || 0;
  const cbt = facts.cost_by_tier || {};
  const spawns = facts.agent_spawns || [];
  const totalSpawns = spawns.reduce((a, b) => a + b[1], 0);
  const generic = spawns.filter((s) => /generic|general|default/.test(s[0])).reduce((a, b) => a + b[1], 0);
  const exts = facts.file_ext || [];
  const extTotal = exts.reduce((a, b) => a + b[1], 0);
  const topProject = (facts.projects || [])[0] || null;
  return {
    total,
    opusShare: total > 0 ? (cbt.opus || 0) / total : 0,
    haikuShare: total > 0 ? (cbt.haiku || 0) / total : 0,
    skillCalls: facts.skill_calls_total || 0,
    workflowRuns: facts.workflow_runs || 0,
    totalSpawns,
    genericShare: totalSpawns > 0 ? generic / totalSpawns : 0,
    cd: m(facts.bash_bins, 'cd'),
    webSearch: m(facts.tools, 'WebSearch'),
    reads: m(facts.tools, 'Read'),
    codegraph: m(facts.mcp, 'codegraph'),
    exploreSpawns: m(facts.agent_spawns, 'Explore'),
    topExts: exts.map((x) => x[0]),
    topExt: exts.length ? exts[0][0] : null,
    extShare: extTotal > 0 ? exts[0][1] / extTotal : 0,
    cacheRatio: facts.cache_ratio || 0,
    cacheTot: (facts.cache_read || 0) + (facts.cache_creation || 0),
    toolErrorRate: facts.tool_error_rate || 0,
    toolErrors: facts.tool_errors || 0,
    activeDays: facts.active_days || 0,
    sessions: facts.sessions || 0,
    topProject,
    topProjectShare: topProject && total > 0 ? topProject.cost / total : 0,
  };
}

// rules: each gets (s=signals, inv={skills:Set, agents:Set})
const RULE_CATALOG = [
  {
    id: 'model-routing',
    run: (s) => s.total > 0 && s.opusShare > 0.55 ? {
      priority: 100,
      label: 'Route work off Opus',
      note: `Opus is ~${Math.round(s.opusShare * 100)}% of your est. spend — most of it is routable`,
      copy: 'Routing policy for this session: Opus only for architecture/hard reasoning; Sonnet for main coding; Haiku for sub-agent reads, mechanical edits, search, and build fixes. Default sub-agents to Haiku.',
    } : null,
  },
  {
    id: 'specialist-agents',
    run: (s, inv) => {
      if (s.genericShare <= 0.6 || s.totalSpawns < 5) return null;
      // find the top language whose reviewer agent is installed
      for (const e of s.topExts) {
        const map = LANG[e];
        if (map && inv.agents.has(map[1])) {
          return {
            priority: 95,
            label: `Use ${map[1]}`,
            note: `${Math.round(s.genericShare * 100)}% of your agents are generic — swap in the ${map[0]} specialist`,
            copy: `Use the ${map[1]} agent to review the ${map[0]} changes from this session for correctness, security, and idioms. Run it on Haiku.`,
          };
        }
      }
      return null;
    },
  },
  {
    id: 'skills-underused',
    run: (s, inv) => s.skillCalls < 15 ? {
      priority: 90,
      label: '/deep-research',
      note: `You've used skills only ${s.skillCalls}× — structure your research instead of ad-hoc searching`,
      copy: '/deep-research ',
    } : null,
  },
  {
    id: 'websearch-heavy',
    run: (s) => s.webSearch > 200 ? {
      priority: 80,
      label: 'Stop ad-hoc searching',
      note: `${s.webSearch.toLocaleString()} web searches — /deep-research fans out + fact-checks in one pass`,
      copy: '/deep-research ',
    } : null,
  },
  {
    id: 'codegraph-cold',
    run: (s) => {
      const codeHeavy = s.topExts.some((e) => ['py', 'ts', 'tsx', 'cs', 'go', 'rs', 'java'].includes(e));
      return codeHeavy && s.codegraph < 30 ? {
        priority: 75,
        label: 'codegraph first',
        note: `codegraph used only ${s.codegraph}× — navigate big codebases without grep/read loops`,
        copy: 'Use codegraph_explore to navigate this codebase before falling back to grep + reading whole files.',
      } : null;
    },
  },
  {
    id: 'loops-cold',
    run: (s) => s.workflowRuns < 10 ? {
      priority: 70,
      label: '/loop a repetitive task',
      note: `Only ${s.workflowRuns} workflow runs — automate your repeated build/test cycles`,
      copy: '/loop 2m Run the test suite, diff against the last run, stop on two consecutive green or after 10 iterations; otherwise propose one targeted fix.',
    } : null,
  },
  {
    id: 'cd-tax',
    run: (s) => s.cd > 500 ? {
      priority: 60,
      label: 'Kill the cd tax',
      note: `cd ran ${s.cd.toLocaleString()}× — shell state doesn't persist between calls; absolute paths are cleaner`,
      copy: 'Use absolute paths in all shell commands instead of cd — shell state does not persist between calls.',
    } : null,
  },
  {
    id: 'empty-state',
    run: (s) => (s.activeDays === 0 || s.total === 0) ? {
      priority: 100,
      label: 'Run your first scan',
      note: 'No usage data yet — scan your Claude Code logs to get personalized tips',
      copy: 'ccmaxx scan',
    } : null,
  },
  {
    id: 'haiku-underused',
    run: (s) => (s.haikuShare < 0.05 && s.opusShare > 0.4 && s.totalSpawns >= 5) ? {
      priority: 92,
      label: 'Route sub-agents to Haiku',
      note: 'Haiku is <5% of your spend — most sub-agent work (reads, edits, search) runs fine on it',
      copy: 'For this session, run all sub-agents on Haiku unless they need deep reasoning.',
    } : null,
  },
  {
    id: 'file-ext-specialist',
    run: (s, inv) => {
      if (!s.topExt || s.extShare < 0.4) return null;
      const map = LANG[s.topExt];
      if (!map || !inv.agents.has(map[1])) return null;
      return {
        priority: 88,
        label: `Use ${map[1]}`,
        note: `${Math.round(s.extShare * 100)}% of your edits are ${map[0]} — use its specialist reviewer`,
        copy: `Use the ${map[1]} agent to review the ${map[0]} changes from this session for correctness, security, and idioms.`,
      };
    },
  },
  {
    id: 'project-cost',
    run: (s) => (s.topProject && s.topProjectShare >= 0.4) ? {
      priority: 84,
      label: 'One project dominates your spend',
      note: `"${s.topProject.name}" is ~${Math.round(s.topProjectShare * 100)}% of your est. compute — focus optimization there`,
      copy: 'Review where the most tokens go in this project and route its mechanical work to cheaper models.',
    } : null,
  },
  {
    id: 'error-rate',
    run: (s) => (s.toolErrorRate > 0.08 && s.toolErrors > 20) ? {
      priority: 78,
      label: 'High tool-error rate',
      note: `${Math.round(s.toolErrorRate * 100)}% of your tool calls error — often wrong paths or flaky commands`,
      copy: 'Many tool calls have been failing. Before each command, verify the path/precondition and prefer absolute paths.',
    } : null,
  },
  {
    id: 'cache-reuse',
    run: (s) => (s.cacheTot > 1e6 && s.cacheRatio < 0.55) ? {
      priority: 55,
      label: 'Reuse the prompt cache',
      note: `Only ${Math.round(s.cacheRatio * 100)}% cache reuse — keep related work in one session to hit the cache`,
      copy: 'Keep related work in a single session so the prompt cache is reused instead of recreated.',
    } : null,
  },
  {
    id: 'explore-agent',
    run: (s, inv) => (s.reads > 1500 && s.exploreSpawns < 20 && inv.agents.has('Explore')) ? {
      priority: 58,
      label: 'Use the Explore agent',
      note: `${s.reads.toLocaleString()} Read calls — delegate broad searches to a cheap Explore sub-agent`,
      copy: 'Use the Explore agent (very thorough) to locate the relevant code across the repo and report file:line, instead of reading files one by one.',
    } : null,
  },
];

module.exports = { RULE_CATALOG, signals, LANG };
