# Decisions (ADRs)

Architecture decisions for swarm-cli, numbered and immutable (Nygard). A decision is superseded by a new
ADR, never edited in place. Newest-relevant first.

| ADR | Decision |
| --- | --- |
| [0001](./0001-single-tool-no-monorepo.md) | swarm-cli is a **single tool** in `/src` — no monorepo, no published partials; the SOL semantics are core `src/modules/` governed by dependency-cruiser. |
