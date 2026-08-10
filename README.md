# suspec-cli

Suspec's deterministic checker and reversible harness setup. The checker has no model and no vibes. It implements
[`checks/checks.yaml`](https://github.com/jcosta33/suspec/blob/main/checks/checks.yaml), reports
structural facts, and renders no review judgment.

## Install

Requires Node.js 22.6 or newer and pnpm 10. The package is not published.

```bash
git clone https://github.com/jcosta33/suspec-cli
cd suspec-cli
corepack enable
pnpm install --frozen-lockfile
pnpm link --global
```

`bin/suspec.js` runs `dist/index.js` after build. In a source checkout it can run `src/index.ts`
through Node native type stripping, so `node bin/suspec.js <command>` works before build.

## Commands

```bash
suspec check <path> [<path>...]
suspec check <task-path> [<task-path>...] --spec <spec-path>
suspec check <review-path> --spec <spec-path> [--task <task-path>]
suspec check --contract
```

A task check always requires its ready source through `--spec`; several tasks may share one source
companion. A review always requires `--spec`. `--task` is required exactly when review frontmatter
names a task. Reviews run alone.

Install the global agent policy only after reviewing the preview:

```bash
suspec setup codex claude-code kimi-code zcode opencode
suspec setup codex claude-code kimi-code zcode opencode --yes
suspec setup codex claude-code kimi-code zcode opencode --check
```

`setup` accepts only explicit harness names. It resolves each harness's normal native global
instruction file. `--dry-run` previews successfully; `--remove` previews removal; `--remove --yes`
restores foreign bytes exactly. One neutral inline block governs interaction economy, durable finding
placement, lean-ctx/RTK routing, and advisory routing through project-native delivery controls. Setup
writes only the resolved native file.

## Inputs

Paths may be absolute or current-working-directory-relative. Use absolute paths for agent handoffs.

Frontmatter `type:` selects behavior. The filename gets no vote:

| Type                             | Result                                      |
| -------------------------------- | ------------------------------------------- |
| `spec`                           | spec checks                                 |
| `task`                           | shape, evidence, and closure checks         |
| `change-plan`                    | preservation and wave checks                |
| `campaign`                       | goal shape, authority, and readiness checks |
| `review`                         | reconciliation against explicit companions  |
| `inventory`, `audit`, `research` | recognized with `checked: false`            |

Missing, empty, misspelled, and unknown types block.

The strict frontmatter subset accepts top-level string scalars, flat inline or block string lists,
optional UTF-8 BOM, and comments outside quotes. It rejects duplicate keys, nesting, maps, multiline
scalars, anchors, aliases, tags, malformed delimiters, quotes, or lists, empty list heads, and
field-shape mismatches. Values are never coerced. `type` and `id` remain scalars.

## References

The caller names the files. The CLI discovers no repository, workspace, configuration, or artifact
store.

- Spec source paths resolve from the spec directory.
- Spec citations resolve against its named `sources.md`.
- Change-plan preservation references use the contract's bounded sibling-spec rule.
- Campaign ledger and source paths resolve from the campaign directory.
- Review evidence receipts resolve only from local relative Markdown links. URI links are ignored;
  absolute receipt paths fail C026.

The conventional `~/.agents/artifacts/<workspace>/` root has no special runtime meaning. To the CLI,
it is just a path.

## Check output

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

The checker reads and reports. It does not author artifacts, run commands or agents, prove evidence,
accept work, or own merge policy. `setup` owns only its marked user-level policy blocks. Nothing else.

## Setup output

`--json` emits one envelope:

```json
{
    "version": "2",
    "operation": "check",
    "ok": true,
    "targets": [
        {
            "harness": "codex",
            "state": "current",
            "paths": ["/Users/you/.codex/AGENTS.md"]
        }
    ]
}
```

States are `current`, `changed`, `missing`, `drifted`, `blocked`, or `unknown`. Setup exits `0` for a
current check, applied change, or dry-run; `1` for a preview, drift, missing target, or uncertainty;
`2` for invalid input, conflict, unsafe path, lock failure, or I/O failure. JSON mode writes one value
to stdout and nothing to stderr.

## Develop

```bash
pnpm install
pnpm gate
```

See [architecture](docs/05-architecture.md), [testing](docs/06-testing.md),
[conventions](docs/07-conventions.md), and [agent guidance](AGENTS.md).
