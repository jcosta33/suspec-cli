---
type: spec
id: worktree
swarm_language: SOL/0.1
aps_version: 0.1
spec_version: 0.1.0
status: draft
title: swarm worktree — operator face of the isolated worktree/sandbox model (src/modules/Commands)
owners: []
imports: [swarm-cli]
domain: architecture
created: 2026-06-08
updated: 2026-06-08
---

# Spec: swarm worktree — manage the isolated worktrees decompose/implement run in

## Intent

`swarm worktree` is the canonical command that **exposes the `Workspace` module's existing git-worktree
operations** to the operator. It is the human face of the Swarm **isolation model**: a code task does not run
on `main`, it runs in a **worktree + branch off the base** (the discipline `decompose`/`implement` rely on,
researched in [`../003-swarm-core-worktree/research.md`](../003-swarm-core-worktree/research.md)). The
sandboxes that pass machinery allocates implicitly need a deliberate operator surface to inspect, create,
tear down, and garbage-collect — this command is that surface. v1 ships four subcommands —
`list` / `create <slug>` / `remove <slug>` / `prune` — each a thin shell over a use-case already living in
`src/modules/Workspace/useCases` (`worktree_list`, `worktree_create`, `worktree_remove`, `worktree_prune`,
with `is_worktree_dirty`/`branch_exists` as guards). It adds **operator safety** (idempotent-ish create,
confirm/force on remove) on top of those primitives; it invents no new git semantics. It is the future
**fold home** for the legacy task-navigation commands (`new`/`open`/`list`/`show`/`pick`/`focus`), but that
fold is a later increment (Q-002), not v1.

## Non-goals

- Not the lease manager, ledger, mailbox, or inter-agent coordination — that is swarm-core's domain
  ([`../003-swarm-core-worktree/research.md`](../003-swarm-core-worktree/research.md)); this command only
  drives the local git worktree primitives.
- Not new git semantics — it exposes `Workspace`'s existing ops; it does not reimplement `git worktree`.
- Not the task-navigation fold — re-homing `new`/`open`/`list`/`show`/`pick`/`focus` under this command is a
  separate increment (Q-002), out of scope for v1.
- Not merge, sync, or branch cleanup beyond worktree teardown — `merge` and `worktree_sync` are separate
  concerns; v1 `remove` removes the worktree, it is not the merge gate.

## Context

