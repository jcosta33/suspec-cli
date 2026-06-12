---
type: spec
id: SPEC-swarm-cli
title: swarm-cli — the operator for the fixed Swarm pipeline
status: draft
owner: José Costa
sources: [self]
created: 2026-06-06
format: sol
---

# Spec: swarm-cli — the operator for the fixed Swarm pipeline

## Intent

`swarm-cli` is the interactive and scriptable **operator** for a Swarm-adopted repository: it installs and
operates the **in-place adoption layout**, exposes the fixed Swarm pipeline as a small command surface, and
delegates implementation work to external agent adapters and verifier toolchains. This spec fixes the
**spine** — the adoption surface it consumes and the canonical command surface. The semantics each command
invokes (SOL parsing/IR, the verifier + merge gate, worktree leasing, the lower→…→promote pipeline, the
ledger) live in dedicated `src/modules/` — the SOL parser/lint in `src/modules/Sol`, worktree/state in
`Workspace`/`AgentState`, and so on — each its own feature spec, **not a separate package** (ADR-0001:
one tool, code in `/src`, no monorepo).

The adoption surface is the one the Swarm framework defines (ADR-0049/0050/0051/0052): **install-in-place,
no mount.** `AGENTS.md` at the repo root (the bootloader + command bindings), the Swarm skills in the
directory the agent CLI scans (`.claude/skills/` for Claude Code, else `.agents/skills/`), the reference
cards / templates / memory seed under `.agents/`, and **`specs/` + `decisions/` top-level**. There is no
`.swarm/` workspace, no mounted kernel, and no `overlays/` directory (project conventions live in `AGENTS.md`).

## Non-goals

- This spec does not define SOL grammar, the verdict model, the merge gate, or the artifact-home model —
  those are the Swarm framework's, consumed here, not redefined.
- It does not specify the internals of any single command's step (lower/verify/decompose/…); those are
  the per-feature specs for the `src/modules/` that implement them.
- It does not own agent-provider authentication or the chat loop, nor a browser UI.

## Context

The repository is a TypeScript prototype (`~59` file-dispatched commands over a legacy `.agents/` model)
being redesigned into a Swarm-native toolchain shipped as **one tool** (`swarm`), one package, all code in
`/src` (ADR-0001 — no monorepo, no published partials). DDD modules under `src/modules/` enforced by
dependency-cruiser; the SOL semantics are **core modules** (`src/modules/Sol`) barred from depending on
`Commands`/`Terminal`. The redesign collapses the command garden to the fixed pipeline. The
adoption layout this operator installs and reads is defined by the framework's `ADOPTING.md` (install-in-place,
ADR-0049). Design inputs: the swarm-cli redesign research and the toolchain-alignment audit
([`audit.md`](audit.md)).

## Interfaces

INTERFACE IF-001:
`swarm <command> [args]` RETURNS `CommandResult | UsageError`
ACCEPTS:
  - `command: init | lint | format | check | lower | decompose | task | worktree | trace | review | merge | promote | status | drift`
  - `args: string[]`
ERRORS:
  - unknown-command
  - workspace-not-initialized
OWNED BY swarm-cli
VERIFY BY contract:cmdTest:src/modules/Commands/__tests__/contract/command-surface.contract.spec.ts#canonical_surface

## Obligations

