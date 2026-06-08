---
type: audit
id: toolchain-alignment-2026-06-08
status: draft
created: 2026-06-08
updated: 2026-06-08
title: swarm-cli toolchain spec-suite — alignment with the current Swarm framework
---

# Audit: swarm-cli spec-suite alignment with the current Swarm

> **Stance: observation-only.** This audits the swarm-cli toolchain spec suite (specs 001/002 + the `init`
> command) against the **current** Swarm framework after the kit re-sync (swarm @ ADR-0049/0050/0051/0052 +
> 0053/0054/0055). It records what *is* and the risk it carries; it authors no obligations and prescribes no
> fixes. It is co-located with the spine spec (001) because the bulk of the drift is the operator's
> workspace/init model. It seeds the respec + new-spec backlog (§4).

## Method

Read specs `001-swarm-cli` and `002-swarm-core-parser` in full against the re-synced kit (`.agents/reference`,
`.claude/skills`, `AGENTS.md`) and the governing ADRs. Cross-checked every `.swarm/`-path and "kernel"/"overlay"
claim against ADR-0049 (minimal install, **no mount, no imposed workspace**), ADR-0050/0051 (spec-repo
discipline; specs top-level; `.agents/` = tooling), and ADR-0052 (artifact homes). Inspected the live `init`
command (`src/modules/Commands/useCases/init.ts`) and its payload (`scaffold/`).

## 1. The dominant drift — spec 001 is built on the retired `.swarm/` mount model (HIGH)

Spec 001 fixes the operator on a `.swarm/` workspace partition that **ADR-0049 retired**. ADR-0049 (and
0050/0051) replaced the mounted kernel + overlays + pre-built workspace tree with **install-in-place**:
`AGENTS.md` at repo root, skills in the CLI's scan dir (`.claude/skills/` or `.agents/skills/`),
`reference/`+`templates/`+`memory/` under `.agents/`, and **`specs/` + `decisions/` top-level**. There is no
`.swarm/` mount, no `overlays/` dir (project conventions live in `AGENTS.md`), and **no per-repo version
marker** (ADR-0050 dropped it). The affected surfaces:

| Spec 001 surface | Drift | Current model |
| --- | --- | --- |
| `IF-001` `init` + ERRORS `kernel-version-skew` | Creates `.swarm/`; errors on kernel version | `init` lays down the in-place adoption layout; there is no kernel version to skew |
| `AC-001` "load active kernel then project overlays via swarm-core … READS `.swarm/kernel/**`,`.swarm/overlays/**`" | Mount + overlay resolution | No mount; the operator reads repo `AGENTS.md` command bindings + `.agents/` config |
| `AC-002` refuse on mutually-incompatible kernel/core/cli versions | Per-repo version marker retired (ADR-0050) | At most `core`/`cli` package semver; the *kernel* axis is gone |
| `AC-004` "create the canonical `.swarm/` workspace partition … install a kernel version" | Mount creation | `init` writes `AGENTS.md` + `.agents/{skills,reference,templates,memory}` + `specs/` + `decisions/`, create-only |
| `I-001` `.swarm/` partition (`kernel/ overlays/ sources/ status/ generated/ memory/ ledger/ archive/ tmp/`) | The whole partition is retired | The adoption layout above; scratch is gitignored, not a mounted `tmp/`/`generated/` |
| `I-002` "leave `.swarm/kernel/` byte-unchanged" | No kernel mount exists | An upgrade re-copies the named Swarm skills/cards in place; the invariant has no referent |
| `C-005` "MUST NOT overwrite/delete an existing `.swarm/` workspace during init" | `.swarm/` referent | Create-only still holds, but over the in-place layout (don't clobber `AGENTS.md`/`specs/`/`.agents/memory`) |
| Intent/Context | "consumes the installed kernel and project overlays"; `.swarm/kernel/model/`, `.swarm/sources/research/` | Reframe to the in-place adoption surface |

**Risk:** 001 is the *spine* and `init` is the adopter's first contact. If implemented as written, `swarm init`
would scaffold a workspace shape the framework no longer uses — the exact misalignment that makes a fresh
adopter's first run fail silently (the framework's own ADOPTING.md dead-end concern).

## 2. The `init` command is doubly misaligned (HIGH)

`init.ts` does `cpSync(scaffold/ → .agents/, …)`. Both layers are wrong against the current model: (a) **payload**
— `scaffold/` still ships removed skills (`manage-task`, `personas`, `write-spec`) and lacks `reference/`,
`templates/`, `memory/`, `specs/` example, `decisions/`; (b) **placement** — copying everything into `.agents/`
puts skills where Claude Code never scans (`.claude/skills/`), `AGENTS.md` under `.agents/` instead of root, and
specs under `.agents/` instead of top-level. This is the concrete instance of §1 and needs a spec'd redesign,
not a payload patch.

## 3. Vocabulary drift — "kernel"/"overlay" (MEDIUM, both specs)

ADR-0050/0051 retired "kernel" as the name for the installable framework payload (it is the starter-kit,
installed in place) and "overlays" as a directory (conventions live in `AGENTS.md`). Spec 001 uses "kernel"
~throughout; spec 002 uses it lightly ("kernel/overlay resolution", "the kernel's closed sets"). The closed
sets are **Swarm's** (the language reference), not a "kernel's". No de-cosplay compiler vocab remains in either
spec (checked) — this is the only vocabulary residue.

## 4. What is sound + the backlog this seeds

- **Spec 002 (parser) is well-aligned** — SOL surface → typed IR, read-only, no semantic fork, source-mapped,
  diagnostics-not-repair. Only the "kernel" vocabulary needs fixing. It is the correct foundation for the lint
  layer. (Its `content_hash` Q-001 is now informed by ADR-0055: the parser is a *tool*, so it computes real
  hashes — the by-hand placeholder rule does not apply to it.)
- **The 14-command surface is largely sound** — the pipeline verbs (`lint format check lower decompose task
  worktree trace review merge promote status drift`) map to the framework's steps; only the
  workspace/init/version *semantics* need rebasing (§1).

**Respec now (this phase):** realign spec 001's workspace/init/version obligations to the in-place model;
fix spec 002's vocabulary.

**New specs to author (backlog):**
- **`swarm lint`** (the SOL linter — the 5 lint layers S/P/M/V/O over spec 002's IR). *The headline QOL/lint
  feature; authored this phase as `specs/004-swarm-lint/`.*
- **`swarm-core-verify`** — the merge gate + oracle adequacy (ADR-0055: empty-set floor, adequacy-BLOCKING for
  `RISK high|critical`), backing `check`/`review`.
- **`swarm-core-worktree`** — the lease manager + ledger (seeded by `specs/003-swarm-core-worktree/research.md`).
- **`swarm init` redesign** — fold the in-place adoption layout into a realigned 001 or a dedicated init spec.
- **QOL:** `doctor` (environment + adoption-layout health), `drift`/`status` (the staleness + ledger projections).

## Critical watch-outs (shortlist)

1. `.swarm/` mount model in spec 001 — retired; rebase on install-in-place. · 2. `init` payload + placement both
wrong. · 3. Per-repo "kernel version" skew guard — the version axis is gone. · 4. "kernel"/"overlay" vocabulary.
· 5. Parser is sound — build lint on it. · 6. The merge gate the CLI will enforce must carry the ADR-0055
sharpenings (empty-set, adequacy-for-high-RISK).
