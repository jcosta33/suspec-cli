# AGENTS.md — suspec-cli

Facts in, diagnostics out. This repository owns Suspec's deterministic checker, reversible harness
setup, command contracts, implementation, and tests. Product decisions and machine contracts live in
[Suspec](https://github.com/jcosta33/suspec).

## Boundaries

- Keep primary paths and task companions explicit.
- Preserve exit `0` clean, `1` warning, and `2` blocking or usage error.
- Emit one JSON value per report; several reports form JSON Lines.
- Keep check semantics pure over parsed inputs and injected predicates.
- Limit filesystem reads to handed paths and local references they name.
- Match the canon contract through `SUSPEC_CANON` and CI drift guards.
- Keep setup isolated from checking. Explicit targets only. Use normal native instruction files.
  Inline neutral owned blocks. Preview before mutation. Restore foreign bytes exactly. Refuse
  ambiguity or drift.
- Keep the generated agent policy byte-equal to the canon repository's
  `SUSPEC_CANON/policy/agent.md` and its predecessor set equal to
  `SUSPEC_CANON/policy/agent-policy-predecessors.txt` plus the current digest.

Architecture, testing, and coding rules live under [`docs/`](docs/) and
[`.agents/repo-conventions.md`](.agents/repo-conventions.md).

## Commands

| Slot           | Command              |
| -------------- | -------------------- |
| `cmdTest`      | `pnpm test:run`      |
| `cmdLint`      | `pnpm lint`          |
| `cmdTypecheck` | `pnpm typecheck`     |
| `cmdValidate`  | `pnpm deps:validate` |
| `cmdFormat`    | `pnpm format:check`  |
| `cmdUnused`    | `pnpm unused`        |
| `cmdGate`      | `pnpm gate`          |

Use `pnpm format` only on intended edits.
