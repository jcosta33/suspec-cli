---
type: audit
id: command-surface-2026-06-08
status: draft
created: 2026-06-08
updated: 2026-06-08
title: The command surface — garden vs. the canonical 14 (skeptic review)
---

# Audit: the command surface — garden vs. the canonical 14

> **Stance: observation-only.** A refute-by-default skeptic review of swarm-cli's feature surface against its
> own stated goal — ADR-0001 (one tool, `/src`, no monorepo) and spec 001 (a **fixed 14-command surface**;
> `IF-001`/`C-001`). It records what *is* and the risk it carries; it authors no obligations and prescribes no
> fixes — the collapse obligations are authored in `specs/005-command-surface-collapse/`. Sibling of this
> folder's `audit.md` (the toolchain-alignment audit); this one is scoped to the command surface.

## 1. The garden contradicts the repo's own spec (HIGH)

`src/modules/Commands/useCases/` holds **59 command use-cases**. Spec 001 `IF-001` sanctions **14**, and
`C-001` forbids any non-namespaced command outside them — the redesign exists to "collapse the command
garden." So **52 commands are non-canonical — the garden `C-001` forbids** (59 existing minus the 7 built canonical), and they are not stubs: **60 spec files**
(`src/modules/Commands/__tests__/`) maintain them.

The split is **inverted** — of the canonical 14, only **7 exist** (`init, format, decompose, task, review,
merge, status`); the **7 missing are the actual Swarm pipeline**: `lint, check, lower, worktree, trace,
promote, drift`. The repo built the periphery and skipped the spine. (`validate.ts`, 109 lines, likely
duplicates the canonical `check`/`lint`.)

## 2. Garden categorization (observation — keep/fold/cut against the stated goal)

| Bucket | Commands | Why |
| --- | --- | --- |
| **Dead / broken** | `screenshot`, `visual` (import `playwright`, **absent from `package.json`** → broken; AGENTS.md says "No UI"); `chaos` (`run():number` stub); `mock` (`TODO` body) | Vestiges of "another project" (AGENTS.md's own warning) |
| **Off-mission generic toolkit** | code-analysis (`arch, deps, dead-code, complexity, graph, ast-rename, refactor, test-radius, audit-sec, find, references`), test-gen (`fuzz, mock, repro, heal`), util sprawl (`compress, context, knowledge, memory, telemetry, logs, profile, prune, migrate, epic, path, capabilities, triage, docs`) | None touches the SOL spec pipeline |
| **Fold into a canonical command** | task-nav (`new, list, show, open, pick, focus` → `task`); `dashboard` → no-args TUI; `help` → CLI built-in; `doctor`/`health` → one adoption-health util | Behavior worth keeping, but not as a top-level command (`C-001`) |
| **Pre-pivot vision — decide** | agent-runtime (`daemon, launch-agent, chat, message, lock`), git-flow (`pr, release, remove`) | From the multi-agent vision whose specs were **dropped** (the migrate-then-remove cleanup); noise against the single-pipeline focus |

This categorization is a **judgment against spec 001's goal**, not a unilateral kill list — the scope decision
is the owner's (see §6). Not every garden command was read; `chaos`/`fuzz`/`screenshot`/`visual`/`mock` were
sampled, the rest classed by name + size.

## 3. The Swarm-native core is an island (HIGH)

`knip` reports `src/modules/Sol/useCases/index.ts` as an **unused file**, and nothing imports
`src/modules/Sol`. The SOL parser (spec 002, 12/13 obligations, real work) is **dead until a `lint`/`check`
command consumes it**. Not a defect — but it proves §1: the genuine core is unwired while 52 off-mission
commands ship.

## 4. `scaffold/` (the `swarm init` payload) is stale (MEDIUM)

`scaffold/skills/` still ships **removed** skills (`manage-task`, `personas`, `write-spec`) and the old
type-folder tree (`audits/ research/ specs/ tasks/`). `swarm init` would scaffold a dead shape.

## 5. What is sound (keep — the skeptic found little to fault here)

- **The module architecture + dependency-cruiser boundaries** — real and enforced (`deps:validate` ✔, 0
  violations); the DDD discipline is the repo's strongest asset.
- **Lean deps** — 4 runtime (`@clack/prompts, better-sqlite3, picocolors, proper-lockfile`); provider-neutral
  (`C-003` ✓), no vendored analyzer (`C-004` ✓).
- **Pipeline-feeding modules:** `Adapters` (swappable backends), `Workspace` (git/worktree → `worktree`/`merge`),
  `Terminal` (the shell), `TaskManagement` (slug/dag/template → `task`/`decompose`), **`Sol`** (the parser),
  the `Result`/`AppError` infra, the `specs/`+`decisions/` ADRs, the test discipline.
- **Watch-item (not a cut):** the infra `DI container + event bus + SQLite telemetry`
  (`AgentState/services/telemetry.ts`, `better-sqlite3`) may be heavier than a single spec-CLI needs — they
  came from the agent-orchestration vision; make them earn their keep.

## 6. The core contradiction (the decision this audit surfaces)

The code and the spec disagree: **spec 001 says 14 focused commands; the code ships 59.** Either
**(a) collapse the code to the spec** (cut/fold the 52 garden commands, build the 7 missing pipeline
commands, wire the parser into `lint`/`check`) — the pivot the spec already mandates — or **(b) the spec is
wrong** and the product is a broad toolkit, so `IF-001`/`C-001` must be rewritten. The both-at-once state is
the problem. The reviewer's read: the spec is right; the garden is legacy to retire. The obligations for path
(a) are authored in `specs/005-command-surface-collapse/`.

## Evidence (what was verified directly)

`ls src/modules/Commands/useCases` = 59; spec 001 `IF-001` = 14; existence check = 7 built / 7 missing; `knip`
= Sol unused-file + a test-helper unused export; `grep` = `screenshot`/`visual` import `playwright`, absent
from `package.json`; `grep` = nothing imports `src/modules/Sol`; `ls scaffold/skills` = removed skills present;
`pnpm deps:validate` ✔ 0 violations; 4 runtime deps.
