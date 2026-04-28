# Documentation

This documentation defines the architectural rules, coding conventions, testing guidelines, and the documentation-first workflow used by the Swarm CLI.

> **Note**: These files are meant for human reading and understanding the project's structure. For the authoritative, machine-enforced rules that AI agents follow, see `.agents/skills/*/SKILL.md`.

## Engineering Guidelines

- ➡️ **[Architecture](./05-architecture.md)** — DDD module boundaries, public contracts, and private internals.
- ➡️ **[Testing](./06-testing.md)** — Vitest layout, mocks, and test file organization.
- ➡️ **[Conventions](./07-conventions.md)** — Explicit control flow, naming, and language anti-patterns.

## Documentation workflow

The Swarm CLI is built around a documentation-first constraint. Before writing significant code, agents read, produce, or update documents that capture what they know, what they found, what they decided, and what they are about to do.

- ➡️ **Read about the [agent process](./agents/01-process.md)**
- ➡️ **Read about the [agent workflow](./agents/03-workflow.md)**
- ➡️ **Read about [file types](./agents/02-file-types.md)** and [standards](./agents/04-standards.md)
