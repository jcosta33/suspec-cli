---
type: status
---

# Workboard

| Item | Type | State | Link |
|---|---|---|---|
| SPEC-swarm-cli | spec | draft | `specs/001-swarm-cli/spec.md` |
| SPEC-sol-parser | spec | draft | `specs/002-sol-parser/spec.md` |
| SPEC-sol-lint | spec | draft | `specs/004-sol-lint/spec.md` |
| SPEC-command-surface-collapse | spec | draft | `specs/005-command-surface-collapse/spec.md` |
| SPEC-check | spec | draft | `specs/006-check/spec.md` |
| SPEC-worktree | spec | draft | `specs/007-worktree/spec.md` |
| SPEC-trace | spec | draft | `specs/008-trace/spec.md` |
| SPEC-promote | spec | draft | `specs/009-promote/spec.md` |

<!-- Board states: spec draft / ready / in-progress / blocked / done / stale ·
     task ready / running / review-ready / blocked / closed · review
     draft / pass / waived / blocked / needs-human. The sessions maintain the
     board (the finishing agent flips its task's row; the reviewing session
     closes it) - you read it. A "verified" or "done" claim links its review
     packet. -->

## Human attention

- `pnpm lint` exits 1 on a pre-existing fatal: eslint parses
  `.dependency-cruiser.cjs` with `parserOptions.project` that does not include
  it (config untouched by the migration). cmdLint is red until the eslint
  flat-config block for `*.cjs` is fixed — product debt, needs an owner call.

- SPEC-trace (specs/008-trace/spec.md) contracts the framework's former trace
  template, which the framework has since folded into the review packet (the
  standalone trace survives only as a future-CLI reserved record). The spec
  needs an owner amendment before implementation.

- Board seeded at the 2026-06-12 framework migration from spec frontmatter
  (all eight specs carry `status: draft`); reconcile states at the next Close.
- `swarm lint` v1 shipped against the SOL-era contract; SPEC-check now targets
  `specs/*/spec.md` and the checks contract (`checks/checks.yaml` v0.4.0 in
  the swarm repo).
