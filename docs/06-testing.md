# Testing

The repository uses Vitest. Tests live in `__tests__` directories near the code they exercise.

## Layout

For a use case, place its test beside the owning use-case directory:

```text
src/modules/Core/useCases/checkSpec.ts
src/modules/Core/useCases/__tests__/checkSpec.spec.ts
```

Tests for private module services live at the module's test root:

```text
src/modules/Core/services/checksContract.ts
src/modules/Core/__tests__/checksContract.spec.ts
```

Infra tests follow the same nearby-directory rule. Shared test-only helpers stay in an owning
module's `testing` or `__tests__` directory and are not exported through the production barrel.

## Test Through Real Boundaries

- Pure parser and contract helpers use literal inputs and exact output assertions.
- Use cases receive real parsed text and simple injected predicates.
- Filesystem resolver tests use temporary directories and clean them after each test.
- Command tests capture stdout and stderr and assert the exit code plus the relevant payload.
- Drift guards use a real sibling canon checkout when available and announce an explicit skip when
  it is absent.

Mock only the boundary whose behavior is not under test. Do not mock a private helper merely to make
the subject easier to reach.

## Contract Tests

Changes to a public check require evidence at every affected layer:

- parser behavior, when the input shape changes;
- pure check behavior and severity;
- use-case wiring, so the check cannot be dropped silently;
- command output and exit mapping, when externally observable behavior changes;
- canon parity, when the checks contract changes.

Multi-report `--json` tests parse each non-empty stdout line independently. A concatenated stream is
JSON Lines, not one JSON document.

## Commands

```bash
pnpm test            # watch mode
pnpm test:run        # one test run
pnpm coverage        # coverage gate
pnpm gate            # complete repository gate
```

Use a focused Vitest path while iterating, then run `pnpm gate` before handoff.

## Test Quality

- Give each test one behavioral reason to fail.
- Assert values, diagnostics, streams, and exit codes rather than truthiness.
- Keep fixtures deterministic. Avoid real time, network calls, and test ordering.
- Use temporary files only when filesystem behavior is the subject.
- Assert stable output fields directly; use snapshots only for stable literal structures.
- A regression test must fail for the demonstrated defect and pass after the root cause is fixed.
