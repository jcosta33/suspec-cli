# AGENTS.md — suspec-cli

<!-- Always-loaded bootloader (aim ~100 lines). Procedures load on demand from
     `.agents/skills/`. This is a CODE repo: Suspec working artifacts for it live
     beside the developer's own native artifacts, outside the repo, named by
     explicit path. -->

## Suspec

- Working artifacts: specs, tasks, reviews, and findings for changes to this repo
  live beside the developer's own native artifacts, outside the repo, and are
  named by explicit path — read the spec or task slice you are given by the path
  you are given. Accepted framework decisions are canon in `../corpus/docs/adrs/`.
- Implement against the spec (or task slice) you are given: read it first; stay
  inside its scope (if a requirement can't be met as written, stop and say why
  instead of improvising); run every item under its `## Verify` and paste the
  real output (a claim without output counts as unverified); fill the run
  record (`## Run summary`, or the spec's `## Execution` for 1:1 work);
  re-read your own diff as a skeptic before handoff. Guide:
  `.agents/skills/implement-task/`.
- suspec-cli is the **path-agnostic checker**: one verb, `suspec check` — it
  reads exactly the files it is handed and resolves nothing else. Invocations:
  `suspec check <path>` (spec / change plan, several allowed per invocation) ·
  `suspec check <review-path> --spec <spec-path> [--task <task-path>]` (review;
  `--task` required iff the review names a `task:` — a task-less 1:1 review
  reconciles spec-keyed) · `suspec check --contract` (the contract as JSON).
  Exit codes are the API: 0 clean · 1 warning · 2 blocking; a review checked
  without a required companion exits 2 naming the missing flag. The checks
  contract this CLI implements lives in the
  suspec repo, `checks/checks.yaml` (that file's `version:` is the contract
  version of record — don't pin a copy of it here), reimplemented in code at
  `src/modules/Core/services/checksContract.ts` and drift-guarded against it
  whenever a sibling canon checkout is present (SUSPEC_CANON / `../suspec` / any
  canon-shaped sibling — the guard skips loudly otherwise; CI checks out the
  canon beside this repo in `.github/workflows/gate.yml`, so the guard bites on
  every push/PR).

## Project facts

- TypeScript, pnpm, vitest, eslint, dependency-cruiser; entry `bin/suspec.js` →
  `src/index.ts` (the in-process dispatcher). Modules: `Core` (the check engine and the
  `unixOutcome` contract), `Sol` (the plain-form spec parser), `Terminal` (arg parsing),
  `Commands` (the check command + usage, the surface). `src/infra` is the `Result`/`AppError`
  algebra plus the shared pure markdown/YAML scan utilities.
- **Architecture discipline:** DDD module boundaries — cross-module imports only via a
  module's root `useCases/index.ts`; internals (`models/`/`repositories/`/`services/`) private;
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
  `docs/06-testing.md`. The CLI reads no config file — not in this repo, not in
  the repos it checks.

## Commands

| Slot         | Command              | Purpose                                            |
| ------------ | -------------------- | -------------------------------------------------- |
| cmdTest      | `pnpm test:run`      | run the test suite                                 |
| cmdLint      | `pnpm lint`          | static checks                                      |
| cmdTypecheck | `pnpm typecheck`     | types                                              |
| cmdValidate  | `pnpm deps:validate` | dependency-boundary validation                     |
| cmdFormat    | `pnpm format:check`  | format hygiene (check-only — `pnpm format` writes) |

An empty or missing slot means **ask** — never invent a command. A Verify item
whose command cannot be resolved reads Unverified, not Pass.

## Agent role

You are an implementation or review worker. Suspec organizes the work; you perform
the assigned task — and you never review your own implementation.
