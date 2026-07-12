# suspec-cli Repository Conventions

Load this guide when changing TypeScript, module boundaries, or build configuration in this
repository.

## Module Boundaries

- Cross-module imports target the destination module's `useCases/index.ts` barrel.
- Imports within a module target concrete files by relative path; a module does not import its own
  barrel.
- A barrel exports only functions another module consumes. Types declared by a use case remain
  private; consumers use a local structural type, `ReturnType`, or `Parameters` when needed.
- `models`, `services`, and `testing` are module-private. Do not re-export private helpers to make a
  dependency rule pass.
- `src/infra` contains shared leaf-level utilities and must not import `src/modules`.
- A use-case file owns one exported operation. Keep parsing helpers and pure contract rules in
  private services when they do not form a cross-module operation.

Run `pnpm deps:validate` after changing imports or module structure.

## Checker Boundary

The CLI accepts explicit paths and performs read-only checks. It owns no project state, configuration,
artifact store, agent loop, or review judgment.

- Commands own filesystem reads, argument handling, and rendering.
- Core owns check semantics and returns structured results.
- Sol owns Markdown and frontmatter parsing.
- Terminal owns option parsing.
- Inject filesystem predicates into Core when a contract check must resolve an artifact-relative
  reference. Do not hide path discovery inside a pure check.
- Write data to stdout and diagnostics about invocation failures to stderr through the Unix outcome
  helpers.

## TypeScript

- Prefer `type` to `interface`, `as const` objects to enums, and explicit type imports.
- Use named exports. Module functions use descriptive `snake_case` names and function declarations.
- Functions with several inputs take one object argument with a nearby named input type.
- Use guard clauses, braces on every control-flow body, and no nested ternaries.
- Do not silence errors with `any`, unjustified assertions, or suppression comments. Narrow `unknown`
  values at I/O boundaries.
- Preserve explicit `.ts` extensions on source imports under NodeNext resolution.

## Verification

Run the narrowest relevant test while editing, then `pnpm gate` before handoff. The gate checks
formatting, types, lint, dependency boundaries, unused code, coverage, and the production build.

Inspect every file before staging it. Do not use destructive git operations or rewrite unrelated
work.
