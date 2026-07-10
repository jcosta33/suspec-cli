# Documentation

This documentation defines the architectural rules, coding conventions, and testing guidelines for the Suspec CLI, and points to where the working discipline lives (the live Suspec surface, below).

> **Note**: These files are meant for human reading and understanding the project's structure. For the authoritative rules that AI agents follow, see `AGENTS.md` (the Suspec bootloader) and the self-contained skills in `.claude/skills/*/SKILL.md`.

## Engineering Guidelines

The numbers (05–07) are inherited from a shared docs convention; 01–04 are reserved upstream, so the
tree starting at 05 is not four missing documents.

- ➡️ **[Architecture](./05-architecture.md)** — DDD module boundaries, public contracts, and private internals.
- ➡️ **[Testing](./06-testing.md)** — Vitest layout, mocks, and test file organization.
- ➡️ **[Conventions](./07-conventions.md)** — Explicit control flow, naming, and language anti-patterns.

## The Suspec workflow

The Suspec CLI is developed with the Suspec working discipline: specs carry verifiable
requirements, each unit of agent work is bounded by the spec (or a task slice cut from it), and
every completion claim binds to pasted evidence. The agent-facing rules are not in this `docs/`
tree — they live in the live Suspec surface:

- ➡️ **[`AGENTS.md`](../AGENTS.md)** — the always-loaded bootloader (startup, project facts, command bindings).
- ➡️ **[`.claude/skills/`](../.claude/skills/)** — the `implement-task` guide plus this repo's engineering skills, each carrying its procedure inline.
- ➡️ **Working artifacts** — specs, tasks, reviews, and findings for changes to this repo live beside the developer's own native artifacts, outside the repo, named by explicit path; accepted decisions are canon in the suspec repo's `docs/adrs/`.
