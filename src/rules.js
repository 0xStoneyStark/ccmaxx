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
  return {
    total,
    opusShare: total > 0 ? (cbt.opus || 0) / total : 0,
    skillCalls: facts.skill_calls_total || 0,
    workflowRuns: facts.workflow_runs || 0,
    totalSpawns,
    genericShare: totalSpawns > 0 ? generic / totalSpawns : 0,
    cd: m(facts.bash_bins, 'cd'),
    webSearch: m(facts.tools, 'WebSearch'),
    codegraph: m(facts.mcp, 'codegraph'),
    topExts: (facts.file_ext || []).map((x) => x[0]),
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
];

module.exports = { RULE_CATALOG, signals, LANG };
