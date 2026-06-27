# corpus-cli

The reference CLI for the [Corpus framework](https://github.com/jcosta33/corpus) — a **reconcile-only
harness** for spec-driven agent work. It implements the checks contract in
[`corpus/checks/checks.yaml`](https://github.com/jcosta33/corpus/blob/main/checks/checks.yaml); its own
specs and reviews live in the family workspace, [corpus-works](https://github.com/jcosta33/corpus-works)
(the design of record is `corpus/docs/adrs/0077`).

corpus-cli **prepares, checks, and reconciles** the work around the Corpus loop — it never runs the
model loop itself. Every flow is available two ways: a **direct, scriptable command** and a
**beautiful interactive TUI**.

## Requirements

- **Node.js ≥ 18.18** to run an installed build; **≥ 22.6** to run from a source checkout (the dev
  loop runs the TypeScript directly via `--experimental-strip-types`, no build step).
- **git** ≥ 2.5 (for `git worktree`)
- `pnpm` recommended for development (`npm` works for installing)

## Install

corpus-cli is **not yet published to npm** — the bare name `corpus-cli` on npm is an unrelated project,
so `npm install -g corpus-cli` installs the wrong tool. Install from source instead:

```bash
git clone https://github.com/jcosta33/corpus-cli
cd corpus-cli && pnpm install && pnpm build   # or: npm install && npm run build
npm link                                     # puts `corpus` on your PATH
```

`bin/corpus.js` runs the bundled JavaScript (`dist/`, built on `prepack`), so an installed CLI needs
no transpiler. From a checkout it runs the `src/` TypeScript directly via Node's native type
stripping (Node ≥ 22.6) — `node bin/corpus.js <command>` works without a build step; `pnpm build`
produces the `dist/` bundle. (A published package under a non-colliding name will replace this.)

## Quick start

```bash
corpus                       # open the interactive dashboard
corpus init                  # scaffold a Corpus workspace from the starter kit
corpus check                 # lint every spec in the workspace
corpus status                # the workspace board — specs, tasks, reviews, gaps
corpus new task --from SPEC-001 --scope AC-001,AC-002   # SPEC-001 is an illustrative spec id
corpus worktree create checkout
```

Run any command with `-i` for its interactive form (`corpus check -i`). The interactive surface
**never engages** when output is piped or `--json` is set, so scripts and CI stay non-interactive.

## The two surfaces

Each command is both a Unix part and an interactive flow:

- **Direct** — `--json` machine output, exit codes (`0` clean · `1` warnings · `2` error),
  stdout-for-data / stderr-for-messages, `--no-workspace` degradation. Compose it in scripts and CI.
- **Interactive** — `corpus` with no command opens a dashboard that reaches every flow; any command
  takes `-i`. Prompts, live progress, and coloured, per-finding feedback.

## Commands

| Command                                         | What it does                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `corpus init [dir]`                             | Scaffold a workspace from the corpus-starter-kit, conflict-safe                                  |
| `corpus update [--check\|--write]`              | Check kit drift (read-only), or `--write` to refresh the kit-owned guidance conflict-safely      |
| `corpus check [file]`                           | Lint one spec (positional), or the whole-workspace verdict (no arg); `--staleness` for spec drift |
| `corpus worktree <create\|list\|remove\|prune>` | Manage isolated task worktrees on `corpus/<spec-slug>` branches                                  |
| `corpus status`                                 | A read-only derived board over specs ← tasks ← reviews                                           |
| `corpus clean`                                  | Prune spent ephemeral artifacts (tasks/reviews) — dry run, or `--apply`                          |
| `corpus stamp <ref>`                            | Stamp staleness provenance — a spec `snapshot:`, or a review `evidence_hash:` + `reviewed_sha:`  |
| `corpus review <task>`                          | Reconcile a finished run — diff vs self-report vs spec; the human owns the verdict               |
| `corpus new <task\|spec\|change-plan>`          | Cut a task packet from a spec (scope never invented), or scaffold a spec / change-plan           |
| `corpus pull <ref>`                             | Snapshot a ticket into `intake/` — verbatim, never a spec or the board                           |
| `corpus promote <task>`                         | Scaffold a candidate finding from a finished task (no learning asserted)                         |
| `corpus run <task> --agent <name>`              | Launch a prepared task on an external agent in its worktree; records the launch (no verdict)     |
| `corpus show <task\|spec\|review\|checks>`      | Project a parsed artifact as JSON — read-only                                                    |
| `corpus agents emit --codex`                    | Generate Codex `.codex/agents/*.toml` from the corpus-agents definitions (prose discipline only) |
| `corpus help`                                   | This reference                                                                                   |

### `corpus init`

Clones the [corpus-starter-kit](https://github.com/jcosta33/corpus-starter-kit) and copies it into the
target — **never overwriting your content by default**. An existing file is _skipped_ (kept), unless
you pass `--force` or `--on-conflict overwrite|backup`. `.gitignore` and `AGENTS.md` _merge_ a Corpus
block rather than skip. An empty directory gets the full workspace; an existing code repo gets the
minimal footprint (`--workspace` / `--footprint` force the layout). `--from <path|url>` overrides the
kit source. Re-running is conflict-safe: unchanged kit files are no-ops (a clean re-run), and any
file you have since edited is kept — reported as _skipped_ with a non-zero exit, so you can see what
diverged.

### `corpus update`

`--check` (the default) reads the workspace's `.agents/.corpus-version` pin (stamped by `corpus init`)
and compares it to the latest kit's `VERSION`, resolved through the same source as `init` (the
corpus-starter-kit by default, or `--from <path|url>`). Reports whether you're behind and prints the
kit's `CHANGELOG` (what you'd gain) — exit `0` up to date, `1` behind, `2` error; **writes nothing**.

`--write` (alias `--apply`) lands the newer kit content via the conflict-safe copy engine, **scoped to
the kit-owned guidance** (`templates/`, `.agents/skills/`, `advanced/`, `hooks/`) — never the
adopter's specs, board, decisions, or `AGENTS.md`. A customized kit file is handled by
`--on-conflict backup` (default; the user's copy → `*.corpus-bak`, the kit's lands), `overwrite`, or
`skip`; the pin re-stamps on a full apply (a `skip` leaves it behind so a later `--check` still flags
drift). It is **not** a 3-way line-merge ([ADR-0091](https://github.com/jcosta33/corpus/blob/main/docs/adrs/0091-corpus-update-check.md)).
The network lives here, never in the hermetic `corpus check`.

### `corpus check`

Runs the core checks of the contract (C001–C017) over the plain two-tier spec form. `corpus check
<file>` lints one spec; bare `corpus check` aggregates every `specs/*/spec.md` into one
`clean`/`blocking` verdict (the CI merge gate) and flags workspace-validity issues (a leftover
`{{placeholder}}`, a missing `templates/`). `--json` emits the diagnostics; no file is written.

### `corpus worktree`

`create <slug>` makes an isolated worktree on `corpus/<spec-slug>` off the base branch (idempotent);
`list` shows the corpus worktrees; `remove <slug> [--force]` tears one down; `prune` clears stale
entries. Works in any git repo — no Corpus workspace required.

### `corpus status`

Reads the workspace artifacts and prints a derived board: each spec's tasks, the tasks awaiting a
review packet, and the needs-human list. Read-only — it writes nothing (the committed `status.md`
stays hand-edited).

### `corpus new`

`new task --from <SPEC-id> [--scope AC-001,AC-002]` cuts a task packet whose Scope is copied from the
named requirement ids — a scope id that isn't a requirement of the spec is rejected, and an empty
scope stays empty (never invented). `new spec <slug>` scaffolds a fresh draft spec.

## The boundary

corpus-cli is **reconcile-only**. `corpus run` can launch an external agent against a prepared
worktree, but the CLI never owns the model/reasoning loop, writes no code itself, owns no chat UI,
and never issues a review verdict — it prepares inputs, checks artifacts, and reconciles state.
The Pass/Fail verdict stays the human's, informed by an independent review.

## Further reading

- [`AGENTS.md`](./AGENTS.md) — the bootloader for agents working on this repo
- [`.agents/repo-conventions.md`](./.agents/repo-conventions.md) — the module architecture + soundness rules
- The Corpus framework: [corpus](https://github.com/jcosta33/corpus) · the kit: [corpus-starter-kit](https://github.com/jcosta33/corpus-starter-kit) · the workspace: [corpus-works](https://github.com/jcosta33/corpus-works)
