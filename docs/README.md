# Documentation

This documentation defines the architectural rules, coding conventions, testing guidelines, and the documentation-first workflow used by the Swarm CLI.

> **Note**: These files are meant for human reading and understanding the project's structure. For the authoritative rules that AI agents follow, see `AGENTS.md` (the Swarm bootloader) and the self-contained skills in `.claude/skills/*/SKILL.md`.

## Engineering Guidelines

- ➡️ **[Architecture](./05-architecture.md)** — DDD module boundaries, public contracts, and private internals.
- ➡️ **[Testing](./06-testing.md)** — Vitest layout, mocks, and test file organization.
- ➡️ **[Conventions](./07-conventions.md)** — Explicit control flow, naming, and language anti-patterns.

## The Swarm workflow

The Swarm CLI runs on the Swarm working discipline: specs carry verifiable requirements, a task
packet bounds each unit of agent work, and the review packet clears it on pasted evidence. The
agent-facing rules are not in this `docs/` tree — they live in the live Swarm surface:

- ➡️ **[`AGENTS.md`](../AGENTS.md)** — the always-loaded bootloader (startup, project facts, command bindings).
- ➡️ **[`.claude/skills/`](../.claude/skills/)** — the `implement-task` guide plus this repo's engineering skills, each carrying its procedure inline.
- ➡️ **The kit** — [swarm-starter-kit](https://github.com/jcosta33/swarm-starter-kit), which `swarm init` clones (its `advanced/` carries the SOL + checks reference cards).
- ➡️ **Toolchain specs** — in the Swarm workspace (the sibling `swarm-hq` repo, `specs/`).
