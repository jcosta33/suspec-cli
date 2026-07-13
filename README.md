# suspec-cli

The reference deterministic checker for [Suspec](https://github.com/jcosta33/suspec). It implements
[`checks/checks.yaml`](https://github.com/jcosta33/suspec/blob/main/checks/checks.yaml), reports
structural facts, and renders no review judgment.

## Install

Requires Node.js 22.6 or newer and pnpm 10. The package is not published.

```bash
git clone https://github.com/jcosta33/suspec-cli
cd suspec-cli
pnpm install --frozen-lockfile
pnpm build
pnpm link --global
```

`bin/suspec.js` runs `dist/index.js` after build. In a source checkout it can run `src/index.ts`
through Node native type stripping, so `node bin/suspec.js <command>` works before build.

## Commands

```bash
suspec check <path> [<path>...]
suspec check <review-path> --spec <spec-path> [--task <task-path>]
suspec check --contract
```

A review always requires `--spec`. `--task` is required exactly when review frontmatter names a
task. Several specs, tasks, or change plans may share one invocation; reviews run alone because
companion flags belong to one target.

## Inputs

Paths may be absolute or current-working-directory-relative. Use absolute paths for agent handoffs.

Frontmatter `type:` selects behavior:

| Type                             | Result                                     |
| -------------------------------- | ------------------------------------------ |
| `spec`                           | spec checks                                |
| `task`                           | shape, evidence, and closure checks        |
| `change-plan`                    | preservation and wave checks               |
| `review`                         | reconciliation against explicit companions |
| `inventory`, `audit`, `research` | recognized with `checked: false`           |

Missing, empty, misspelled, and unknown types block.

The strict frontmatter subset accepts top-level string scalars, flat inline or block string lists,
optional UTF-8 BOM, and comments outside quotes. It rejects duplicate keys, nesting, maps, multiline
scalars, anchors, aliases, tags, malformed delimiters, quotes, or lists, empty list heads, and
field-shape mismatches. Values are never coerced. `type` and `id` remain scalars.

## References

The CLI discovers no repository, workspace, configuration, or artifact store.

- Spec source paths resolve from the spec directory.
- Spec citations resolve against its named `sources.md`.
- Change-plan preservation references use the contract's bounded sibling-spec rule.

The conventional `~/.agents/artifacts/<workspace>/` root has no special runtime meaning.

## Output

| Exit | Meaning                            |
| ---- | ---------------------------------- |
| `0`  | clean                              |
| `1`  | warning                            |
| `2`  | blocking diagnostic or usage error |

`--json` writes structured reports to stdout and explains usage failures on stderr. One report is
ordinary JSON. Several reports are one compact JSON value per line, in processing order.

Every artifact report repeats its recognized `type`. Checked reports carry `diagnostics`; unchecked
reports carry `checked: false`. The optional final `(file set)` C002 report has no artifact type.

```bash
suspec check specs/checkout/spec.md
suspec check plans/payment-change.md --json
suspec check reviews/checkout.md --spec specs/checkout/spec.md --task tasks/checkout.md
```

The CLI reads and reports. It does not author artifacts, run commands or agents, prove evidence,
accept work, or own merge policy.

## Develop

```bash
pnpm install
pnpm gate
```

See [architecture](docs/05-architecture.md), [testing](docs/06-testing.md),
[conventions](docs/07-conventions.md), and [agent guidance](AGENTS.md).
