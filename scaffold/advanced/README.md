# Advanced templates and reference cards

Everything in this directory is optional. The core kit (`templates/` + the
`.agents/skills/` guides) covers the everyday loop — copy pieces from here only
when the work calls for them.

## Templates (this directory)

| Template          | Use it when                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `audit.md`        | you need an evidence-grounded picture of an existing area's risk and debt — the recommended first taste for brownfield codebases |
| `bug.md`          | a defect needs a reproduction and a root cause before anyone writes the fix task                                                 |
| `research.md`     | a decision needs surveyed options and evidence before anyone commits to it                                                       |
| `adr.md`          | a project-wide decision is made and must stay on the record                                                                      |
| `rfc.md`          | you want to propose one approach and have the alternatives weighed before deciding                                               |
| `prd.md`          | new product behavior needs its outcome and audience stated before a spec exists                                                  |
| `threat-model.md` | a security-sensitive surface needs its threats named before the spec hardens it                                                  |

Each template lives beside the spec it supports in `specs/<feature>/`, except
the ADR, which lives in `decisions/`.

## Reference cards (this directory)

`sol-reference.md` (structured requirements) and `checks-reference.md` (common
mistakes to check for) — read in place; nothing to install.

## Optional agent guides (the swarm-skills catalog)

Focused guides for the work these templates support — `write-audit`,
`write-research`, `persona-surveyor`, `write-bug-report`, `write-prd`,
`write-rfc`, `write-change-plan`, `write-inventory`, `spec-check`,
`save-findings`, `split-work`, `adversarial-review` — plus long-form
implementation guides per change shape (feature, fix, refactor, rewrite,
migration, performance, testing, documentation, flaky tests) live in the
[swarm-skills catalog](https://github.com/jcosta33/swarm-skills). Install into
`.agents/skills/` with `npx skills add jcosta33/swarm-skills --list`, or copy
the folders.

Copy what you need; ignore the rest. Full instructions: `docs/ADOPTING.md` in the Swarm repo.
