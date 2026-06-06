# AGENTS.md — swarm-cli

<!-- Swarm bootloader (always-loaded, facts-only, MUST stay <= 200 lines / 25 KB).
     Pass procedures load on demand from the self-contained skills in `.claude/skills/`;
     the SOL/APS manual is not installed (read it in the swarm repo).
     This repo is CO-LOCATED (Swarm spec-repo discipline, ADR-0050/0051): it authors its own
     toolchain specs (top-level specs/*.swarm.md) AND implements them, so it carries the full
     authoring kit + the implement-and-verify skill. A pure code repo would carry far less. -->

## Swarm startup
1. Read the current task file first.
2. Specs are top-level content: `specs/*.swarm.md` (this repo's toolchain specs). `.agents/` holds Swarm tooling — skills (in `.claude/skills/`, where Claude Code scans), `reference/` (rule cards), `templates/`, `memory/` (recall); `.agents/tasks/` holds task frames (gitignored execution scratch, since this repo also implements). No `.swarm/` mount, no version file.
3. Treat `.swarm.md` blocks as authoritative over prose summaries.
4. Use assigned obligation IDs as scope.
5. Decide isolation before editing (see the `implement` pass): a code task with a source spec/audit runs in a `worktree+branch` named for the spec, off the base — never on it; a bare ad-hoc edit stays `in-place`.
6. Load only the pass / profile / context files the task names.
7. Map every completion claim to evidence.
8. Promote durable discoveries before closing.

## Universal rules
- Do not implement behavior outside assigned obligations.
- Do not treat chat as higher authority than an approved spec or ADR.
- Do not close a task with unhandled promotion items.
- Do not claim completion without evidence.

## Project facts
- **What this repo is:** a TypeScript CLI being redesigned into a **Swarm-native toolchain**. Target layout is a pnpm monorepo `packages/{core,cli,tui,adapter-sdk,verifier-exec,testkit}` — `core` (swarm-core: SOL parser/IR, verifier runner, worktree-lease manager, ledger) owns semantics; `cli`/`tui` are the operator shell over it. The legacy single-package `src/` still exists during the transition.
- **Stack:** TypeScript (strict soundness); Node ≥ 22.6 (run via `--experimental-strip-types`); package manager **pnpm**; tests in **Vitest** (`__tests__/` siblings). No UI, no Rust — ignore any earlier React/TanStack/Tauri-audio guidance; it was copied from another project and does not apply.
- **Architecture discipline:** DDD module boundaries — cross-module imports only via a module's root `index.ts`; internals (`models/`/`repositories/`/`services/`) private; one function per use-case/repository file; `src/infra/**` MUST NOT import `src/modules/**` (`infra-isolation`).
- **The verification gate:** `pnpm deps:validate` (dependency-cruiser) MUST pass with **zero** architectural violations before a cross-module change is done.
- **Safety (bypass-permissions mode):** never delete/rename/overwrite a file without an explicit instruction; no destructive git; no codemods / bulk find-replace / global `--fix`; stage only intentionally-changed files; when unsure, log a `QUESTION` rather than act.
- **Working discipline:** show-don't-tell (paste real command output as proof); trace blast radius with `pnpm typecheck`; after 3 failed fix attempts, stop and re-strategize.
- Full architecture + conventions + safety detail: **`.agents/repo-conventions.md`**. Human coding conventions: `docs/07-conventions.md`.

## Pointers
- Skills (a pass guide for each of the 9 passes, per-kind implement & author guides, persona-* stances, fragments — Swarm's + this repo's own, side by side): `.claude/skills/`. Each carries its pass *procedure* inline.
- Operative reference cards (the shared closed-set rules — SOL grammar, proofs/verdicts/adequacy, the IR/edges): `.agents/reference/` (`sol.md`, `proofs.md`, `ir.md`). Load the card for the pass you're running.
- Specs: `specs/` (source `*.swarm.md`, top-level content). Execution scratch: `.agents/tasks/` (frames; gitignored). Recall: `.agents/memory/` (`INDEX.md` is the load-*when* map).
- Project conventions: `.agents/repo-conventions.md` + `## Project facts` above. Project config: `.agents/swarm.config.yaml`.
- Full SOL / APS / passes manuals (not installed — read in the `swarm` repo for the *why*): `<swarm-repo>/docs/`

## Compatibility
Swarm's skills and this repo's own skills are **real directories in `.claude/skills/`** (the dir Claude Code scans), side by side — no separate home, no symlink bridge. Their names (`pass-*`/`persona-*`/`write-*` for Swarm; `architecture-violations`, `event-bus-and-results`, `state-and-write-paths`, `testing-file-layout`, `documentation-gatekeeper` for this repo) don't collide. An upgrade re-copies Swarm's named skills; the repo's own are untouched. The shared closed-set rules live in `.agents/reference/`; the full SOL/APS/passes manuals (the *why*) are not installed — read them in the `swarm` repo.

## Commands
<!-- Each `cmd*` slot is the adapter a `VERIFY BY <type>:<adapter>:<artifact>` clause resolves through
     (the `verify` pass; full reference in the Swarm repo). SOFT control: names what a future launcher WOULD run. -->
| Slot         | Command                          | Resolves proof types          |
| ------------ | -------------------------------- | ----------------------------- |
| cmdTest      | `pnpm test:run`                  | test                          |
| cmdTypecheck | `pnpm typecheck`                 | static                        |
| cmdLint      | `pnpm lint`                      | static                        |
| cmdValidate  | `pnpm deps:validate`             | static (dependency-boundary)  |
| cmdFormat    | `pnpm format`                    | (format hygiene)              |
