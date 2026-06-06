---
type: spec
id: swarm-cli
swarm_language: SOL/0.1
aps_version: 0.1
spec_version: 0.1.0
status: draft
title: swarm-cli — the operator for the fixed Swarm pipeline
owners: []
imports: []
domain: architecture
created: 2026-06-06
updated: 2026-06-06
---

# Spec: swarm-cli — the operator for the fixed Swarm pipeline

## Intent

`swarm-cli` is the interactive and scriptable **operator** for a Swarm-adopted repository: it consumes the
installed kernel and project overlays, exposes the fixed Swarm pipeline as a small command surface, and
delegates implementation work to external agent adapters and verifier toolchains. This spec fixes the
**spine** — kernel/workspace consumption and the canonical command surface. The semantics each command
invokes (SOL parsing/IR, the verifier runner, the worktree-lease manager, the lower→…→promote pipeline,
the ledger) are owned by `swarm-core` and specified in sibling specs (`swarm-core-parser`,
`swarm-core-verify`, `swarm-core-worktree`, `swarm-core-pipeline`) and the operator specs
(`swarm-cli-adapters`, `swarm-cli-tui`, `swarm-cli-ledger`, `swarm-cli-versioning`).

## Non-goals

- This spec does not define SOL grammar, the verdict model, or the workspace contract — those are the
  kernel's, consumed here, not redefined.
- It does not specify the internals of any single command's pass (lower/verify/decompose/…); those are
  the `swarm-core-*` specs.
- It does not own agent-provider authentication or the chat loop, nor a browser UI.

## Context

The repository is a TypeScript prototype (`~59` file-dispatched commands over a `.agents/` sandbox model)
being redesigned into a kernel-native toolchain laid out as a pnpm monorepo
`packages/{core,cli,tui,adapter-sdk,verifier-exec,testkit}` — `core` (`swarm-core`) owns semantics; `cli`
and `tui` are the operator shell. The redesign collapses the command garden to the fixed pipeline. Design
inputs: the swarm-cli redesign research report and the subsystem analysis recorded under
`.swarm/sources/research/` (to be added). The kernel workspace contract is `.swarm/kernel/model/` /
`.swarm/kernel/language/`.

## Interfaces

INTERFACE IF-001:
`swarm <command> [args]` RETURNS `CommandResult | UsageError`
ACCEPTS:
  - `command: init | lint | format | check | lower | decompose | task | worktree | trace | review | merge | promote | status | drift`
  - `args: string[]`
ERRORS:
  - unknown-command
  - kernel-version-skew
OWNED BY swarm-cli
VERIFY BY contract:cmdTest:packages/cli/test/contract/command-surface.contract.spec.ts#canonical_surface

## Obligations

