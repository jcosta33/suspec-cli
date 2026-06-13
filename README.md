# Swarm CLI

The reference CLI for the [Swarm framework](https://github.com/jcosta33/swarm) — the quality-of-life
automation around Swarm's spec-and-review workflow. It implements the checks contract in
[`swarm/checks/checks.yaml`](https://github.com/jcosta33/swarm/blob/main/checks/checks.yaml) and tracks
the command surface in [`swarm/docs/reference/future-cli.md`](https://github.com/jcosta33/swarm/blob/main/docs/reference/future-cli.md);
its own specs and reviews live in the family workspace, [swarm-hq](https://github.com/jcosta33/swarm-hq).

Operationally it is an agentic toolkit for orchestrating AI coding agents in isolated git worktrees:
it boots one **sandboxed worktree per task**, drives each session from a Markdown task file, and exposes
context-compression, codebase-analysis, and orchestration utilities so agents can do useful work without
trampling your main checkout.

> **Note — command surface in flux.** Some commands and the task-file layout below predate the
> 2026 framework repositioning and do not yet match the [future-cli](https://github.com/jcosta33/swarm/blob/main/docs/reference/future-cli.md)
> contract or the "code repos stay clean" model (workspace artifacts live in swarm-hq, not in the
> code repo). Realigning them is tracked as open work; treat this README's command reference as
> transitional.

---

## 🚀 Quick Start

### Requirements

- **Node.js ≥ 22.6.0** (Swarm runs TypeScript directly via `--experimental-strip-types` — older Node versions will refuse to start)
- **git** ≥ 2.5 (for `git worktree`)
- A package manager (`pnpm` recommended, `npm` works as a fallback)

### Install

```bash
# from the repo root
npm link
# or
npm install -g swarm-cli
```

### First run

```bash
swarm init        # scaffold .agents/, swarm.config.json, enable git rerere
swarm doctor      # verify your environment is wired up
swarm             # launch the interactive dashboard
```

Running `swarm` with no arguments opens an interactive TUI. You can also drive every command directly:

```bash
swarm new my-feature "Implement the new billing module"
swarm list
swarm open my-feature
swarm validate
swarm pr my-feature
```

> **Tip:** `swarm <agent-name>` (e.g. `swarm claude`, `swarm codex`) launches a supported agent CLI inside the current worktree with a colourful banner. If the agent is missing, Swarm offers to install it.

---

## 🧠 Core Concepts

- **Sandboxing (Worktrees):** Agents never edit your primary checkout. Swarm provisions a dedicated `git worktree` (and branch `agent/<slug>`) per task. The main repo stays clean and uncommitted work stays safe.
- **Task-Driven:** Every session is rooted in a Markdown task file at `.agents/tasks/<slug>.md` containing the objective, plan, decisions, blockers, and a self-review checklist.
- **Empirical Verification:** Tasks are not "done" until the self-review section contains pasted console output (`pnpm typecheck`, `pnpm test:run`, `pnpm deps:validate`).
- **State Management:** Active sandboxes live in `.agents/state.json` (PID, status, agent, timestamps). Telemetry is appended to a SQLite DB at `.agents/logs/telemetry.db`.
- **Configuration:** `swarm.config.json` at the repo root holds default branch, agent, terminal backend, slug rules, and per-agent command/args. `swarm init` writes a sensible starter file.

---

## 🛠️ Command Reference

### Setup & lifecycle

- `init` — Scaffold `.agents/`, write `swarm.config.json`, enable `git rerere`.
- `new <slug> [title] [--launch] [--type <kind>]` — Create a sandbox worktree and seeded task file. `--launch` auto-spawns the configured agent.
- `open <slug>` — Reopen an existing sandbox terminal.
- `list` — List active sandboxes with status, PID, and backend.
- `show <slug>` — Detailed metadata, dirtiness, and telemetry summary.
- `status <slug>` — Rich runtime status: process state, working-tree dirtiness, recent telemetry.
- `task <slug>` — Append human feedback / hints to the sandbox's task file.
- `pick [action]` — Fuzzy-finder over sandboxes; default action is `open` (others: `new`, `focus`, `remove`, `show`).
- `focus <slug>` — Open the sandbox worktree in your default editor.
- `path <slug>` — Print the absolute filesystem path of a sandbox worktree.
- `remove <slug> [--force]` — Forcefully remove a sandbox and its worktree.
- `prune` — Clean up merged or orphaned sandboxes.
- `merge <branch>` — Merge a branch into the current one with structured conflict reporting.
- `pr <slug>` — Auto-commit and open a GitHub PR populated from the task file.
- `health` — Quick pre-flight environment check.
- `doctor` — Deeper diagnostics (Node version, git, pnpm/npm, rerere, `.agents/`, state, worktrees, telemetry DB).

### Validation & test loops

- `validate` — Run the configured lint/typecheck commands with output truncated for LLM context limits.
- `test [...vitest-args]` — Run Vitest with smart log truncation.
- `test-radius <file>` — Compute the blast radius of a file and run only the affected specs.
- `daemon` — Background watcher that re-runs `test-radius` on file save (debounced).
- `repro` — Verify a TDD invariant: tests must be modified before source code in the current diff.
- `format <file>` — Run Prettier on a single file with truncated output.

### Context, search & analysis

- `compress <file>` — Skeletonize a TypeScript file (drop function bodies, keep signatures + JSDoc) to save LLM tokens.
- `graph <file>` — Map the import/export dependency graph of a module.
- `references <symbol> [--path <dir>]` — Fast `git grep` for usages of a symbol.
- `find <type> <target>` — Semantic-ish search for `class`, `interface`, `function`, `implements`, or `extends`.
- `docs <file>` — Extract and format JSDoc blocks from a module.
- `complexity <file>` — Naive cyclomatic complexity heuristic for maintainability gating.
- `audit-sec <file>` — Scan a single file for dangerous patterns, hardcoded secrets, and common XSS vectors.
- `dead-code <file>` — Find exported symbols never imported elsewhere in the project.
- `context [dir]` — Generate a semantic map of exported symbols (for RAG / agent retrieval).
- `arch` — Lint cross-module boundary invariants (delegates to `pnpm deps:validate`).

### Memory, knowledge & telemetry

- `memory <get|set|list>` — Markdown-backed cross-agent memory bank in `.agents/memory/`.
- `knowledge <query>` — Lightweight search over past tasks, audits, specs, and PRs.
- `logs [--agent <a>] [--slug <s>] [--follow] [--prune <days>] [--json]` — Query / tail / prune the telemetry SQLite DB.
- `telemetry` — Aggregated dashboard of session counts, time-to-completion, and exit codes.

### Multi-agent orchestration

- `epic <file>` — Decompose a markdown checklist epic into one child task per item.
- `decompose <graph.json> [--dry-run] [--execute] [--max-tasks N]` — Run a typed task DAG: validate, topo-sort, optionally provision worktrees and launch agents in dependency waves.
- `triage <file>` — Convert an unstructured bug report into a strict, verifiable spec.
- `review <slug>` — Spawn an adversarial peer-review agent against another agent's branch.
- `chat <slug> [--message ...] [--from <slug>]` — Append-only IPC log between two agents (read mode if no message).
- `message <slug> <json>` — Queue a structured JSON message into another agent's mailbox.
- `lock <claim|release|list>` — Advisory file locking for parallel-agent coordination.
- `heal` — Self-healing hotfix: if `pnpm typecheck` fails, spawn an emergency-fix agent.

### Production-scale tooling

- `refactor <dir> <goal>` — Break a massive refactor into 5-file chunks distributed as child tasks.
- `migrate <file> <lang>` — Spawn a Translator + Verifier agent pair to port code into a new language/framework.
- `mock <file> <Name>` — Generate a TypeScript mock factory for a specific interface.
- `fuzz <file> <func>` — Generate and execute unexpected test permutations against a function signature.
- `chaos <start|stop>` — Toggle latency / network-failure injection via `.env.local` flags.
- `visual <baseline|compare> [url]` — Screenshot-based visual regression loop (uses Playwright).
- `screenshot [url]` — Capture a Playwright screenshot of the running app for LLM visual review.
- `profile <cmd>` — Profile a Node process and assign a Performance Engineer agent to optimize hotspots.
- `release` — Bump semver, generate changelog from git history, draft release notes.
- `deps` — Find outdated packages, fetch release notes, generate upgrade tasks.

### Workspace utilities

- `ast-rename <file> <Old> <New>` — Structural rename of a symbol across a file.
- `capabilities` — Print the registered command and adapter capabilities catalog.
- `dashboard` — Re-open the interactive TUI (also the no-arg default).
- `help` — Print the condensed command reference.

### Supported agent runtimes

`swarm <agent>` proxies into one of the supported agent CLIs and auto-prompts to install it if missing:

`claude`, `codex`, `droid`, `gemini`, `kimi`, `opencode`, `aider`, `cline`, `swe-agent`.

---

## 🔒 Safety & Permissions

Swarm operates under a strict "Show, Don't Tell" philosophy: agents must paste empirical proof (test/lint/typecheck output) into the task file before declaring a task complete. The CLI itself defaults to non-destructive actions — `remove` requires `--force`, and `prune` only removes merged or orphaned worktrees.

When an agent finishes a task, human review is performed against the task file's `## Self-review` section, then `swarm pr <slug>` produces a pull request whose body is generated from the same task file.

For the canonical agent rules — sandbox boundaries, prohibited commands, file-system safety, and architectural invariants — see [`AGENTS.md`](./AGENTS.md) and the skills in [`.agents/skills/`](./.agents/skills/).

---

## 📚 Further reading

- [`AGENTS.md`](./AGENTS.md) — the Swarm bootloader: startup, project facts, architecture discipline, command bindings
- [`.agents/skills/`](./.agents/skills/) — the Swarm `implement-task` guide and this repo's own engineering skills (architecture-violations · event-bus-and-results · state-and-write-paths · testing-file-layout); `.claude/skills` is a symlink to it
- [`scaffold/`](./scaffold/) — the starter kit `swarm init` installs (a complete Swarm workspace); `scaffold/advanced/` carries the SOL + checks reference cards
- Toolchain specs — in the Swarm workspace (the sibling `swarm-hq` repo, `specs/`)
- [`docs/06-testing.md`](./docs/06-testing.md) — Vitest layout and conventions
- [`docs/07-conventions.md`](./docs/07-conventions.md) — coding patterns and lint-aligned style