A **command** in `src/modules/Commands`, on the same `Capability`-registry dispatch path as the rest of the
canonical surface (`swarm-cli` `IF-001`'s 14). It is one of the 7 unbuilt canonical commands spec 005 defers
to a feature spec (`005-command-surface-collapse` Q-002), and the concrete home spec 005 Q-001 names when it
folds `lock`/`remove` behavior into "the future canonical `worktree` command." The behavior it exposes already
exists and is tested at the module layer (`src/modules/Workspace/__tests__/workspace.spec.ts`); this spec
contracts the **command** that surfaces those ops with operator safety. The slug→branch/worktree-path
derivation is the established pattern from `new` (`to_slug` + `derive_names`), reused, not redefined here.
Errors flow through the repo's `Result` + `AppError` (`src/infra/errors`); the `Workspace` ops already return
`Result` for create/remove/prune. The dependency boundary is enforced by dependency-cruiser `core-isolation`:
`Workspace` MUST NOT depend on `Commands`/`Terminal`, so this command depends inward on `Workspace`, never the
reverse.

## Interfaces

INTERFACE IF-001:
`run_worktree` RETURNS `Result<WorktreeOutcome, AppError>`
ACCEPTS:
  - `subcommand: 'list' | 'create' | 'remove' | 'prune'`
  - `slug: string` (required for `create`/`remove`)
  - `force: boolean` (for `remove`)
ERRORS:
  - AppError(NotInsideRepo)
  - AppError(UnknownSubcommand)
OWNED BY Commands
VERIFY BY contract:cmdTest:src/modules/Commands/__tests__/worktree.spec.ts#dispatches_four_subcommands

## Obligations

REQ AC-001:
WHEN the operator runs `swarm worktree list`
THE command MUST report every worktree the repository knows, drawn from `Workspace`'s `worktree_list`, each row carrying its path, branch, and dirty/clean status
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/worktree.spec.ts#list_reports_all_worktrees
DEPENDS ON IF-001
READS src/modules/Workspace/**
RISK medium

REQ AC-002:
WHEN the operator runs `swarm worktree create <slug>`
THE command MUST create a worktree on a branch derived from `<slug>` off the configured base branch by calling `Workspace`'s `worktree_create`
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/worktree.spec.ts#create_makes_worktree_off_base
DEPENDS ON IF-001
WRITES src/modules/Commands/**
RISK high

REQ AC-003:
WHEN `swarm worktree create <slug>` is run for a `<slug>` whose worktree already exists
THE command MUST resolve to the existing worktree without erroring and without recreating it
BECAUSE create is idempotent-ish: re-running it for an existing sandbox is the operator's "ensure it exists," not a fault
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/worktree.spec.ts#create_is_idempotent_for_existing
DEPENDS ON AC-002
RISK medium

REQ AC-004:
WHEN the operator runs `swarm worktree remove <slug>` and that worktree is dirty (`Workspace`'s `is_worktree_dirty` is true)
THE command MUST refuse the removal and surface the uncommitted-changes condition, removing only after the operator confirms or passes `--force`
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/worktree.spec.ts#remove_refuses_dirty_without_force
DEPENDS ON IF-001
WRITES src/modules/Commands/**
RISK high

REQ AC-005:
WHEN the operator runs `swarm worktree remove <slug>` with confirmation (or `--force`) on a removable worktree
THE command MUST remove it by calling `Workspace`'s `worktree_remove`, passing the force flag through
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/worktree.spec.ts#remove_calls_workspace_with_force
DEPENDS ON AC-004
WRITES src/modules/Commands/**
RISK medium

REQ AC-006:
WHEN the operator runs `swarm worktree prune`
THE command MUST garbage-collect worktree administrative entries whose working directory is gone by calling `Workspace`'s `worktree_prune`
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/worktree.spec.ts#prune_calls_workspace_prune
DEPENDS ON IF-001
RISK low

REQ AC-007:
IF any subcommand is invoked outside a git repository
THE command MUST fail with the not-inside-a-repo condition rather than throwing an uncaught error
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/worktree.spec.ts#outside_repo_is_handled_error
DEPENDS ON IF-001
RISK medium

## Constraints

CONSTRAINT C-001:
THE command MUST NOT remove a dirty worktree unless the operator confirmed or passed `--force`
BECAUSE clobbering uncommitted work is unrecoverable; the safety gate is the whole point of an operator surface over the raw git op
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/worktree.spec.ts#dirty_worktree_not_clobbered

CONSTRAINT C-002:
THE `Workspace` module MUST NOT depend on `Commands` or `Terminal` to serve this command
BECAUSE the worktree ops are core and the command is the shell; the dependency points inward (`core-isolation`), and inverting it would let the operator surface leak into the core
VERIFY BY static:cmdValidate:core-isolation

CONSTRAINT C-003:
THE command MUST NOT reimplement git worktree behavior inline
BECAUSE the ops already live in `Workspace`'s use-cases; a second implementation forks the worktree semantics the pass machinery also depends on
VERIFY BY static:cmdValidate:command-delegates-to-workspace

## Invariants

INVARIANT I-001:
the worktree set reported by `list` MUST equal the set git itself reports (the command derives, it does not maintain its own registry)
VERIFY BY property:cmdTest:src/modules/Commands/__tests__/worktree.spec.ts#list_matches_git_truth

INVARIANT I-002:
a worktree present and clean before a `prune` MUST still be present after it (prune removes only stale administrative entries, never a live worktree)
VERIFY BY property:cmdTest:src/modules/Commands/__tests__/worktree.spec.ts#prune_preserves_live_worktrees

## Questions

QUESTION Q-001 [non-blocking]:
On `remove`, does the command also delete the slug's branch (via `Workspace`'s `delete_branch`, and only when `is_branch_merged_into` the base), or strictly the worktree directory — leaving branch cleanup to a separate step? (v1 removes the worktree only; branch fate is unsettled.)
AFFECTS AC-005

QUESTION Q-002 [non-blocking]:
This command is the intended fold home for the legacy task-navigation commands (`new`/`open`/`list`/`show`/`pick`/`focus`, per `005-command-surface-collapse` Q-001) — does the fold collapse them into `worktree` subcommands, or do task-nav and worktree stay sibling surfaces over the same `Workspace` ops? (The fold is a separate increment, deferred from v1.)
AFFECTS IF-001

QUESTION Q-003 [non-blocking]:
Is `create`'s base branch always the configured `defaultBaseBranch` (as `new` uses), or should `swarm worktree create <slug>` accept an explicit `--base` for stacking a sandbox off another worktree's branch?
AFFECTS AC-002

## Verification coverage

Proof **contracts** — the bound tests do not exist yet (every obligation `UNVERIFIED` until `implement`). The
underlying `Workspace` ops are already implemented and tested at the module layer
(`src/modules/Workspace/__tests__/workspace.spec.ts`); this spec binds the **command** wrapper, whose tests
land at `src/modules/Commands/__tests__/worktree.spec.ts`. Adapters resolve through `AGENTS.md > Commands`
(`cmdTest` = `pnpm test:run`, `cmdValidate` = `pnpm deps:validate`).

| ID     | VERIFY BY                                                                                       |
| ------ | ----------------------------------------------------------------------------------------------- |
| IF-001 | contract:cmdTest:src/modules/Commands/__tests__/worktree.spec.ts#dispatches_four_subcommands     |
| AC-001 | test:cmdTest:src/modules/Commands/__tests__/worktree.spec.ts#list_reports_all_worktrees           |
| AC-002 | test:cmdTest:src/modules/Commands/__tests__/worktree.spec.ts#create_makes_worktree_off_base       |
| AC-003 | test:cmdTest:src/modules/Commands/__tests__/worktree.spec.ts#create_is_idempotent_for_existing    |
| AC-004 | test:cmdTest:src/modules/Commands/__tests__/worktree.spec.ts#remove_refuses_dirty_without_force   |
| AC-005 | test:cmdTest:src/modules/Commands/__tests__/worktree.spec.ts#remove_calls_workspace_with_force    |
| AC-006 | test:cmdTest:src/modules/Commands/__tests__/worktree.spec.ts#prune_calls_workspace_prune          |
| AC-007 | test:cmdTest:src/modules/Commands/__tests__/worktree.spec.ts#outside_repo_is_handled_error        |
| C-001  | test:cmdTest:src/modules/Commands/__tests__/worktree.spec.ts#dirty_worktree_not_clobbered         |
| C-002  | static:cmdValidate:core-isolation                                                                 |
| C-003  | static:cmdValidate:command-delegates-to-workspace                                                 |
| I-001  | property:cmdTest:src/modules/Commands/__tests__/worktree.spec.ts#list_matches_git_truth           |
| I-002  | property:cmdTest:src/modules/Commands/__tests__/worktree.spec.ts#prune_preserves_live_worktrees   |

## Downstream tasks

| Task | Covers |
| ---- | ------ |
| increment 1 — list/create/prune (read + additive ops) | IF-001, AC-001, AC-002, AC-003, AC-006, AC-007, C-002, C-003, I-001, I-002 |
| increment 2 — remove with safety gate | AC-004, AC-005, C-001 |
| increment 3 (deferred, Q-002) — task-nav fold (`new`/`open`/`list`/`show`/`pick`/`focus`) | _(separate spec)_ |

## Distillation loss statement

### Preserved

- The v1 contract: four subcommands (`list`/`create`/`remove`/`prune`) as a thin, safe shell over
  `Workspace`'s existing worktree ops; idempotent-ish create; dirty-worktree protection on remove; the
  inward-only dependency (`core-isolation`); no reimplemented git semantics; no own registry.
- The command's role as the operator face of the Swarm isolation model (worktree + branch off the base) that
  `decompose`/`implement` run inside.

### Dropped

- The exact CLI flag surface, prompt copy, and table-rendering format — presentation detail settled at
  `implement`, not contracted here.
- The slug→branch/path derivation rule itself — owned by the established `to_slug`/`derive_names` helpers
  (the `new` command's pattern), reused, not restated as an obligation.

### Still uncertain

- Branch fate on `remove` (Q-001) — worktree-only vs. worktree + merged-branch cleanup.
- Whether this command absorbs the task-navigation commands or stays a sibling surface (Q-002).
- Whether `create` accepts an explicit `--base` for stacked sandboxes (Q-003).
