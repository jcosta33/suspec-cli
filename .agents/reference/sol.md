# SOL — operative reference (the rules, condensed)

The operative grammar an agent needs to author and lint SOL. Rules only — rationale, worked examples,
and the full lint catalogue live in the Swarm project (`docs/language/`). This card ships; the manual
does not.

## Frontmatter (required)
`type: spec`, `id`, `swarm_language: SOL/0.1`, `aps_version: 0.1`, `spec_version`, `status`. Optional:
`title`, `owners`, `imports`, `domain`, `created`, `updated`.

## Sections — canonical order (a missing/out-of-order section is `SOL-S012`)
`## Intent` · `## Non-goals` · `## Context` · `## Interfaces` · `## Obligations` · `## Constraints` ·
`## Invariants` · `## Questions` · `## Verification coverage` · `## Downstream tasks` ·
`## Distillation loss statement`. Obligation content lives in SOL blocks, never in the surrounding prose.

## The 7 block types
Binding (carry force): `REQ`, `CONSTRAINT`, `INVARIANT`. Non-binding: `INTERFACE` (boundary, requires a
`contract` proof), `QUESTION` (marked ambiguity), `TRACE` (implementation claim), `VERDICT` (judgment).
`TASK-MAP`/`FINDING`/`ADR` are artifacts, **not** block types.

## IDs — `PREFIX-NNN`, prefix fixed by type (mismatch = `SOL-S005`; dup-in-file = `SOL-S004`)
`REQ`→`AC-` · `CONSTRAINT`→`C-` · `INVARIANT`→`I-` · `INTERFACE`→`IF-` · `QUESTION`→`Q-` · `TRACE`→`T-` ·
`VERDICT` reuses the judged id. Cross-spec ref: `spec-id#AC-001` (hash, not colon).

## The 5 modals (exactly five; uppercase, case-sensitive)
`MUST`, `MUST NOT`, `SHOULD`, `SHOULD NOT`, `MAY`. `SHALL`/`SHALL NOT`/`CAN`/`WILL` are not modals.
Lowercase `must`/`should` is plain prose, no force. A modal that belongs to the actor/response must be
backticked, or the parser must not guess (modal-scan = first modal terminal at a token boundary,
longest-match: `MUST NOT` before `MUST`).

## Block shapes

**REQ** — clauses in this order, bracketed are optional:
```
REQ AC-001:
[WHERE <optional-feature>]   [WHILE <state>]   [WHEN <trigger>]   [IF <fault> [THEN]]
THE <actor> <MODAL> <response>
[AND THE <actor> <MODAL> <response>]        ← each THE/AND-THE lowers to a SEPARATE IR obligation
[BECAUSE <rationale>]  [EXCEPT <exception>]  ← one is REQUIRED whenever a consequence uses SHOULD/SHOULD NOT
VERIFY BY <verify_ref>                       ← REQUIRED (absence = SOL-V001)
[<metadata clauses>]
```
EARS order is `WHERE → WHILE → WHEN → IF`; keyword-less = ubiquitous. `THEN` is optional sugar after `IF`
only. A condition with no actor clause = `SOL-S001`; an actor clause with no modal = `SOL-S003`.

**CONSTRAINT** — `THE <actor> MUST NOT <restriction>` (+ optional `WHERE`/`BECAUSE`/`EXCEPT`), then
`VERIFY BY` (static / contract / manual). `OWNED BY` is INTERFACE-only, never on a CONSTRAINT.

**INVARIANT** — `<property> MUST|MUST NOT <predicate>` (+ optional `BECAUSE`), then `VERIFY BY`. No
`ALWAYS`/`NEVER` (redundant). Prefers a `property`/`model`/`static` proof; a unit-`test`-only binding is `SOL-V003`.

**INTERFACE** —
```
INTERFACE IF-001:
`<signature>` RETURNS `<type>`
[ACCEPTS:  - `<input>`]      [ERRORS:  - <error>]      ← contiguous bullets; a blank line closes the body
[OWNED BY <owner>]
VERIFY BY contract:<adapter>:<artifact>     ← MUST be a contract proof (else SOL-V006)
```

**QUESTION** — `QUESTION Q-001 [blocking|non-blocking]:` then the text, then `AFFECTS <id|surface>`. A
`[blocking]` question blocks lowering of what it `AFFECTS`.

## Metadata clauses (may trail REQ/CONSTRAINT/INVARIANT; feed orchestration, no behavioural force)
`DEPENDS ON <ids>` · `WRITES <surfaces>` · `READS <surfaces>` · `TOUCHES <surfaces>` (advisory) ·
`AFFECTS <ids|surfaces>` · `RISK <low|medium|high|critical>` · `DOMAIN <name>`. A lock group is a named
`SURFACE`, never a `locks` field.

## VERIFY BY (the proof binding)
`VERIFY BY <proof_type>[:<test_scope>]:<adapter>:<artifact>[#selector]`. The `<adapter>` MUST be a
`cmd*` slot in `AGENTS.md > Commands` (unresolved = `SOL-V002` → `BLOCKED`). The 9 proof types and the
verdict model are in `reference/proofs.md`.

## Closed-set counts (MUST reconcile)
7 block types · 5 modals · 7 verdicts (4 core + 3 lifecycle) · 9 proof types · 7 phases · 9 passes ·
10 improve ops · 5 lint layers (S/P/M/V/O) · 7 edge types · 17 `task_kind`.

## Lint floors (the SOL-<LAYER>NNN namespace; full catalogue: `pass-lint-spec/references/code-catalogue.md`)
Blocking, common set: **S** `SOL-S001/S003/S005/S006/S012` · **P** `SOL-P001`–`SOL-P008` ·
**M** `SOL-M001/M002` · **V** `SOL-V001` · **O** `SOL-O001/O005`. APS prose violations surface as
`SOL-P###` (no separate `APS-` prefix).
