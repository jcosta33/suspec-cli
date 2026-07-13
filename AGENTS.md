# AGENTS.md - suspec-cli

This repository contains the deterministic command-line checker for Suspec. Product decisions live
in the [Suspec ADRs](https://github.com/jcosta33/suspec/tree/main/docs/adrs); this repository owns the
checker implementation, its command surface, and its tests.

## Working With Suspec

- Read every supplied source, spec, or task packet before editing. Keep the change inside its stated
  scope, run every named verification command, and preserve the command output in the current run
  notes.
- Ordinary Suspec working artifacts for this repository live under
  `~/.agents/artifacts/<workspace>/` and are handed to every consumer by absolute path.
- Do not invent a command for an empty command slot. Ask when a required command cannot be resolved.
- Review your diff before handoff. Do not issue a review judgment on work you implemented yourself.
- Repository-specific guides live under `.agents/skills/`.

## Checker Contract

The public surface is `suspec check`:

```text
suspec check <path> [<path>...]
suspec check <review-path> --spec <spec-path> [--task <task-path>]
suspec check --contract
```

- Primary paths and review companions are explicit. The checker does not discover a project root,
  configuration file, or artifact store.
- Source links and change-plan references use the artifact-relative resolution rules documented in
  `README.md`.
- Exit codes are part of the API: `0` clean, `1` warning, `2` blocking or usage error.
- `--json` emits one JSON value per report. Invocations that produce several reports use JSON Lines.
- The contract of record is `checks/checks.yaml` in the Suspec repository. This implementation lives
  in `src/modules/Core/services/checksContract.ts`; tests compare it with a sibling canon checkout
  when one is available through `SUSPEC_CANON`, `../suspec`, or shape-based sibling discovery. CI
  supplies that checkout.

## Architecture

- `src/modules/Commands`: command orchestration, usage, and human-readable rendering.
- `src/modules/Terminal`: argument parsing.
- `src/modules/Core`: checks, review reconciliation, reference resolution, and Unix outcome mapping.
- `src/modules/Sol`: artifact record parsing.
- `src/infra`: shared errors, strict frontmatter parsing, and Markdown scanning.
- Cross-module imports go through the destination module's `useCases/index.ts`. Imports inside a
  module use relative paths to concrete files.
- A module's `models`, `services`, and `testing` directories are private. `src/infra` never imports
  from `src/modules`.
- Keep the check engine pure over parsed inputs and injected predicates. Filesystem reads belong at
  explicit-path boundaries.

Details: `.agents/repo-conventions.md`, `docs/05-architecture.md`, `docs/06-testing.md`, and
`docs/07-conventions.md`.

## Commands

| Slot           | Command              | Purpose                                      |
| -------------- | -------------------- | -------------------------------------------- |
| `cmdTest`      | `pnpm test:run`      | Run the test suite                           |
| `cmdLint`      | `pnpm lint`          | Run ESLint                                   |
| `cmdTypecheck` | `pnpm typecheck`     | Check TypeScript types                       |
| `cmdValidate`  | `pnpm deps:validate` | Validate dependency boundaries               |
| `cmdFormat`    | `pnpm format:check`  | Check formatting without writing             |
| `cmdUnused`    | `pnpm unused`        | Find unused files, exports, and dependencies |
| `cmdGate`      | `pnpm gate`          | Run the complete repository gate             |

Use `pnpm format` only when formatting intended edits. Never use destructive git commands, stage
uninspected files, or overwrite unrelated work.
