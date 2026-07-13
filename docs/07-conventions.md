# Conventions

These conventions supplement `.agents/repo-conventions.md`. ESLint, TypeScript, Prettier, Knip, and
dependency-cruiser enforce the machine-checkable parts.

## Names

- Files use `camelCase.ts`; type and class names use `PascalCase`.
- Exported module functions use descriptive `snake_case` names and function declarations.
- Variables and local helpers use `camelCase`.
- Error types end in `Error`.
- Prefer domain names such as `diagnostic`, `report`, `sourcePath`, and `companion` over generic
  `data`, `item`, or abbreviations.

```ts
export function build_source_exists(artifactPath: string): (ref: string) => boolean {
    const artifactDirectory = dirname(artifactPath);
    return (ref) => existsSync(resolve(artifactDirectory, ref));
}
```

Functions with several inputs take one object argument. Keep its named input type beside the
function. Scalar inputs may remain positional when their meaning is unambiguous.

## Imports And Exports

Order imports by built-in, external, parent, then sibling source. Separate groups with a blank line.
Use explicit `.ts` extensions for source imports.

```ts
import { readFileSync } from 'node:fs';

import color from 'picocolors';

import { check_spec } from '../../Core/useCases/index.ts';
import { format_check_report } from '../services/renderCheckReport.ts';
```

Use named exports and explicit type imports. Do not use namespace imports, default exports, enums, or
cross-module deep imports.

## Control Flow

- Put braces around every conditional and loop body.
- Prefer guard clauses to nested branches.
- Avoid nested ternaries and short-circuit calls.
- Use `===` and `!==`.
- Prefer explicit conversion (`Number`, `String`, `Boolean`) to coercion tricks.

```ts
export function level_for(diagnostics: readonly Diagnostic[]): OutcomeLevel {
    if (diagnostics.some((entry) => entry.severity === 'hard-error')) {
        return 'blocking';
    }
    if (diagnostics.length > 0) {
        return 'warning';
    }
    return 'clean';
}
```

## Types

Use `type`, discriminated unions, and `Readonly` records to model real shapes. Narrow `unknown` at
I/O boundaries. Do not use `any`, broad object placeholders, unjustified assertions, or suppression
comments to bypass a type error.

Keep module-private types private. A consumer should depend on the smallest structural shape it uses,
not import an internal data-transfer type from another module.

## Errors And Output

Use `Result<T, AppError<...>>` where a caller must discriminate a recoverable boundary failure. Keep
check diagnostics as data. Commands render reports; Unix outcome helpers own stdout, stderr, and exit
mapping.

Do not log from pure parsers or checks. Do not turn severity into a review judgment.

## Verification

Run `pnpm format:check`, `pnpm typecheck`, `pnpm lint`, `pnpm deps:validate`, `pnpm unused`, focused
tests, and the complete `pnpm gate` as appropriate. Do not claim a check passed without its actual
output.
