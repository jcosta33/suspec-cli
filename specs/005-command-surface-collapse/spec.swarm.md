---
type: spec
id: command-surface-collapse
swarm_language: SOL/0.1
aps_version: 0.1
spec_version: 0.1.0
status: draft
title: Collapse the command garden to the canonical 14-command surface
owners: []
imports: [swarm-cli]
domain: architecture
created: 2026-06-08
updated: 2026-06-08
---

# Spec: collapse the command garden to the canonical surface

## Intent

Reduce swarm-cli's shipped command surface from the **59** use-cases in `src/modules/Commands/useCases/`
down to the **canonical 14** that `swarm-cli` `IF-001` defines and `C-001` mandates, **without losing any
behavior a canonical command needs**. This realizes the redesign spec 001 already calls for ("collapse the
command garden to the fixed pipeline") and is grounded by the command-surface audit
([`../001-swarm-cli/command-surface-audit.md`](../001-swarm-cli/command-surface-audit.md)). It is a
**migration**: remove non-canonical commands, fold the few whose behavior belongs inside a canonical command,
and enforce the surface with a contract — keeping the repo green at every step.

## Non-goals

- It does **not** redefine the command surface — `swarm-cli` `IF-001` owns the canonical 14; this spec
  realizes it.
- It does **not** build the 7 unbuilt canonical commands (`lint`, `check`, `lower`, `worktree`, `trace`,
  `promote`, `drift`) — each is its own feature spec (see Q-002). This spec only removes/folds the garden and
  pins the surface.
- It does **not** decide the fate of the agent-orchestration vision (see Q-001).

## Context

Today: 59 command use-cases, 60 test files; only 7 of the canonical 14 exist (`init, format, decompose, task,
review, merge, status`). The 52 non-canonical commands are the garden `C-001` forbids, including dead/broken
ones (`screenshot`/`visual` import an uninstalled `playwright`; `chaos`/`mock` stubs). The dispatcher is a
self-registering `Capability` map (`src/modules/Commands/services/registry.ts`). Removals must respect the
dependency-cruiser boundaries.

## Obligations

REQ AC-001:
WHEN the cli registers its commands
THE cli MUST expose exactly the canonical surface (`swarm-cli` `IF-001`'s 14) with no non-namespaced command outside it
VERIFY BY contract:cmdTest:src/modules/Commands/__tests__/commandSurface.spec.ts#exactly_the_canonical_surface
DEPENDS ON swarm-cli#C-001
WRITES src/modules/Commands/**
RISK high

REQ AC-002:
WHEN a non-canonical command is not folded into a canonical one
THE cli MUST decommission it — its use-case file and registration removed, not merely hidden
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/commandSurface.spec.ts#no_noncanonical_registered
DEPENDS ON AC-001
WRITES src/modules/Commands/**
RISK high

REQ AC-003:
WHEN a command imports a package absent from `package.json`
THE cli MUST remove that command
BECAUSE a command importing an uninstalled dependency is dead at runtime (e.g. `screenshot`/`visual` import `playwright`, which is not a dependency)
VERIFY BY static:cmdValidate:no-uninstalled-dependency-import
WRITES src/modules/Commands/**
RISK medium

REQ AC-004:
THE cli MUST keep the task-navigation behaviors (currently `new`/`list`/`show`/`open`/`pick`/`focus`) reachable through the canonical `task` command
BECAUSE folding preserves the behavior without a non-canonical top-level command
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/task.spec.ts#nav_behaviors_reachable_via_task
DEPENDS ON AC-001
RISK medium

## Constraints

CONSTRAINT C-001:
THE collapse MUST NOT drop a behavior that a canonical command requires
BECAUSE the goal is a smaller surface, not lost capability; a folded behavior is preserved, not deleted
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/commandSurface.spec.ts#canonical_behaviors_preserved

CONSTRAINT C-002:
THE collapse MUST NOT leave a dangling reference to a removed command
BECAUSE a removed use-case still imported elsewhere breaks the build; removals must be complete
VERIFY BY static:cmdValidate:no-dangling-import-after-removal

## Invariants

INVARIANT I-001:
after each removal batch THE repository MUST stay green — `pnpm typecheck`, `pnpm deps:validate`, and `pnpm test:run` all pass
VERIFY BY property:cmdTest:src/modules/Commands/__tests__/commandSurface.spec.ts#repo_green_through_migration

## Questions

QUESTION Q-001 [blocking]:
The agent-runtime cluster (`daemon`, `launch-agent`, `chat`, `message`, `lock`) and git-flow (`pr`, `release`, `remove`) — cut, fold, or keep as a re-scoped capability? This depends on whether the multi-agent-orchestration vision (whose specs were dropped) is still alive.
AFFECTS AC-002

QUESTION Q-002 [non-blocking]:
Are the 7 missing canonical commands (`lint`/`check`/`lower`/`worktree`/`trace`/`promote`/`drift`) built as part of this collapse, or as separate feature specs once the garden is cleared? (This spec assumes separate specs.)
AFFECTS AC-001

## Verification coverage

Proof **contracts** — the bound tests do not exist yet (every obligation `UNVERIFIED` until `implement`).
Adapters resolve through `AGENTS.md > Commands` (`cmdTest` = `pnpm test:run`, `cmdValidate` = `pnpm deps:validate`).

| ID     | VERIFY BY                                                                                            |
| ------ | ---------------------------------------------------------------------------------------------------- |
| AC-001 | contract:cmdTest:src/modules/Commands/__tests__/commandSurface.spec.ts#exactly_the_canonical_surface |
| AC-002 | test:cmdTest:src/modules/Commands/__tests__/commandSurface.spec.ts#no_noncanonical_registered        |
| AC-003 | static:cmdValidate:no-uninstalled-dependency-import                                                   |
| AC-004 | test:cmdTest:src/modules/Commands/__tests__/task.spec.ts#nav_behaviors_reachable_via_task            |
| C-001  | test:cmdTest:src/modules/Commands/__tests__/commandSurface.spec.ts#canonical_behaviors_preserved     |
| C-002  | static:cmdValidate:no-dangling-import-after-removal                                                  |
| I-001  | property:cmdTest:src/modules/Commands/__tests__/commandSurface.spec.ts#repo_green_through_migration   |

## Downstream tasks

| Task | Covers |
| ---- | ------ |
| _(assigned by the `decompose` pass; resolve Q-001 first — it gates AC-002's scope)_ | |

## Distillation loss statement

### Preserved

- The end state: exactly the canonical 14, no garden, no capability loss for the 14, repo green throughout.
- The two concrete cut signals from the audit: non-canonical (AC-002) and uninstalled-dependency-importing
  (AC-003) commands; and the one concrete fold (task-nav → `task`, AC-004).

### Dropped

- The per-command kill list — the audit categorizes (cut/fold/keep), but the exact disposition of each of the
  52 is settled at `decompose`/`implement` after Q-001, not enumerated here as obligations.

### Still uncertain

- Q-001 (agent-runtime / git-flow cluster) — **blocking**: it changes how many commands AC-002 removes.
- Q-002 (whether the 7 missing canonical commands are in scope) — this spec assumes not.
