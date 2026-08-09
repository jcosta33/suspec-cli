# Architecture

suspec-cli has two surfaces: a read-only artifact checker and isolated user-level setup. Commands own
I/O. Core evaluates deterministic checks over parsed values. Setup never enters Core.

```text
bin/suspec.js
  -> src/index.ts
  -> Commands
       -> Terminal
       -> Core
            -> Sol
       -> filesystem
       -> generated agent policy
```

## Ownership

| Area       | Owns                                                                        |
| ---------- | --------------------------------------------------------------------------- |
| `Commands` | invocation validation, explicit I/O, dispatch, bounded resolvers, rendering |
| `Terminal` | positional arguments and declared flags                                     |
| `Core`     | checks, reconciliation, resolver contracts, report and exit projection      |
| `Sol`      | Markdown and frontmatter structural records                                 |
| `infra`    | Result/AppError, strict frontmatter, Markdown scanning                      |

Commands orchestrate; they do not freelance check semantics. Sol parses; it does not choose severity
or render. Infra is a leaf and imports no module code.

## Dependencies

Cross-module imports use the destination `useCases/index.ts`. Imports within a module target concrete
files. `models`, `services`, and `testing` stay private.

```bash
pnpm deps:validate
```

## Artifact filesystem

Primary artifacts and review companions come from arguments. Commands build and inject bounded
predicates for:

- spec-relative sources;
- spec-named citation files;
- contract-defined sibling spec references.

Explicit means explicit. No runtime code discovers a project root, configuration, or store. Canon
discovery is test-only through `SUSPEC_CANON`, conventional sibling location, or identifying sibling
files.

## Setup filesystem

`setup` accepts explicit harness identifiers. It resolves documented user-level roots, refuses
ambiguous configuration, and owns one canonical agent policy plus marked harness blocks. Install and
removal require `--yes`; preview, dry-run, and check do not write. Writes use a Suspec lock,
same-directory temporary file, fsync, stable-byte checks, and atomic rename. Drift blocks mutation.

This is installation plumbing, not checker state. It never touches repositories, artifacts, MCP, or
harness-native plans and memory.

## Output

Core returns levels and diagnostics. Commands render human output. Unix outcome helpers own check
streams and exits. Setup owns its separate versioned envelope and exit contract.

The checker records no review judgment. Good. That decision belongs elsewhere.
