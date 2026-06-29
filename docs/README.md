# Documentation

This documentation defines the architectural rules, coding conventions, and testing guidelines for the Corpus CLI, and points to where the working discipline lives (the live Corpus surface, below).

> **Note**: These files are meant for human reading and understanding the project's structure. For the authoritative rules that AI agents follow, see `AGENTS.md` (the Corpus bootloader) and the self-contained skills in `.claude/skills/*/SKILL.md`.

## Engineering Guidelines

The numbers (05–07) are inherited from a shared docs convention; 01–04 are reserved upstream, so the
tree starting at 05 is not four missing documents.

- ➡️ **[Architecture](./05-architecture.md)** — DDD module boundaries, public contracts, and private internals.
- ➡️ **[Testing](./06-testing.md)** — Vitest layout, mocks, and test file organization.
- ➡️ **[Conventions](./07-conventions.md)** — Explicit control flow, naming, and language anti-patterns.

## The Corpus workflow

The Corpus CLI runs on the Corpus working discipline: specs carry verifiable requirements, a task
packet bounds each unit of agent work, and the review packet clears it on pasted evidence. The
agent-facing rules are not in this `docs/` tree — they live in the live Corpus surface:

- ➡️ **[`AGENTS.md`](../AGENTS.md)** — the always-loaded bootloader (startup, project facts, command bindings).
- ➡️ **[`.claude/skills/`](../.claude/skills/)** — the `implement-task` guide plus this repo's engineering skills, each carrying its procedure inline.
- ➡️ **The kit** — [corpus-starter-kit](https://github.com/jcosta33/corpus-starter-kit), which `corpus init` clones (its `advanced/` carries the SOL + checks reference cards).
- ➡️ **Toolchain specs** — in the Corpus workspace (the sibling `corpus-works` repo, `specs/`).
