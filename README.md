# suspec-cli

The reference CLI for the [Suspec framework](https://github.com/jcosta33/suspec) — a **reconcile-only
harness** for spec-driven agent work. It implements the checks contract in
[`suspec/checks/checks.yaml`](https://github.com/jcosta33/suspec/blob/main/checks/checks.yaml); its own
specs and reviews live in the private family workspace
that governs this code repo.

suspec-cli **prepares, checks, and reconciles** the work around the Suspec loop — it never runs the
model loop itself. Every command is a **direct, scriptable command**; most also have an **interactive TUI** flow (`-i`).

## Requirements

- **Node.js ≥ 18.18** to run an installed build; **≥ 22.6** to run from a source checkout (the dev
  loop runs the TypeScript directly via `--experimental-strip-types`, no build step).
- **git** ≥ 2.5 (for `git worktree`)
- `pnpm` recommended for development (`npm` works for installing)

## Install

suspec-cli is **not yet published to npm** — the bare name `suspec-cli` on npm is an unrelated project,
so `npm install -g suspec-cli` installs the wrong tool. Install from source instead:

```bash
git clone https://github.com/jcosta33/suspec-cli
cd suspec-cli && pnpm install && pnpm build   # or: npm install && npm run build
npm link                                     # puts `suspec` on your PATH
```

`bin/suspec.js` runs the bundled JavaScript (`dist/`, built on `prepack`), so an installed CLI needs
no transpiler. From a checkout it runs the `src/` TypeScript directly via Node's native type
stripping (Node ≥ 22.6) — `node bin/suspec.js <command>` works without a build step; `pnpm build`
produces the `dist/` bundle. (A published package under a non-colliding name will replace this.)

## Quick start

```bash
suspec                       # open the interactive dashboard
suspec init                  # scaffold a Suspec workspace from the starter kit
suspec check                 # lint every spec in the workspace
suspec status                # the workspace board — specs, tasks, reviews, gaps
suspec new task --from SPEC-001 --scope AC-001,AC-002   # SPEC-001 is an illustrative spec id
suspec worktree create my-spec-slug   # an isolated worktree on suspec/my-spec-slug
```

Most commands have an interactive form (`-i`): init, check, worktree, status, review, new
(`suspec check -i`). The interactive surface **never engages** when output is piped or `--json` is
set, so scripts and CI stay non-interactive.

## The two surfaces

Every command has a direct form; the reconcile-loop flows also have an interactive one:

- **Direct** — `--json` machine output, exit codes (`0` clean · `1` warnings · `2` error),
  stdout-for-data / stderr-for-messages, `--no-workspace` degradation. Compose it in scripts and CI.
- **Interactive** — `suspec` with no command opens a dashboard for the daily reconcile-loop flows
  (status, check, worktree, new); `init, check, worktree, status, review, new` also take `-i`.
  Prompts, live progress, and coloured, per-finding feedback.

## Commands

| Command                                         | What it does                                                                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `suspec init [dir]`                             | Scaffold a workspace from the suspec-starter-kit, conflict-safe                                                                                         |
| `suspec update [--check\|--write]`              | Check kit drift (read-only), or `--write` to refresh the kit-owned guidance conflict-safely                                                             |
| `suspec check [file]`                           | Validate one artifact by its `type:` — spec, review, or change-plan (positional), or the whole-workspace verdict (no arg); `--staleness` for spec drift |
| `suspec worktree <create\|list\|remove\|prune>` | Manage isolated task worktrees on `suspec/<spec-slug>` branches                                                                                         |
| `suspec status`                                 | A read-only derived board over specs ← tasks ← reviews                                                                                                  |
| `suspec clean`                                  | Prune spent ephemeral artifacts (tasks/reviews) — dry run, or `--apply`                                                                                 |
| `suspec stamp <ref>`                            | Stamp staleness provenance — a spec `snapshot:`, or a review `evidence_hash:` + `reviewed_sha:`                                                         |
| `suspec review <task>`                          | Reconcile a finished run — diff vs self-report vs spec; the human owns the verdict                                                                      |
| `suspec new <task\|spec\|change-plan>`          | Cut a task packet from a spec (scope never invented), or scaffold a spec / change-plan                                                                  |
| `suspec pull <ref>`                             | Snapshot a ticket into `intake/` — verbatim, never a spec or the board                                                                                  |
| `suspec promote <task>`                         | Scaffold a candidate finding from a finished task (no learning asserted)                                                                                |
| `suspec run <task> --agent <name>`              | Launch a prepared task on an external agent in its worktree; records the launch (no verdict)                                                            |
| `suspec show <task\|spec\|review\|checks>`      | Project a parsed artifact as JSON — read-only                                                                                                           |
| `suspec agents emit --codex`                    | Generate Codex `.codex/agents/*.toml` from the suspec-agents definitions (prose discipline only)                                                        |
| `suspec help`                                   | This reference                                                                                                                                          |

The table is the full reference; the subsections below expand only the commands with non-obvious
behaviour. Every command also documents itself via `suspec <cmd> --help`.

### `suspec init`

Clones the [suspec-starter-kit](https://github.com/jcosta33/suspec-starter-kit) and copies it into the
target — **never overwriting your content by default**. An existing file is _skipped_ (kept), unless
you pass `--force` or `--on-conflict overwrite|backup`. `.gitignore` and `AGENTS.md` _merge_ a Suspec
block rather than skip. An empty directory gets the full workspace; an existing code repo gets the
minimal footprint (`--workspace` / `--footprint` force the layout). `--from <path|url>` overrides the
kit source. Re-running is conflict-safe: unchanged kit files are no-ops (a clean re-run), and any
file you have since edited is kept — reported as _skipped_ with a non-zero exit, so you can see what
diverged.

### `suspec update`

`--check` (the default) reads the workspace's `.agents/.suspec-version` pin (stamped by `suspec init`)
and compares it to the latest kit's `VERSION`, resolved through the same source as `init` (the
suspec-starter-kit by default, or `--from <path|url>`). Reports whether you're behind and prints the
kit's `CHANGELOG` (what you'd gain) — exit `0` up to date, `1` behind, `2` error; **writes nothing**.

`--write` (alias `--apply`) lands the newer kit content via the conflict-safe copy engine, **scoped to
the kit-owned guidance** (`templates/`, `.agents/skills/`, `advanced/`, `hooks/`) — never the
adopter's specs, board, decisions, or `AGENTS.md`. A customized kit file is handled by
`--on-conflict backup` (default; the user's copy → `*.suspec-bak`, the kit's lands), `overwrite`, or
`skip`; the pin re-stamps on a full apply (a `skip` leaves it behind so a later `--check` still flags
drift). It is **not** a 3-way line merge.
The network lives here, never in the hermetic `suspec check`.

### `suspec check`

Runs the contract's core checks. `suspec check <file>` is type-aware by the file's
frontmatter `type:` — it lints a spec, validates a review packet (C012/C013), or validates a change
plan (C010/C011). Bare `suspec check` aggregates every `specs/*/spec.md` into one `clean`/`blocking`
verdict (the CI merge gate) and flags workspace-validity issues (a leftover `{{placeholder}}`, a
missing `templates/`). `--json` emits the diagnostics; no file is written.

### `suspec worktree`

`create <slug>` makes an isolated worktree on `suspec/<spec-slug>` off the base branch (idempotent);
`list` shows the suspec worktrees; `remove <slug> [--force]` tears one down; `prune` clears stale
entries. Works in any git repo — no Suspec workspace required.

### `suspec status`

Reads the workspace artifacts and prints a derived board: each spec's tasks, the tasks awaiting a
review packet, and the needs-human list. Read-only — it writes nothing (the committed `status.md`
stays hand-edited).

### `suspec new`

`new task --from <SPEC-id> [--scope AC-001,AC-002]` cuts a task packet whose Scope is copied from the
named requirement ids — a scope id that isn't a requirement of the spec is rejected, and an empty
scope stays empty (never invented). `new spec <slug>` scaffolds a fresh draft spec.

## The boundary

suspec-cli is **reconcile-only**. `suspec run` can launch an external agent against a prepared
worktree, but the CLI never owns the model/reasoning loop, writes no code itself, owns no chat UI,
and never issues a review verdict — it prepares inputs, checks artifacts, and reconciles state.
The Pass/Fail verdict stays the human's, informed by an independent review.

`suspec run` resolves its adapter from a `.suspec/config.yaml` in the target repo (an `agents:` block,
optionally `agents.default`); without it the command errors. This is separate from the
`suspec.config.json` runtime-isolation file the CLI reads in the repo it operates on.

## Further reading

- [`AGENTS.md`](./AGENTS.md) — the bootloader for agents working on this repo
- [`.agents/repo-conventions.md`](./.agents/repo-conventions.md) — the module architecture + soundness rules
- The Suspec framework: [suspec](https://github.com/jcosta33/suspec) · the kit: [suspec-starter-kit](https://github.com/jcosta33/suspec-starter-kit)