REQ AC-001:
WHEN the cli starts a command other than `init`
THE cli MUST resolve the repository's Swarm adoption surface — the `AGENTS.md` command bindings and the `.agents/` reference/config — before executing the command
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/startup/resolve-surface.spec.ts#surface_resolved_before_command
DEPENDS ON IF-001
READS AGENTS.md, .agents/**
RISK high

REQ AC-002:
WHEN the installed kit's SOL language version is incompatible with the cli's SOL parser (`src/modules/Sol`)
THE cli MUST refuse to run the command
AND THE cli MUST report the language-version skew
BECAUSE the parser parses against one SOL language version; running it over a kit authored for an incompatible version would mis-parse or silently mislint
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/version/language-skew-guard.spec.ts#refuses_and_reports_on_skew
DEPENDS ON AC-001
RISK high

REQ AC-003:
THE cli MUST register the fourteen canonical commands declared by IF-001
VERIFY BY contract:cmdTest:src/modules/Commands/__tests__/contract/command-surface.contract.spec.ts#exactly_fourteen
DEPENDS ON IF-001
RISK medium

REQ AC-004:
WHEN `swarm init` runs in a repository that has no Swarm adoption layout
THE cli MUST install the in-place layout — `AGENTS.md` at the repo root, the Swarm skills in the agent CLI's scan directory, the reference cards / templates / memory seed under `.agents/`, and top-level `specs/` and `decisions/`
AND THE cli MUST place the skills in `.claude/skills/` when the target uses Claude Code, otherwise `.agents/skills/`
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/init/adoption-layout.spec.ts#installs_in_place_layout
WRITES AGENTS.md, .claude/skills/**, .agents/**, specs/**, decisions/**
RISK high

REQ AC-005:
THE cli MUST route every interactive (TUI) action through the same command dispatch as its non-interactive invocation, so each action has an equivalent scriptable form
BECAUSE parity is only checkable against a single dispatch path — a TUI-only code path would make "every action has a CLI form" unverifiable
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/parity/single-dispatch-path.spec.ts#tui_actions_dispatch_through_command_layer
RISK medium

REQ AC-006:
WHEN the cli is invoked with no command in an interactive terminal
THE cli SHOULD launch the visual TUI over the pipeline state
BECAUSE the prototype showed operators want a no-args at-a-glance board, while headless and CI contexts must stay strictly non-interactive
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/tui/launch.spec.ts#no_args_launches_tui_when_interactive
DEPENDS ON AC-005
RISK low

REQ AC-007:
THE cli MUST treat external agent CLIs as interchangeable worker backends bound through the adapter contract
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/adapters/neutrality.spec.ts#no_hardcoded_provider
RISK medium

## Constraints

CONSTRAINT C-001:
THE cli MUST NOT expose a non-namespaced top-level command outside the canonical surface of IF-001
BECAUSE the redesign's value is a small framework-aligned surface; a plugin MAY add commands, but only namespaced (`swarm <plugin>:<cmd>`), never on the canonical top-level face
VERIFY BY static:cmdTest:src/modules/Commands/__tests__/contract/command-surface.contract.spec.ts#no_extra_toplevel_commands

CONSTRAINT C-002:
THE cli MUST NOT redefine SOL, verdict, or artifact-home semantics
BECAUSE the Swarm framework is the single source of those semantics; a second definition forks the language
VERIFY BY static:cmdTest:src/modules/Sol/__tests__/no-semantic-fork.spec.ts#enums_match_reference

CONSTRAINT C-003:
THE cli MUST NOT import or bundle a provider's authentication or chat-loop SDK
BECAUSE provider neutrality requires the worker backend to stay external and swappable; the cli only packages launch contracts and context payloads, so a provider SDK has no place in its dependency graph (an import-graph check can falsify this; "owning the chat loop" is just the import made concrete)
VERIFY BY static:cmdValidate:no-provider-sdk-import

CONSTRAINT C-004:
THE repository MUST NOT vendor a third-party analyzer source tree when a package dependency or adapter suffices
BECAUSE the prototype vendored a dependency-cruiser tarball and source tree — dead weight and a supply-chain liability; a vendored tree is a repo-structure fact, not a dependency edge, so it needs a tree scan, not the dependency linter
VERIFY BY static:cmdTest:src/modules/Sol/__tests__/no-vendored-analyzer.spec.ts#no_analyzer_source_in_tree

CONSTRAINT C-005:
THE cli MUST NOT overwrite or delete an existing adoption artifact during `init`
BECAUSE `init` is create-only; an existing `AGENTS.md` is merged by heading with approval, and clobbering project-owned `specs/`, `decisions/`, or `.agents/memory/` would be unrecoverable
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/init/idempotent.spec.ts#init_does_not_clobber_existing

## Invariants

INVARIANT I-001:
every cli operation MUST write each artifact to its canonical home — specs under `specs/<feature>/`, ADRs under `decisions/`, durable findings under `.agents/memory/`, execution scratch gitignored — and MUST NOT invent a parallel tree
VERIFY BY property:cmdTest:src/modules/Workspace/__tests__/artifact-homes.property.spec.ts#artifacts_land_in_canonical_homes

INVARIANT I-002:
WHEN the cli upgrades the installed kit
THE cli MUST re-copy only the named Swarm skills, reference cards, and templates, AND MUST leave the repository's own skills, `specs/`, `decisions/`, and `.agents/memory/` unchanged
VERIFY BY property:cmdTest:src/modules/Workspace/__tests__/upgrade-scope.property.spec.ts#upgrade_touches_only_swarm_payload

## Questions

QUESTION Q-001 [non-blocking]:
Should the visual surface stay TUI-only in v1, or ship a browser-based inspector as a first-class companion?
AFFECTS AC-006

QUESTION Q-002 [non-blocking]:
How should `init` detect "the agent CLI's scan directory" — probe for `.claude/`, read a flag, or prompt — when a repo could be adopted by more than one agent tool?
AFFECTS AC-004

## Verification coverage

These are proof **contracts**: the artifacts do not exist yet, so every obligation here is `UNVERIFIED`
until `implement` builds the bound proof. Each binding resolves through `AGENTS.md > Commands`
(`cmdTest` = `pnpm test:run`, `cmdValidate` = `pnpm deps:validate` = the dependency-cruiser import-graph
check — so a binding's *adapter* is chosen for what can actually falsify the obligation: depcruise for
import-graph facts, a test for filesystem/behaviour facts).

| ID     | VERIFY BY                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------------- |
| IF-001 | contract:cmdTest:src/modules/Commands/__tests__/contract/command-surface.contract.spec.ts#canonical_surface        |
| AC-001 | test:cmdTest:src/modules/Commands/__tests__/startup/resolve-surface.spec.ts#surface_resolved_before_command        |
| AC-002 | test:cmdTest:src/modules/Commands/__tests__/version/language-skew-guard.spec.ts#refuses_and_reports_on_skew         |
| AC-003 | contract:cmdTest:src/modules/Commands/__tests__/contract/command-surface.contract.spec.ts#exactly_fourteen          |
| AC-004 | test:cmdTest:src/modules/Commands/__tests__/init/adoption-layout.spec.ts#installs_in_place_layout                   |
| AC-005 | test:cmdTest:src/modules/Commands/__tests__/parity/single-dispatch-path.spec.ts#tui_actions_dispatch_through_command_layer |
| AC-006 | test:cmdTest:src/modules/Commands/__tests__/tui/launch.spec.ts#no_args_launches_tui_when_interactive                |
| AC-007 | test:cmdTest:src/modules/Commands/__tests__/adapters/neutrality.spec.ts#no_hardcoded_provider                       |
| C-001  | static:cmdTest:src/modules/Commands/__tests__/contract/command-surface.contract.spec.ts#no_extra_toplevel_commands  |
| C-002  | static:cmdTest:src/modules/Sol/__tests__/no-semantic-fork.spec.ts#enums_match_reference            |
| C-003  | static:cmdValidate:no-provider-sdk-import                                                               |
| C-004  | static:cmdTest:src/modules/Sol/__tests__/no-vendored-analyzer.spec.ts#no_analyzer_source_in_tree          |
| C-005  | test:cmdTest:src/modules/Commands/__tests__/init/idempotent.spec.ts#init_does_not_clobber_existing                  |
| I-001  | property:cmdTest:src/modules/Workspace/__tests__/artifact-homes.property.spec.ts#artifacts_land_in_canonical_homes |
| I-002  | property:cmdTest:src/modules/Workspace/__tests__/upgrade-scope.property.spec.ts#upgrade_touches_only_swarm_payload |

## Downstream tasks

| Task | Covers |
| ---- | ------ |
| _(assigned by the `decompose` pass)_ | |

## Distillation loss statement

### Preserved

- The framework-aligned command surface (14 commands), provider-neutrality, the non-interactive parity rule,
  and the three hard restrictions (no extra commands, no semantic fork, no provider-runtime ownership, no
  vendored analyzers) — the load-bearing decisions of the redesign research.

### Dropped

- The research draft's per-command `INTERFACE`/`REQ` detail for every subcommand (lower/decompose/task/
  worktree/trace/review/merge/promote/drift) — carried into the per-module feature specs, not here,
  to keep this spine spec readable and each command's semantics with its owning step.
- The draft's non-conformant ids (`CLI-GOAL-001`, `KERNEL-001`, …) — rewritten to `PREFIX-NNN` ids and real
  `cmd*` adapter bindings (a dogfooding correction).
- **The `.swarm/` workspace + mounted-kernel + overlays model** (spec_version 0.1.0) — retired by ADR-0049
  (install-in-place, no mount, no imposed workspace), 0050/0051 (specs top-level; `.agents/` = tooling), and
  the per-repo version marker (ADR-0050). Realigned in 0.2.0: `init` lays down the in-place adoption layout
  (AC-004); the partition invariant becomes the artifact-home invariant (I-001); kernel-readonly becomes
  upgrade-scope (I-002); kernel-version-skew becomes SOL language-version skew (AC-002). See [`audit.md`](audit.md).

### Still uncertain

- Whether `check` should re-run all bound proofs or only those whose `evidence_path` is stale (a
  `verify`-step concern, now informed by ADR-0055's adequacy gating).
- The exact split of `status` vs `drift` output (overlapping projections over the ledger).
- How `init` resolves the agent CLI's skills directory across tools (Q-002).
- C-002 (no semantic fork) is only testable once `sol-parser` can parse the canonical sets — a real ordering
  dependency on it; until then C-002 is `BLOCKED`, not `PASS`.
