# Architecture

suspec-cli is a read-only checker. Commands own explicit I/O; Core evaluates deterministic rules over
parsed values.

```text
bin/suspec.js
  -> src/index.ts
  -> Commands
       -> Terminal
       -> Core
            -> Sol
       -> filesystem
```

## Ownership

| Area       | Owns                                                                          |
| ---------- | ----------------------------------------------------------------------------- |
| `Commands` | invocation validation, explicit reads, dispatch, bounded resolvers, rendering |
| `Terminal` | positional arguments and declared flags                                       |
| `Core`     | checks, reconciliation, resolver contracts, report and exit projection        |
| `Sol`      | Markdown and frontmatter structural records                                   |
| `infra`    | Result/AppError, strict frontmatter, Markdown scanning                        |

Commands orchestrate; they do not define check semantics. Sol parses; it does not choose severity or
render. Infra is a leaf and imports no module code.

## Dependencies

Cross-module imports use the destination `useCases/index.ts`. Imports within a module target concrete
files. `models`, `services`, and `testing` stay private.

```bash
pnpm deps:validate
```

## Filesystem

Primary artifacts and review companions come from arguments. Commands build and inject bounded
predicates for:

- spec-relative sources;
- spec-named citation files;
- contract-defined sibling spec references.

No runtime code discovers a project root, configuration, or store. Canon discovery is test-only
through `SUSPEC_CANON`, conventional sibling location, or identifying sibling files.

## Output

Core returns levels and diagnostics. Commands render human output. Unix outcome helpers own stdout,
stderr, and exit mapping. Invocation errors go to stderr; structured reports stay on stdout.

The checker records no review judgment.
