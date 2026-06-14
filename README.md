# swarm-cli

The reference CLI for the [Swarm framework](https://github.com/jcosta33/swarm) — a **reconcile-only
harness** for spec-driven agent work. It implements the checks contract in
[`swarm/checks/checks.yaml`](https://github.com/jcosta33/swarm/blob/main/checks/checks.yaml); its own
specs and reviews live in the family workspace, [swarm-hq](https://github.com/jcosta33/swarm-hq)
(the design of record is `swarm/docs/adrs/0077`).

swarm-cli **prepares, checks, and reconciles** the work around the Swarm loop — it never runs the
model loop itself. Every flow is available two ways: a **direct, scriptable command** and a
**beautiful interactive TUI**.

## Requirements

- **Node.js ≥ 18.18** to run an installed build; **≥ 22.6** to run from a source checkout (the dev
  loop runs the TypeScript directly via `--experimental-strip-types`, no build step).
- **git** ≥ 2.5 (for `git worktree`)
- `pnpm` recommended for development (`npm` works for installing)

## Install

```bash
npm install -g swarm-cli
```

`bin/swarm.js` runs the bundled JavaScript (`dist/`, built on `prepack`), so an installed CLI needs
no transpiler. From a checkout it runs the `src/` TypeScript directly via Node's native type
stripping; `pnpm build` produces the `dist/` bundle.

## Quick start

```bash
swarm                       # open the interactive dashboard
swarm init                  # scaffold a Swarm workspace from the starter kit
swarm check                 # lint every spec in the workspace
swarm status                # the workspace board — specs, tasks, reviews, gaps
swarm new task --from SPEC-checkout --scope AC-001,AC-002
swarm worktree create checkout
```

Run any command with `-i` for its interactive form (`swarm check -i`). The interactive surface
**never engages** when output is piped or `--json` is set, so scripts and CI stay non-interactive.

## The two surfaces

Each command is both a Unix part and an interactive flow:

- **Direct** — `--json` machine output, exit codes (`0` clean · `1` warnings · `2` error),
  stdout-for-data / stderr-for-messages, `--no-workspace` degradation. Compose it in scripts and CI.
- **Interactive** — `swarm` with no command opens a dashboard that reaches every flow; any command
  takes `-i`. Prompts, live progress, and coloured, per-finding feedback.

## Commands

| Command                                        | What it does                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| `swarm init [dir]`                             | Scaffold a workspace from the swarm-starter-kit, conflict-safe           |
| `swarm check [file]`                           | Lint one spec (positional), or the whole-workspace verdict (no arg)      |
| `swarm worktree <create\|list\|remove\|prune>` | Manage isolated task worktrees on `swarm/<spec-slug>` branches           |
| `swarm status`                                 | A read-only derived board over specs ← tasks ← reviews                   |
| `swarm new <task\|spec>`                       | Cut a task packet from a spec (scope never invented), or scaffold a spec |
| `swarm help`                                   | This reference                                                           |

### `swarm init`

Clones the [swarm-starter-kit](https://github.com/jcosta33/swarm-starter-kit) and copies it into the
target — **never overwriting your content by default**. An existing file is _skipped_ (kept), unless
you pass `--force` or `--on-conflict overwrite|backup`. `.gitignore` and `AGENTS.md` _merge_ a Swarm
block rather than skip. An empty directory gets the full workspace; an existing code repo gets the
minimal footprint (`--workspace` / `--footprint` force the layout). `--from <path|url>` overrides the
kit source. Re-running is conflict-safe: unchanged kit files are no-ops (a clean re-run), and any
file you have since edited is kept — reported as _skipped_ with a non-zero exit, so you can see what
diverged.

### `swarm check`

Runs the core checks of the contract (C001–C009) over the plain two-tier spec form. `swarm check
<file>` lints one spec; bare `swarm check` aggregates every `specs/*/spec.md` into one
`clean`/`blocking` verdict (the CI merge gate) and flags workspace-validity issues (a leftover
`{{placeholder}}`, a missing `templates/`). `--json` emits the diagnostics; no file is written.

### `swarm worktree`

`create <slug>` makes an isolated worktree on `swarm/<spec-slug>` off the base branch (idempotent);
`list` shows the swarm worktrees; `remove <slug> [--force]` tears one down; `prune` clears stale
entries. Works in any git repo — no Swarm workspace required.

### `swarm status`

Reads the workspace artifacts and prints a derived board: each spec's tasks, the tasks awaiting a
review packet, and the needs-human list. Read-only — it writes nothing (the committed `status.md`
stays hand-edited).

### `swarm new`

`new task --from <SPEC-id> [--scope AC-001,AC-002]` cuts a task packet whose Scope is copied from the
named requirement ids — a scope id that isn't a requirement of the spec is rejected, and an empty
scope stays empty (never invented). `new spec <slug>` scaffolds a fresh draft spec.

## The boundary

swarm-cli is **reconcile-only**. It never runs a model/agent, owns no chat UI, and never issues a
review verdict — it prepares inputs, checks artifacts, and reconciles state. Running an agent and
deciding Pass/Fail are the human's (and a later milestone's) job.

## Further reading

- [`AGENTS.md`](./AGENTS.md) — the bootloader for agents working on this repo
- [`.agents/repo-conventions.md`](./.agents/repo-conventions.md) — the module architecture + soundness rules
- The Swarm framework: [swarm](https://github.com/jcosta33/swarm) · the kit: [swarm-starter-kit](https://github.com/jcosta33/swarm-starter-kit) · the workspace: [swarm-hq](https://github.com/jcosta33/swarm-hq)
