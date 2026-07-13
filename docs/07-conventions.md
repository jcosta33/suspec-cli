# Conventions

[`.agents/repo-conventions.md`](../.agents/repo-conventions.md) owns coding rules. ESLint, TypeScript,
Prettier, Knip, and dependency-cruiser enforce their machine-checkable subset.

Key boundaries:

- cross-module imports use destination barrels;
- module internals use concrete relative paths;
- Commands own I/O and rendering;
- Core owns deterministic semantics;
- Sol owns parsing;
- infra remains a leaf;
- diagnostics stay data;
- humans retain review judgment.

Verify with `pnpm gate`.
