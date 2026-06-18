# ccmaxx — Claude Code, maxxed ⚡

Scans your Claude Code logs **locally** and keeps a floating, always-on-top desktop
widget loaded with **personalized** skills, agents, loops, prompts, and model-routing
tips that update as your habits change. No cloud. No Python. One install.

```
npm install -g ccmaxx
ccmaxx
```

Works on **macOS, Windows, and Linux** — pure Node + Electron, reads `~/.claude` on every
platform. On macOS the widget floats on all Spaces with no dock icon; on Windows it stays
always-on-top. The only requirement is Node 18+ (which Claude Code users already have).

## What it does

1. **Scans** every transcript under `~/.claude/projects` (streamed, local-only).
2. **Analyzes** how you actually use Claude Code — models, cost, tools, agents, skills, shell habits.
3. **Recommends** concrete next moves, grounded in *your* data and *your installed* skills/agents
   (it reads `~/.claude/skills` + `~/.claude/agents`, so it never suggests something you don't have).
4. **Surfaces** them in a floating click-to-copy widget — a `⚡ FOR YOU` section up top, then the full catalog.

## Commands

| command | what |
|---|---|
| `ccmaxx` | scan (if stale) → summary → launch the widget |
| `ccmaxx scan` | force a re-scan → regenerate personalized cheats |
| `ccmaxx suggest` | print your top personalized suggestions |
| `ccmaxx stats [--json]` | usage summary |
| `ccmaxx widget` | launch the floating widget only |
| `ccmaxx refresh` | re-scan; an open widget hot-reloads |
| `ccmaxx help` | command reference |

## Privacy

100% local. The scanner writes **only aggregated counts** to `~/.ccmaxx/usage_facts.json` —
never prompt text, code, or paths. No telemetry. No network calls. Nothing leaves your machine.

## How it works

```
~/.claude/projects/**/*.jsonl
   │  src/extractor.js  (streamed, zero-dep)
   ▼
~/.ccmaxx/usage_facts.json        (aggregates only)
   │  src/recommender.js  +  src/rules.js   (reads your installed skills/agents)
   ▼
~/.ccmaxx/cheats_dynamic.json     (FOR YOU + base catalog)
   │  fs.watch hot-reload
   ▼
 Electron floating widget (app/)
```

## Dev

```
npm install      # gets electron
node bin/ccmaxx.js scan
node bin/ccmaxx.js widget
```

MIT.
