# Conventions

This guide defines coding conventions and patterns for clarity, consistency, and maintainability in the Suspec CLI.

## TypeScript soundness

Agent-enforced rules for typing and tests — no `any` escapes, lazy assertions, or suppression comments without justification — are **canonical in `.agents/repo-conventions.md`** under *TypeScript conventions* (the **Soundness** bullet). Follow that section for implementation; this document does not repeat it.

## Control flow

All control flow is explicit. The rules, each stated once:

- **Always block statements** (`{...}`) for every conditional, even single-line ones — never a collapsed `if`. ([`curly`](https://eslint.org/docs/latest/rules/curly))
- **Guard clauses / early returns** over deep nesting or a single trailing return.
- **No chained or nested ternaries** — branch with `if`/early returns instead.
- **No short-circuit invocation** (`onClick && onClick();`) — write the explicit `if`.
- **Keep logic framework-agnostic**: pure business functions, thin CLI wrappers over them.

```typescript
// ✅ Good: Guard clauses, block conditionals, early returns
export const validateWorkspace = (workspace: Workspace): void => {
    if (!workspace) {
        throw new Error('Missing workspace');
    }

    if (workspace.isArchived) {
        return;
    }

    processWorkspace(workspace.path);
};

// ❌ Bad: Short-circuit invocation, collapsed ifs, chained ternary
export const validateWorkspace = (workspace: Workspace): void => {
    if (!workspace) throw new Error('Missing workspace');
    workspace && !workspace.isArchived && processWorkspace(workspace.path);
};
const roleLabel = !user ? '—' : user.isAdmin ? 'Admin' : user.isEditor ? 'Editor' : 'User';
```

### Keep logic framework-agnostic

Separate pure business logic from CLI presentation concerns.

```typescript
// ✅ Good: Pure function + thin CLI wrapper
export const computeSlug = (title: string): string => {
    return title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
};

// In the command handler:
const slug = computeSlug(input.title);
console.log(`Created sandbox: ${slug}`);
```

## Naming conventions

Canonical in `.agents/repo-conventions.md` (*TypeScript conventions*); the worked examples below are
the human-facing illustration of those rules.

### File names

```text
✅ Good
useCases/git.ts           # camelCase for utilities and use cases
models/Config.ts          # PascalCase for types/models
helpers/formatTime.ts     # camelCase for utilities

❌ Bad
use_cases/git.ts          # snake_case
helpers/format-time.ts    # kebab-case
```

### Variable and function names

Variables are `camelCase`. Module-level functions are `snake_case` and declared with `export function` (not `export const` arrows). Both are descriptive and verbose — no abbreviations.

```typescript
// ✅ Good: Descriptive, verbose names
const currentUserPermissions = getUserPermissions();
const isWorkspaceDirty = workspace.status === 'dirty';

export function current_branch(repoRoot: string): string | null {
    // ...
}

// ❌ Bad: Abbreviated, unclear names
const usrPerms = getUserPermissions();
const isDrt = workspace.status === 'dirty';

export function cur_br(r: string): string | null {
    // ...
}
```

### Type and class names

- Types and classes must be `PascalCase`.
- Errors should end with `Error`.

```typescript
// ✅ Good: PascalCase for types and classes
export class WorkspaceNotFoundError extends Error {
    /* */
}

export type WorkspaceConfig = {
    name: string;
    path: string;
};
```

## Import patterns

Module-boundary rules are canonical in `.agents/repo-conventions.md` (*Module architecture* +
*TypeScript conventions*); the examples below illustrate them.

```typescript
// ✅ Good: Import specific types / methods
import { type WorkspaceConfig } from '../models/Config.ts';
import { execSync } from 'node:child_process';

// ❌ Bad: Namespace imports
import * as path from 'node:path';
```

### Type-only imports and import order

- Use type-only imports (`import { type MyType }`) for all type imports.
- Organize imports in the following order, with newlines between groups and alphabetical sorting within groups:
    1.  Built-in (e.g., `node:fs`, `node:path`, ...)
    2.  External (e.g., `@clack/prompts`, `ora`)
    3.  Parent (`../`)
    4.  Sibling (`./`)
    5.  Index

```typescript
// ✅ Good
import { execSync } from 'node:child_process';
import { select } from '@clack/prompts';
import { getWorkspace } from '../../modules/Workspace/index.ts';

// ❌ Bad: Mixed order and missing type-only imports
import { getWorkspace } from '../../modules/Workspace/index.ts';
import { execSync } from 'node:child_process';
```

### Export patterns

Module-level functions are declared with `export function`, not `export const` arrows. Always named exports — never default exports.

```typescript
// ✅ Good: Named function declaration
export function format_time(seconds: number): string {
    /* */
}

// ❌ Bad: Default export
function format_time(seconds: number): string {
    /* */
}
export default format_time;
```

### Import paths

- Cross-module imports use **relative paths to the module's root `index.ts`** with an explicit `.ts`
  extension (NodeNext resolution) — e.g. `import { resolve_repo_root } from '../../Workspace/useCases/index.ts';`.
  Within a module, use relative paths (`../services/…`, `./useCases/…`); never import your own root barrel.
- The `#/` alias is reserved for `src/infra` and is not used by module code today. No `src/` file imports
  via `#/` — match that.

## Function patterns

Canonical in `.agents/repo-conventions.md` (*TypeScript conventions*: single-object param,
`FunctionNameInput`/`FunctionNameOutput`); the examples below illustrate them.

### Function declarations

```typescript
// ✅ Good: Clear, descriptive function names
export function calculate_sandbox_path({ basePath, slug }: CalculateSandboxPathInput): string {
    return `${basePath}/${slug}`;
}

// ❌ Bad: Abbreviated, unclear names
export function calc_path(b: string, s: string): string {
    return `${b}/${s}`;
}
```

### Parameter patterns

```typescript
// ✅ Good: Descriptive parameter names
export const createNotification = ({ workspaceName, alertLevel, notificationType }): void => {
    // Implementation
};

// ❌ Bad: Single letter or abbreviated parameters
export const createNotif = (t: string, a: string, n: string): void => {
    // Implementation
};

// ✅ Good: Single object with descriptive properties
export const updateWorkspace = ({ workspaceId, isVisible, notifyUser, updateMeta }): void => {
    // Implementation
};

// ❌ Bad: Multiple boolean parameters - unclear what each does
export const updateWorkspace = (workspaceId: string, isVisible: boolean, notify: boolean, updateMeta: boolean): void => {
    // Implementation
};

// ❌ Bad: Function call is unclear without checking the signature
updateWorkspace('ws-123', true, false, true); // What do these booleans mean?

// ✅ Good: Function call is self-documenting
updateWorkspace({
    workspaceId: 'ws-123',
    isVisible: true,
    notifyUser: false,
    updateMeta: true,
});
```

### Function signatures

Functions with more than one parameter take a single object param. For module-level functions, the input type is named `FunctionNameInput` and the output type (if non-scalar) is named `FunctionNameOutput`; both are defined immediately above the function they belong to.

```typescript
type CreateSandboxInput = {
    slug: string;
    baseBranch: string;
};

type CreateSandboxOutput = {
    path: string;
    branch: string;
};

export function create_sandbox(input: CreateSandboxInput): CreateSandboxOutput {
    // ...
}
```

## Conventional programming patterns

Prefer conventional, explicit patterns over clever one-liners (the control-flow rules above). For
runtime polymorphism, prefer a strategy map over a branchy switch:

```typescript
// Strategy pattern (choose implementation at runtime)
type FormatStrategy = (input: string) => string;

const formatJson: FormatStrategy = (input) => JSON.stringify(input, null, 2);
const formatPlain: FormatStrategy = (input) => String(input);

export const formatOutput = (input: string, strategy: 'json' | 'plain'): string => {
    if (strategy === 'json') {
        return formatJson(input);
    }
    return formatPlain(input);
};
```

## Language anti-patterns

```ts
// ❌ Bad: Truthy hacks and coercions
const name = user.name || 'Anonymous'; // Falls back on empty string
const count = +input; // Implicit number coercion
const enabled = !!maybeTruthy; // Double negation

// ✅ Good: Explicit semantics
const name = user.name ?? 'Anonymous'; // Nullish coalescing
const count = Number(input);
const enabled = Boolean(maybeTruthy);

// ❌ Bad: Defaulting via || in params
function greet(name) {
    name = name || 'world';
}
// ✅ Good: Default parameters
function greet(name = 'world') {}
```

## Lint-aligned conventions

- **Equality and basics**: Use `===`/`!==` (no loose equality); prefer `const`; prefer template strings; no `eval`; no `debugger`.
- **Curly braces**: Required for all conditionals and loops. ([`curly`](https://eslint.org/docs/latest/rules/curly))
- **TypeScript**: Use `import { type MyType }`. ([`@typescript-eslint/consistent-type-imports`](https://typescript-eslint.io/rules/consistent-type-imports))
- **Promises**: Always handle promises (`return`/`catch`/`await`). Avoid floating promises.
- **Imports**: Enforce group order and alphabetical sort. ([`import/order`](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/order.md))
