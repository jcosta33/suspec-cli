# AGENTS.md — suspec-cli

Facts in, diagnostics out. This repository owns Suspec's deterministic CLI, command contract,
implementation, and tests. Product decisions and the machine contract live in
[Suspec](https://github.com/jcosta33/suspec).

## Boundaries

- Keep primary paths and review companions explicit.
- Preserve exit `0` clean, `1` warning, and `2` blocking or usage error.
- Emit one JSON value per report; several reports form JSON Lines.
- Keep check semantics pure over parsed inputs and injected predicates.
- Keep filesystem reads at explicit-path command boundaries.
- Match the canon contract through `SUSPEC_CANON` and CI drift guards.

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
