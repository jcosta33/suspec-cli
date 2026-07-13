# suspec-cli

The reference command-line checker for the [Suspec methodology](https://github.com/jcosta33/suspec).
It implements the contract in
[`checks/checks.yaml`](https://github.com/jcosta33/suspec/blob/main/checks/checks.yaml) and reports
structural diagnostics without making a review judgment.

## Requirements

- Node.js 22.6 or newer
- pnpm 10

## Install From Source

suspec-cli is not published to npm.

```bash
git clone https://github.com/jcosta33/suspec-cli
cd suspec-cli
pnpm install --frozen-lockfile
pnpm build
pnpm link --global
```

`bin/suspec.js` runs the bundled `dist/index.js` after a build. In a source checkout it can also run
`src/index.ts` through Node's native type stripping, so `node bin/suspec.js <command>` works without
building first.

## Usage

```bash
suspec check <path> [<path>...]                                    # specs, tasks, or change plans
suspec check <review-path> --spec <spec-path> [--task <task-path>] # review reconciliation
suspec check --contract                                            # contract JSON
```

### Results

- Exit `0`: clean
- Exit `1`: warning
- Exit `2`: blocking diagnostic or usage error
- `--json`: machine-readable reports on stdout; errors are also explained on stderr

A single report under `--json` is ordinary JSON. An invocation that produces several reports emits
one compact JSON value per line (JSON Lines), in processing order. Consumers must parse each
non-empty line independently rather than parse the entire stream as one JSON document.

Every per-artifact JSON report repeats its recognized `type`. Checked reports carry `diagnostics`;
recognized unchecked reports carry `checked: false`. The optional final `(file set)` C002 report is
not an artifact and has no `type`.

### Inputs

The checker reads each primary path named on the command line. A review always requires its source
spec through `--spec`; `--task` is required when the review frontmatter names a task and rejected when
the review names none.

Inputs may be absolute paths or paths relative to the process's current working directory. Agent
handoffs should use full absolute paths so their meaning does not depend on an implicit working
directory.

The frontmatter `type:` selects the check face:

- `spec`: spec contract checks
- `task`: task shape, evidence, and closure checks
- `change-plan`: preservation-reference and transformation-wave checks
- `review`: reconciliation against the explicit companion files

`inventory`, `audit`, `research`, and `inspection` are recognized and return an honest
`checked: false` report. Missing, empty, misspelled, and unknown types are blocking usage errors.

Frontmatter uses Suspec's strict flat subset: top-level scalar fields, flat inline lists, and flat
block lists. Duplicate keys, nesting, multiline scalars, anchors, aliases, tags, malformed quotes,
and malformed lists are rejected. Values remain strings; no boolean, number, or null coercion occurs.
Every recognized artifact keeps `type` and `id` scalar.

Several specs, tasks, or change plans can share one invocation. Each is checked, the process exit code is the
highest result level, and duplicate frontmatter IDs across the supplied set are diagnosed. Review
packets are checked one at a time because their companion flags apply to that packet.

### Reference Resolution

The CLI does not discover a repository root, workspace, configuration file, or artifact store.
References with filesystem semantics resolve from explicit artifact locations:

Ordinary Suspec artifacts conventionally live under
`~/.agents/artifacts/<workspace>/`, but that root has no special meaning to the CLI; callers pass
the same absolute paths they would pass from any other directory.

- A spec source path resolves from that spec's directory.
- A spec citation resolves against the `sources.md` named by that spec.
- A change-plan preservation reference resolves against specs beside the plan according to the
  contract's sibling-spec rule.

These bounded lookups are part of the check. They are not project-root discovery.

## Examples

```bash
suspec check specs/checkout/spec.md
suspec check plans/payment-change.md --json
suspec check reviews/checkout.md --spec specs/checkout/spec.md --task tasks/checkout.md
```

## Boundary

suspec-cli reports facts and severity levels. It does not author records, run agents, decide whether
work passes review, or block a merge by itself. The caller decides how exit codes participate in its
workflow.

The implementation is drift-guarded against the canon contract when a sibling Suspec checkout is
available. CI provides that checkout so contract divergence fails the repository gate.

## Development

```bash
pnpm install
pnpm gate
```

- [Architecture](docs/05-architecture.md)
- [Testing](docs/06-testing.md)
- [Conventions](docs/07-conventions.md)
- [Agent guidance](AGENTS.md)
