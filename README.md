# suspec-cli

The reference CLI for the [Suspec framework](https://github.com/jcosta33/suspec) — a **reconcile-only
harness** for spec-driven agent work. Suspec is a personal methodology harness: your specs, runs,
reviews, evidence, and findings are the agent's typed working memory — transient markdown in a
**store outside every repo** (`~/.claude/state/<repo>/`), linted by the checks contract in
[`suspec/checks/checks.yaml`](https://github.com/jcosta33/suspec/blob/main/checks/checks.yaml).
Durable value leaves the store only by promotion: decisions → ADRs, behavior → tests, findings →
GitHub issues, the evidence digest → a living PR comment.

suspec-cli **prepares, checks, and reconciles** the work around the Suspec loop — it never runs the
model loop itself. Every command is a **direct, scriptable command**; the daily reconcile flows also
have an **interactive TUI** form (`-i`).

## Requirements

- **Node.js ≥ 18.18** to run an installed build; **≥ 22.6** to run from a source checkout (the dev
  loop runs the TypeScript directly via `--experimental-strip-types`, no build step).
- **git** ≥ 2.5 (for `git worktree`)
- `pnpm` recommended for development (`npm` works for installing)
- `gh` only for the GitHub-facing commands (`pull` on issue refs, `promote`, `fix #N`, the PR
  digest) — every other command runs without it.

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
suspec init                            # seed this repo: suspec.config.json, AGENTS.md, skills dirs
suspec write spec "add rate limiting"  # scaffold a draft spec in the store
suspec work SPEC-add-rate-limiting     # worktree + setup + launch a runner at the store spec
suspec evidence add <RUN> --ac AC-001 -- pnpm test:run   # capture cli-verified evidence
suspec done <RUN>                      # the strict gate: every AC needs cli-verified evidence
suspec next                            # the single most actionable store item
```

The repo footprint is `suspec.config.json` plus whatever you promote — artifacts live in the store,
never in the repo. The interactive surface **never engages** when output is piped or `--json` is
set, so scripts and CI stay non-interactive.

## The two surfaces

Every command has a direct form; the daily reconcile flows also have an interactive one:

- **Direct** — `--json` machine output, exit codes (`0` clean · `1` warnings · `2` error),
  stdout-for-data / stderr-for-messages. Compose it in scripts and CI.
- **Interactive** — `suspec` with no command opens a dashboard for the daily reconcile flows
  (status, check, review, worktree, new); `init, check, worktree, status, review, new` also take
  `-i`. Prompts, live progress, and coloured, per-finding feedback.

## Commands

| Command                                          | What it does                                                                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `suspec init`                                    | Seed this repo for the personal harness — config, `AGENTS.md`, skills dirs; never touches the store            |
| `suspec update [--check\|--write]`               | Check kit drift (read-only), or `--write` to refresh the kit-owned templates conflict-safely                   |
| `suspec check [file]`                            | Validate one artifact by its `type:` (spec, review, change-plan), or lint the store's artifacts (no arg)       |
| `suspec worktree <create\|list\|remove\|prune>`  | Manage isolated task worktrees on `suspec/<spec-slug>` branches                                                |
| `suspec status`                                  | The store summary — runs, specs, and what needs attention                                                      |
| `suspec clean`                                   | Store hygiene — delete archived artifacts past retention (= `store gc`)                                        |
| `suspec stamp <ref>`                             | Stamp a spec snapshot SHA (enables `check --staleness`)                                                        |
| `suspec review <RUN>`                            | Reconcile a store run against its spec — artifact lint + evidence per AC (no verdict)                          |
| `suspec new <task\|change-plan>`                 | Cut a task slice from a store spec (scope never invented), or scaffold a change plan                           |
| `suspec write spec "<intent>"`                   | Scaffold a draft store spec from a one-line intent; `--launch` dispatches the spec author                      |
| `suspec pull <ref>`                              | Snapshot a ticket into the store — verbatim capture only, never a spec                                         |
| `suspec promote <FIND>`                          | Promote a store finding to a GitHub issue (evidence digest + provenance), then archive it                      |
| `suspec fix <FIND-id \| #issue>`                 | Scaffold a fix-spec from a finding or gh issue, then launch it via the work pipeline                           |
| `suspec store <doctor\|list\|gc\|purge>`         | Store maintenance — doctor reconciles against git/GitHub truth; gc applies retention                           |
| `suspec work <SPEC>`                             | Work a store spec: create/reuse its worktree, run setup, launch a runner pointed at the store (no verdict)     |
| `suspec evidence add <RUN> --ac <AC> -- <cmd…>`  | Run a verify command in the run worktree and record cli-verified evidence in the store                         |
| `suspec done <RUN>`                              | The strict gate: lint the run artifacts, gate every AC on cli-verified evidence, digest + findings triage      |
| `suspec check-my-work "<intent>"`                | The middle tier: gate the current diff (config `verify`) + dispatch one adversarial reviewer                   |
| `suspec next`                                    | The single most actionable store item — live runs, gate gaps, triage debt, ready specs                         |
| `suspec show <task\|spec\|review\|checks>`       | Project a parsed artifact as JSON — read-only                                                                  |
| `suspec agents emit --codex`                     | Generate Codex `.codex/agents/*.toml` from the agent definitions (prose discipline only)                       |
| `suspec help`                                    | This reference                                                                                                 |

The table is the full reference; the subsections below expand only the commands with non-obvious
behaviour. Every command also documents itself via `suspec <cmd> --help`.

### `suspec init`

Seeds the repo **in place** — no clone, no workspace scaffold. It writes `suspec.config.json`
(defaults plus detected setup), seeds `AGENTS.md` if absent, creates `.agents/skills/` and the
`.claude/skills` symlink, and gitignores `.worktrees/` — nothing else lands in the repo. `--yes`
also links `CLAUDE.md → AGENTS.md`. Artifacts live in your personal store, outside the repo; init
never touches the store. The universal Suspec skills install globally
(`npx skills add jcosta33/suspec-skills -g`), not per repo.

### `suspec update`

`--check` (the default) reads `.agents/.suspec-version` and compares it to the latest kit's
`VERSION`, resolved from the suspec-starter-kit by default or `--from <path|url>` — exit `0` up to
date, `1` behind, `2` error; **writes nothing**. `--write` (alias `--apply`) refreshes the
kit-owned templates (per the kit manifest) and re-stamps the pin. A customized kit file is handled
by `--on-conflict backup` (default; your copy → `*.suspec-bak`), `overwrite`, or `skip`. It is
**not** a 3-way line merge, and it never touches your `AGENTS.md` content or the store. Skills are
not refreshed here — they install globally.

### `suspec check`

Runs the contract's checks as **artifact lint**. `suspec check <file>` is type-aware by the file's
frontmatter `type:` — it lints a spec, validates a review packet (C012/C013), or validates a change
plan (C010/C011). Bare `suspec check` lints the store's artifacts for this repo — runs, specs,
reviews, evidence records; findings are per-artifact facts, never a workspace verdict.
`--staleness` reports which snapshotted specs drifted since their snapshot SHA. The independent
reviewer re-running the checks remains the invariant.

### `suspec worktree`

`create <slug>` makes an isolated worktree on `suspec/<spec-slug>` off the base branch (idempotent);
`list` shows the suspec worktrees; `remove <slug> [--force]` tears one down; `prune` clears stale
entries. Works in any git repo — no store required.

### `suspec work` → `evidence` → `done`

The launch loop. `work <SPEC>` resolves the spec from the store, creates or reuses its worktree,
runs setup (`suspec.config.json` `setup`, or a lockfile autodetect), and launches a runner with a
prompt that **points at the store by absolute path** — nothing is copied. `evidence add` runs a
verify command itself in the run worktree and records it with `provenance: cli-verified`. `done`
is the strict gate: every AC in the driving spec needs at least one cli-verified, exit-0 evidence
entry (stale evidence doesn't count); it emits the digest, upserts one marker-tagged PR comment
when the branch has an open PR, and triages the run's findings (promote / keep-with-expiry /
discard). `--accept-failing "<why>"` accepts gaps explicitly — the reason lands in the digest.

### `suspec new`

`new task --from <SPEC> [--scope AC-001,AC-002]` cuts a task slice into the store whose Scope is
copied from the named requirement ids — a scope id that isn't a requirement of the spec is
rejected, and an empty scope stays empty (never invented). Specs scaffold via
`suspec write spec "<intent>"` (the one store scaffold).

## The boundary

suspec-cli is **reconcile-only**. `suspec work` launches an external runner against a prepared
worktree, but the CLI never owns the model/reasoning loop, writes no code itself, owns no chat UI,
and never issues a review verdict — it prepares inputs, checks artifacts, and reconciles state.
The Pass/Fail verdict stays the human's, informed by an independent review; `suspec done` gates on
evidence, it doesn't judge content.

All configuration lives in one file: `suspec.config.json` at the repo root — `runners` (the runner
adapters `work` and `check-my-work` dispatch to; built-ins `claude` and `codex`), `setup` /
`setup_copy` (worktree preparation), `verify` (the `check-my-work` gate), `risk_paths`, `state_root`,
and the caps. **No config is required**: every command works with defaults (store under
`~/.claude/state/`, the `claude` runner if on PATH); a missing runtime dependency errors only on
the command that needs it, naming it.

## Further reading

- [`AGENTS.md`](./AGENTS.md) — the bootloader for agents working on this repo
- [`.agents/repo-conventions.md`](./.agents/repo-conventions.md) — the module architecture + soundness rules
- The Suspec framework: [suspec](https://github.com/jcosta33/suspec) · the kit: [suspec-starter-kit](https://github.com/jcosta33/suspec-starter-kit)
