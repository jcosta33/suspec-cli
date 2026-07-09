# AGENTS.md — suspec-cli

<!-- Always-loaded bootloader (aim ~100 lines). Procedures load on demand from
     `.agents/skills/`. This is a CODE repo: Suspec working artifacts for it are
     transient and live in the personal store, outside the repo (ADR-0137). -->

## Suspec

- Working artifacts: the store (`~/.claude/state/<repo>/`) carries the transient
  working artifacts — specs, runs, reviews, evidence, findings, intake — and is
  never committed anywhere. Accepted framework decisions are canon in
  `../corpus/docs/adrs/`; durable value leaves the store only by promotion
  (ADRs, tests, issues, PR digests).
- Implement against the spec (or task slice) you are given: read it first; stay
  inside its scope (if a requirement can't be met as written, stop and say why
  instead of improvising); run every item under its `## Verify` and paste the
  real output (a claim without output counts as unverified); fill the run
  record (`## Run summary`, or the spec's `## Execution` for 1:1 work);
  re-read your own diff as a skeptic before handoff. Guide:
  `.agents/skills/implement-task/`.
- suspec-cli is the **reconcile-only harness**: it prepares,
  checks, and reconciles the Suspec loop and never runs the model loop. Surface:
  `init · update · check · worktree · status · clean · stamp · review · new · write · pull · promote · fix · store · work · evidence · done · check-my-work · next · show · agents`
  (+ `help`) — each a direct command; the daily reconcile flows
  (`init · check · worktree · status · review · new`) also take `-i`, and
  `suspec` with no args opens the dashboard.
  `suspec init` seeds the repo in place — `suspec.config.json`, `AGENTS.md` if
  absent, the skills dirs — and never clones a workspace or touches the store;
  `suspec update` refreshes the kit-owned templates (from the suspec-starter-kit
  by default) conflict-safely. The
  checks contract this CLI implements lives in the suspec repo,
  `checks/checks.yaml` (that file's `version:` is the contract version of record —
  don't pin a copy of it here), reimplemented in code at
  `src/modules/Core/services/checksContract.ts` and drift-guarded against it whenever a sibling
  canon checkout is present (SUSPEC_CANON / `../suspec` / any canon-shaped sibling — the guard
  skips loudly otherwise; CI checks out the canon beside this repo in
  `.github/workflows/gate.yml`, so the guard bites on every push/PR).

## Project facts

- TypeScript, pnpm, vitest, eslint, dependency-cruiser; entry `bin/suspec.js` →
  `src/index.ts` (the in-process dispatcher). Modules: `Core` (the four engines and the
  `unixOutcome` contract), `Sol` (the plain-form spec parser), `Workspace` (git worktrees),
  `Terminal` (arg parsing), `Commands` (the thin wrappers), `Tui` (the interactive flows and
  renderers). `src/infra` is the `Result`/`AppError` algebra plus the shared pure markdown/YAML scan utilities.
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
  `docs/06-testing.md`. (The CLI reads/writes a consumer-side `suspec.config.json`
  in the repo it operates on; this repo carries no project-config file of its own.)

## Commands

| Slot         | Command              | Purpose                        |
| ------------ | -------------------- | ------------------------------ |
| cmdTest      | `pnpm test:run`      | run the test suite             |
| cmdLint      | `pnpm lint`          | static checks                  |
| cmdTypecheck | `pnpm typecheck`     | types                          |
| cmdValidate  | `pnpm deps:validate` | dependency-boundary validation |
| cmdFormat    | `pnpm format:check`  | format hygiene (check-only — `pnpm format` writes) |

An empty or missing slot means **ask** — never invent a command. A Verify item
whose command cannot be resolved reads Unverified, not Pass.

## Agent role

You are an implementation or review worker. Suspec organizes the work; you perform
the assigned task — and you never review your own implementation.
