# Testing

Vitest tests live beside their owner. Keep ownership visible in the path.

```text
src/modules/Core/useCases/checkSpec.ts
src/modules/Core/useCases/__tests__/checkSpec.spec.ts

src/modules/Core/services/checksContract.ts
src/modules/Core/__tests__/checksContract.spec.ts
```

Private-service tests live at the module test root. Shared test helpers remain private.

## Boundaries

- Pure parsers and rules use literal inputs and exact outputs.
- Use cases receive real parsed text and injected predicates.
- Filesystem resolvers use cleaned temporary directories.
- Command tests assert stdout, stderr, exit code, and relevant payload.
- Drift guards use a real canon checkout or announce an explicit skip.
- Mock only the external boundary not under test.

A public check change covers parser shape, pure behavior and severity, use-case wiring, observable
command output, exit mapping, and canon parity as applicable.

Parse each non-empty multi-report `--json` line independently.

## Commands

```bash
pnpm test
pnpm test:run
pnpm coverage
pnpm gate
```

Use focused tests while editing, then `pnpm gate`.

## Quality

One test, one behavioral reason to fail. A green vague assertion is still useless. Assert exact
values, diagnostics, streams, and exits. Avoid real time, network, ordering, and unstable snapshots.
Use filesystem fixtures only for filesystem behavior. A regression test must fail before its
root-cause fix.
