# AGENTS.md — swarm-cli

<!-- Always-loaded bootloader (aim ~100 lines). Procedures load on demand from
     `.agents/skills/`. This is a CODE repo: the Swarm workspace governing it
     is the sibling swarm-hq repo. -->

## Swarm

- Swarm workspace: `../swarm-hq` — read the task packet you are given. Specs,
  tasks, reviews, findings, decisions, and the board live there, not here.
- Implement against the packet: read its linked spec first; stay inside its
  scope (if a requirement can't be met as written, stop and say why instead of
  improvising); run every item under its `## Verify` and paste the real output
  (a claim without output counts as unverified); fill its `## Run summary`;
  re-read your own diff as a skeptic before handoff. Guide:
  `.agents/skills/implement-task/`.
- swarm-cli is the **reconcile-only harness** (swarm ADR-0077): it prepares,
  checks, and reconciles the Swarm loop and never runs the model loop. Surface:
  `init · check · worktree · status · review · new · pull · promote · run · show`
  (+ `help`) — each a direct command, most also an interactive TUI flow (`-i`;
  `swarm` with no args opens the dashboard).
  `swarm init` clones the swarm-starter-kit (no vendored copy lives here). The
  checks contract this CLI implements (C001–C015) lives in the swarm repo,
  `checks/checks.yaml` (that file's `version:` is the contract version of record —
  don't pin a copy of it here), reimplemented in code at
  `src/modules/Core/services/checksContract.ts` and drift-guarded against it.

## Project facts

- TypeScript, pnpm, vitest, eslint, dependency-cruiser; entry `bin/swarm.js` →
  `src/index.ts` (the in-process dispatcher). Modules: `Core` (the four engines and the
  `unixOutcome` contract), `Sol` (the plain-form spec parser), `Workspace` (git worktrees),
  `Terminal` (arg parsing), `Commands` (the thin wrappers), `Tui` (the interactive flows and
  renderers). `src/infra` is the `Result`/`AppError` algebra.
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
- Repo-specific engineering guides live beside `implement-task` in
  `.agents/skills/` (`architecture-violations`, `testing-file-layout`); Claude
  Code reads them via the `.claude/skills` symlink. Domain terms:
  `.agents/memory/glossary.md`.
- Full conventions: `.agents/repo-conventions.md` · human coding conventions:
  `docs/07-conventions.md` · architecture: `docs/05-architecture.md` · testing:
  `docs/06-testing.md`. (The CLI reads/writes a consumer-side `swarm.config.json`
  in the repo it operates on; this repo carries no project-config file of its own.)

## Commands

| Slot         | Command              | Purpose                        |
| ------------ | -------------------- | ------------------------------ |
| cmdTest      | `pnpm test:run`      | run the test suite             |
| cmdLint      | `pnpm lint`          | static checks                  |
| cmdTypecheck | `pnpm typecheck`     | types                          |
| cmdValidate  | `pnpm deps:validate` | dependency-boundary validation |
| cmdFormat    | `pnpm format`        | format hygiene                 |

An empty or missing slot means **ask** — never invent a command. A Verify item
whose command cannot be resolved reads Unverified, not Pass.

## Agent role

You are an implementation or review worker. Swarm organizes the work; you perform
the assigned task — and you never review your own implementation.
