# Architecture

suspec-cli is a read-only command-line checker. Its architecture keeps input discovery at the
command boundary and check semantics deterministic over parsed values.

## Runtime Flow

```text
bin/suspec.js
  -> src/index.ts
  -> Commands
       -> Terminal (argument parsing)
       -> Core (checks and outcome projection)
            -> Sol (artifact parsing)
       -> filesystem reads for explicit paths
```

`src/index.ts` dispatches commands. `Commands` reads named files, selects a check face from
frontmatter, constructs bounded reference resolvers, calls Core, and renders the result. Core parses
through Sol and evaluates the contract. The process exits with the highest report level.

## Modules

### Commands

`src/modules/Commands` owns the public command surface:

- invocation-shape validation;
- reads of positional paths and explicit review companions;
- check-face dispatch;
- construction of artifact-relative resolvers;
- human-readable rendering and usage text.

It contains orchestration, not check semantics.

### Core

`src/modules/Core` owns:

- the implemented checks contract;
- spec, change-plan, file-set, and review check use cases;
- review coverage and evidence reconciliation;
- bounded source, citation, and sibling-spec resolver builders;
- JSON/stdout/stderr/exit-code projection.

Check functions accept parsed records and injected predicates. They do not discover a repository
root or read hidden configuration.

### Sol

`src/modules/Sol` parses frontmatter and Markdown into structural records used by Core. It does not
decide severity or render output.

### Terminal

`src/modules/Terminal` tokenizes positional arguments and declared flags. Public parser behavior is
covered by its tests and changes to flag rejection are API changes.

### Infra

`src/infra` supplies the shared `Result`/`AppError` algebra, Markdown scanning, and YAML-scalar
normalization. It is a leaf and imports no module code.

## Dependency Rules

Another module imports only from a destination module's `useCases/index.ts`. Code within a module
imports concrete files directly. `models`, `services`, and `testing` are private implementation
directories.

Dependency-cruiser enforces these rules:

```bash
pnpm deps:validate
```

## Filesystem Boundary

Primary paths and review companions come from the command line. Some contract checks require
bounded filesystem lookups:

- source links resolve from a spec's directory;
- citation keys resolve against the `sources.md` named by that spec;
- preservation references resolve through the contract's sibling-spec rule.

Commands build these predicates from explicit artifact paths and inject them into Core. No check
walks upward for a project root, searches for a configuration file, or opens an artifact store.

Canon discovery is test-only. Drift guards locate a Suspec checkout through `SUSPEC_CANON`, the
conventional `../suspec` sibling, or a sibling with the canon's identifying files. Product runtime
does not use this discovery.

## Output Boundary

Core reports carry a level and diagnostics. The Unix outcome helpers map levels to process exit codes
and keep structured data on stdout. Invocation errors are explained on stderr. Human-readable output
is a Commands concern.

The checker never records a review judgment. It reports facts and severity; callers own workflow
policy.
