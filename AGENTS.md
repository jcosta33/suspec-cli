# AGENTS.md — swarm-cli

<!-- Swarm bootloader (always-loaded, facts-only, MUST stay <= 200 lines / 25 KB).
     Pass procedures, the SOL/APS manual, and full memory load on demand from `.swarm/kernel/`. -->

## Swarm startup
1. Read the current task file first.
2. The Swarm workspace is `.swarm/` (canonical intent, status, memory, and the installed kernel).
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
- Full architecture + conventions + safety detail: **`.swarm/overlays/repo-conventions.md`**. Human coding conventions: `docs/07-conventions.md`.

## Pointers
- Language reference (SOL / APS / errors / versioning): `.swarm/kernel/language/`
- Memory recall map (says *when to load* each entry; never dumped here): `.swarm/memory/INDEX.md`
- Passes + skills (pass guides, per-kind implement & author guides, heuristic-profile persona-* stances, fragments): `.swarm/kernel/`
- Project rule bundles (overlays): `.swarm/overlays/` (project-owned; survives kernel upgrades)

## Compatibility
The kernel skills live at `.swarm/kernel/skills/`; this repo bridges them into `.claude/skills` (a symlink
to `.swarm/kernel/skills/`) so Claude Code discovers them. That surface is a one-directional mirror;
canonical Swarm artifacts live in `.swarm/`.

## Commands
<!-- Each `cmd*` slot is the adapter a `VERIFY BY <type>:<adapter>:<artifact>` clause resolves through
     (see `.swarm/kernel/passes/verify.md`). SOFT control: names what a future launcher WOULD run. -->
| Slot         | Command                          | Resolves proof types          |
| ------------ | -------------------------------- | ----------------------------- |
| cmdTest      | `pnpm test:run`                  | test                          |
| cmdTypecheck | `pnpm typecheck`                 | static                        |
| cmdLint      | `pnpm lint`                      | static                        |
| cmdValidate  | `pnpm deps:validate`             | static (dependency-boundary)  |
| cmdFormat    | `pnpm format`                    | (format hygiene)              |
