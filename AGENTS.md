# AGENTS.md — swarm-cli

<!-- Always-loaded bootloader (aim ~100 lines). Procedures load on demand from
     `.agents/skills/`. This repo is CO-LOCATED: it authors its own toolchain
     specs (specs/<feature>/spec.md) AND implements them — workspace and code
     in one tree. -->

## Swarm startup

1. Read the task packet you were given first. Follow its scope.
2. Read the linked spec (and change plan, if any) before touching code.
3. Do not implement behavior outside the task's scope — if a requirement can't be
   met as written, stop and say why instead of improvising.
4. Run every item under the task's `## Verify` and paste the real output. A claim
   without output counts as unverified.
5. Before finishing, re-read your own diff as a skeptic, fill the task's
   `## Run summary` section (changed files, per-command results citing the
   Verify pastes, out-of-scope edits, blocked questions), and flip the task's
   board row in `status.md` to review-ready.

## Workspace

- The loop: Pull → Spec → Task → Run → Review → Close (+ Inventory / Change Plan for
  structural work).
- Specs: `specs/<feature>/spec.md` (SOL form via `format: sol`) · tasks: `tasks/` ·
  reviews: `reviews/` · findings: `findings/` · intake: `intake/` ·
  inventories: `inventory/` · change plans: `change-plans/` ·
  decisions: `decisions/` · board: `status.md`
- Templates for the core artifacts: `templates/` (ADR shape: `scaffold/advanced/adr.md`)
- Agent guides: `.agents/skills/` — Claude Code reads them via the `.claude/skills`
  symlink; Swarm's three core guides and this repo's own engineering skills
  (`architecture-violations`, `event-bus-and-results`, `state-and-write-paths`,
  `testing-file-layout`) live side by side
- `scaffold/` is this CLI's `swarm init` payload — a full copy of the current
  starter kit; its `advanced/` doubles as the local reference cards (SOL
  notation, checks). The checks contract this CLI implements lives in the swarm
  repo: `checks/checks.yaml` (v0.4.0).
- Recall: `.agents/memory/INDEX.md` (load-when map) → `findings/`

## Project facts

- TypeScript + pnpm + vitest + eslint + dependency-cruiser; entry `bin/swarm.js`,
  source under `src/{modules,infra,utils}`.
- **Architecture discipline:** DDD module boundaries — cross-module imports only via a
  module's root `index.ts`; internals (`models/`/`repositories/`/`services/`) private;
  one function per use-case/repository file; `src/infra/**` MUST NOT import
  `src/modules/**` (`infra-isolation`).
- **The verification gate:** `pnpm deps:validate` (dependency-cruiser) MUST pass with
  **zero** architectural violations before a cross-module change is done.
- **Safety:** never delete/rename/overwrite a file without an explicit instruction; no
  destructive git; no codemods / bulk find-replace / global `--fix`; stage only
  intentionally-changed files; when unsure, log a `QUESTION` rather than act.
- **Working discipline:** show-don't-tell (paste real command output as proof); trace
  blast radius with `pnpm typecheck`; after 3 failed fix attempts, stop and
  re-strategize.
- Full conventions: `.agents/repo-conventions.md` · human coding conventions:
  `docs/07-conventions.md` · architecture: `docs/05-architecture.md` · testing:
  `docs/06-testing.md`. Project config: `.agents/swarm.config.yaml`.

## Commands

| Slot         | Command              | Purpose                        |
| ------------ | -------------------- | ------------------------------ |
| cmdTest      | `pnpm test:run`      | run the test suite             |
| cmdLint      | `pnpm lint`          | static checks                  |
| cmdTypecheck | `pnpm typecheck`     | types                          |
| cmdValidate  | `pnpm deps:validate` | dependency-boundary validation |
| cmdFormat    | `pnpm format`        | format hygiene                 |

An empty or missing slot means **ask** — never invent a command. A Verify item
whose command cannot be resolved reads Unverified, not Pass. More slots
(registry: `checks/checks.yaml` in the swarm repo): cmdInstall, cmdBuild,
cmdBenchmark, cmdSecurity — add a row when needed.

## Agent role

You are an implementation or review worker. Swarm organizes the work; you perform
the assigned task — and you never review your own implementation.