REQ AC-001:
WHEN the cli starts a command
THE cli MUST load the active kernel and then the project overlays — via swarm-core — before executing the command
VERIFY BY test:cmdTest:packages/cli/test/startup/load-order.spec.ts#kernel_then_overlays_before_command
DEPENDS ON IF-001
READS .swarm/kernel/**, .swarm/overlays/**
RISK high

REQ AC-002:
WHEN the active kernel, core, and cli versions are mutually incompatible
THE cli MUST refuse to run the command
AND THE cli MUST report the version skew
VERIFY BY test:cmdTest:packages/cli/test/version/skew-guard.spec.ts#refuses_and_reports_on_skew
DEPENDS ON AC-001
RISK high

REQ AC-003:
THE cli MUST register the fourteen canonical commands declared by IF-001
VERIFY BY contract:cmdTest:packages/cli/test/contract/command-surface.contract.spec.ts#exactly_fourteen
DEPENDS ON IF-001
RISK medium

REQ AC-004:
WHEN `swarm init` runs in a repository that has no `.swarm/` workspace
THE cli MUST create the canonical `.swarm/` workspace partition
AND THE cli MUST install a kernel version and record its compatibility metadata
VERIFY BY test:cmdTest:packages/cli/test/init/workspace-layout.spec.ts#creates_canonical_partition
WRITES .swarm/**
RISK high

REQ AC-005:
THE cli MUST route every interactive (TUI) action through the same command dispatch as its non-interactive invocation, so each action has an equivalent scriptable form
BECAUSE parity is only checkable against a single dispatch path — a TUI-only code path would make "every action has a CLI form" unverifiable
VERIFY BY test:cmdTest:packages/cli/test/parity/single-dispatch-path.spec.ts#tui_actions_dispatch_through_command_layer
RISK medium

REQ AC-006:
WHEN the cli is invoked with no command in an interactive terminal
THE cli SHOULD launch the visual TUI over the pipeline state
BECAUSE the prototype showed operators want a no-args at-a-glance board, while headless and CI contexts must stay strictly non-interactive
VERIFY BY test:cmdTest:packages/cli/test/tui/launch.spec.ts#no_args_launches_tui_when_interactive
DEPENDS ON AC-005
RISK low

REQ AC-007:
THE cli MUST treat external agent CLIs as interchangeable worker backends bound through the adapter contract
VERIFY BY test:cmdTest:packages/cli/test/adapters/neutrality.spec.ts#no_hardcoded_provider
RISK medium

## Constraints

CONSTRAINT C-001:
THE cli MUST NOT expose a non-namespaced top-level command outside the canonical surface of IF-001
BECAUSE the redesign's value is a small kernel-aligned surface; a plugin MAY add commands, but only namespaced (`swarm <plugin>:<cmd>`), never on the canonical top-level face
VERIFY BY static:cmdTest:packages/cli/test/contract/command-surface.contract.spec.ts#no_extra_toplevel_commands

CONSTRAINT C-002:
THE cli MUST NOT redefine SOL, verdict, or workspace semantics
BECAUSE the kernel is the single source of those semantics; a second definition forks the language
VERIFY BY static:cmdTest:packages/core/test/conformance/no-semantic-fork.spec.ts#enums_match_kernel

CONSTRAINT C-003:
THE cli MUST NOT import or bundle a provider's authentication or chat-loop SDK
BECAUSE provider neutrality requires the worker backend to stay external and swappable; the cli only packages launch contracts and context payloads, so a provider SDK has no place in its dependency graph (an import-graph check can falsify this; "owning the chat loop" is just the import made concrete)
VERIFY BY static:cmdValidate:no-provider-sdk-import

CONSTRAINT C-004:
THE repository MUST NOT vendor a third-party analyzer source tree when a package dependency or adapter suffices
BECAUSE the prototype vendored a dependency-cruiser tarball and source tree — dead weight and a supply-chain liability; a vendored tree is a repo-structure fact, not a dependency edge, so it needs a tree scan, not the dependency linter
VERIFY BY static:cmdTest:packages/core/test/repo/no-vendored-analyzer.spec.ts#no_analyzer_source_in_tree

CONSTRAINT C-005:
THE cli MUST NOT overwrite or delete an existing `.swarm/` workspace during `init`
BECAUSE `init` is create-only; upgrading the kernel is a separate explicit operation, and clobbering project-owned sources/status/memory would be unrecoverable
VERIFY BY test:cmdTest:packages/cli/test/init/idempotent.spec.ts#init_does_not_clobber_existing

## Invariants

INVARIANT I-001:
the `.swarm/` workspace MUST preserve its canonical partition (`kernel/`, `overlays/`, `sources/`, `status/`, `generated/`, `memory/`, `ledger/`, `archive/`, `tmp/`) across every workspace operation
VERIFY BY property:cmdTest:packages/core/test/workspace/partition.property.spec.ts#partition_holds_under_operations

INVARIANT I-002:
every cli and swarm-core operation MUST leave `.swarm/kernel/` byte-unchanged
BECAUSE the kernel is replaceable framework payload, overwritten wholesale on upgrade
VERIFY BY property:cmdTest:packages/core/test/workspace/kernel-readonly.property.spec.ts#operations_leave_kernel_unchanged

## Questions

QUESTION Q-001 [non-blocking]:
Should the visual surface stay TUI-only in v1, or ship a browser-based inspector as a first-class companion?
AFFECTS AC-006

## Verification coverage

These are proof **contracts**: the artifacts do not exist yet, so every obligation here is `UNVERIFIED`
until `implement` builds the bound proof. Each binding resolves through `AGENTS.md > Commands`
(`cmdTest` = `pnpm test:run`, `cmdValidate` = `pnpm deps:validate` = the dependency-cruiser import-graph
check — so a binding's *adapter* is chosen for what can actually falsify the obligation: depcruise for
import-graph facts, a test for filesystem/behaviour facts).

| ID     | VERIFY BY                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------------- |
| IF-001 | contract:cmdTest:packages/cli/test/contract/command-surface.contract.spec.ts#canonical_surface        |
| AC-001 | test:cmdTest:packages/cli/test/startup/load-order.spec.ts#kernel_then_overlays_before_command         |
| AC-002 | test:cmdTest:packages/cli/test/version/skew-guard.spec.ts#refuses_and_reports_on_skew                 |
| AC-003 | contract:cmdTest:packages/cli/test/contract/command-surface.contract.spec.ts#exactly_fourteen          |
| AC-004 | test:cmdTest:packages/cli/test/init/workspace-layout.spec.ts#creates_canonical_partition               |
| AC-005 | test:cmdTest:packages/cli/test/parity/single-dispatch-path.spec.ts#tui_actions_dispatch_through_command_layer |
| AC-006 | test:cmdTest:packages/cli/test/tui/launch.spec.ts#no_args_launches_tui_when_interactive                |
| AC-007 | test:cmdTest:packages/cli/test/adapters/neutrality.spec.ts#no_hardcoded_provider                       |
| C-001  | static:cmdTest:packages/cli/test/contract/command-surface.contract.spec.ts#no_extra_toplevel_commands  |
| C-002  | static:cmdTest:packages/core/test/conformance/no-semantic-fork.spec.ts#enums_match_kernel               |
| C-003  | static:cmdValidate:no-provider-sdk-import                                                               |
| C-004  | static:cmdTest:packages/core/test/repo/no-vendored-analyzer.spec.ts#no_analyzer_source_in_tree          |
| C-005  | test:cmdTest:packages/cli/test/init/idempotent.spec.ts#init_does_not_clobber_existing                  |
| I-001  | property:cmdTest:packages/core/test/workspace/partition.property.spec.ts#partition_holds_under_operations |
| I-002  | property:cmdTest:packages/core/test/workspace/kernel-readonly.property.spec.ts#operations_leave_kernel_unchanged |

## Downstream tasks

| Task | Covers |
| ---- | ------ |
| _(assigned by the `decompose` pass)_ | |

## Distillation loss statement

### Preserved

- The kernel-aligned command surface (14 commands), kernel/overlay consumption, the `.swarm/` partition,
  non-interactive parity, and provider-neutrality — the load-bearing decisions of the redesign research.
- The four hard restrictions (no extra commands, no semantic fork, no provider-runtime ownership, no
  vendored analyzers) that keep the product disciplined.

### Dropped

- The research draft's per-command `INTERFACE`/`REQ` detail for every subcommand (lower/decompose/task/
  worktree/trace/review/merge/promote/drift) — carried into the `swarm-core-*` sibling specs, not here,
  to keep this spine spec readable and each command's semantics with its owning pass.
- The draft's non-conformant ids (`CLI-GOAL-001`, `KERNEL-001`, …) and `<type>:swarm-core:<artifact>`
  bindings — rewritten to the kernel's `PREFIX-NNN` ids and real `cmd*` adapter bindings (a dogfooding
  correction: the kernel's `SOL-S005`/`SOL-V002` rules reject the draft's forms).
- The **mechanics** of kernel/overlay resolution — moved to a `swarm-core` spec; AC-001 here is only the
  cli's obligation to *load via swarm-core* before executing (a skeptic-review fix: resolution is core's
  job, not the cli's).
- The ledger-format and branch-name-encoding questions — moved to `swarm-cli-ledger` and
  `swarm-core-worktree`, where their `AFFECTS` targets actually live (a skeptic-review fix: their links
  here were incoherent).

### Still uncertain

- Whether `check` should re-run all bound proofs or only those whose `evidence_path` is stale (a
  `swarm-core-verify` concern).
- The exact split of `status` vs `drift` output (overlapping projections over the ledger).
- C-002 (no semantic fork) is only testable once `swarm-core` can parse the kernel's canonical sets — a
  real ordering dependency on the parser spec; until then C-002 is `BLOCKED`, not `PASS`.
