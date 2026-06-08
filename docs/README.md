# Documentation

This documentation defines the architectural rules, coding conventions, testing guidelines, and the documentation-first workflow used by the Swarm CLI.

> **Note**: These files are meant for human reading and understanding the project's structure. For the authoritative rules that AI agents follow, see `AGENTS.md` (the Swarm bootloader) and the self-contained skills in `.claude/skills/*/SKILL.md`.

## Engineering Guidelines

- ➡️ **[Architecture](./05-architecture.md)** — DDD module boundaries, public contracts, and private internals.
- ➡️ **[Testing](./06-testing.md)** — Vitest layout, mocks, and test file organization.
- ➡️ **[Conventions](./07-conventions.md)** — Explicit control flow, naming, and language anti-patterns.

## The Swarm workflow

The Swarm CLI runs on the Swarm spec discipline: messy inputs become SOL obligation specs, work is bounded
to assigned obligations, and a merge gate clears it on reviewable evidence. The agent-facing rules are not in
this `docs/` tree — they live in the live Swarm surface:

- ➡️ **[`AGENTS.md`](../AGENTS.md)** — the always-loaded bootloader (startup, project facts, command bindings).
- ➡️ **[`.claude/skills/`](../.claude/skills/)** — the step guides (author → lint → improve → lower → decompose → implement → verify → review → promote) + persona stances, each carrying its procedure inline.
- ➡️ **[`.agents/reference/`](../.agents/reference/)** — the closed-set reference cards (SOL grammar, proofs/verdicts/adequacy, the IR).
- ➡️ **[`specs/`](../specs/)** — the toolchain specs themselves.
