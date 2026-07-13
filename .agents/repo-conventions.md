# Repository conventions

Load this guide for TypeScript, module boundaries, or build configuration.

## Modules

- Cross-module imports target the destination `useCases/index.ts`.
- Intra-module imports target concrete relative files; never import the module's own barrel.
- Export only cross-module operations. Keep `models`, `services`, and `testing` private.
- Keep `src/infra` leaf-only.
- Give each use-case file one exported operation.
- Inject filesystem predicates into Core; keep discovery at Commands boundaries.

```bash
pnpm deps:validate
```

## Ownership

- Commands: reads, arguments, rendering.
- Core: deterministic check semantics and structured results.
- Sol: Markdown and frontmatter parsing.
- Terminal: option parsing.
- Unix outcome helpers: stdout, stderr, and exit mapping.

The CLI accepts explicit paths, writes nothing, and owns no project state, configuration, store,
agent loop, or review judgment.

## TypeScript

- Files use `camelCase.ts`; types and classes use `PascalCase`.
- Exported module functions use descriptive `snake_case` declarations.
- Local names use `camelCase`; error types end in `Error`.
- Prefer domain names over `data`, `item`, and abbreviations.
- Use named exports, explicit type imports, `type`, discriminated unions, and `Readonly`.
- Use one object argument for several inputs.
- Order imports built-in, external, parent, sibling; preserve explicit `.ts` extensions.
- Use braces, guard clauses, strict equality, and explicit conversion.
- Reject nested ternaries, default exports, enums, `any`, unjustified assertions, and suppressions.
- Narrow `unknown` at I/O boundaries.

## Verify

Run the narrow test while editing, then `pnpm gate`.
