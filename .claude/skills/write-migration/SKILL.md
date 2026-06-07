---
type: pass-guide
name: write-migration
pass: implement
activates_for_task_kind:
  - migration
  - upgrade
description: >-
  Move an implementation from API A to B (framework/library bump or API replacement), surface
  preserved, in green-per-wave steps. ALWAYS apply when a `task.md` names `pass: implement` +
  `task_kind: migration`/`upgrade`, or the user asks to migrate, upgrade, port, or adopt a
  breaking change — only while behaviour holds. Do not change unrelated behaviour, bulk-codemod,
  skip per-wave validation, finish with old-API callsites surviving, or leave a shim without a
  removal criterion. Skip same-version behaviour-preserving refactors, behaviour-changing
  rewrites, and net-new features at the new version.
---

# Step guide: write-migration (`implement` · `task_kind: migration` | `upgrade`)

> **SOFT control (Invariant 2).** This guide tells you *how* to run a `migration`
> or `upgrade` implement step. It does **not** define modality, authority order,
> verification semantics, the verdict values, or the proof taxonomy — those are
> owned only by SOL and the typed structured form. Every load-bearing term below (a
> `REQ`/`CONSTRAINT`/`INVARIANT`/`INTERFACE` obligation, a `TRACE` block,
> `IMPLEMENTS`/`PRESERVES`/`CHANGED`/`PROOF`, the 7-value verdict, the `SOL-O005`
> owned-path rule, the COVERAGE gate) is **cited, not redefined**. Where this
> guide and the language reference disagree, the reference governs.
>
> **One discipline, two kinds.** `migration` and `upgrade` share one wave-planned
> procedure: both move the implementation across an API boundary while preserving
> the surface. They differ only in the *trigger* (an internal API sunset vs a
> framework/language/library version bump), not the method, so one guide carries
> both. This is a narrow branch of the `implement` step of the nine (`author → lint →
> improve → lower → decompose → implement → verify → review → promote`), carrying
> the full migration discipline at depth for the two kinds it names.

## Purpose

A migration moves the implementation from API A to API B — a framework upgrade, a
language version bump, a library replacement, an internal API sunset — while the
behaviour callers observe is preserved. The *implementation* moves; the *contract*
does not. Migrations fail in two ways, both producing a diff that looks finished:

- the **permanent half-migration** — some callsites use the old API and some the
  new, indefinitely, because validation only ran at the end and the cross-wave
  drift became its own untangling project; and
- the **phantom completion** — the migration "completes" with old-API callsites
  still alive in dynamic dispatch, registries, generated code, or string-based
  lookups that a text search never reached.

This guide prevents both. Anything that *also* changes behaviour is a separate
task — promote it, do not smuggle it in under the mechanical change.

## Stance: Migrator

Adopt the Migrator stance: mechanical, careful, paranoid about partial states.
The Migrator knowingly remaps an externally reachable contract from one API to
another — where the refactor mindset forbids any behaviour delta at all — which
is exactly why the migration must prove the *surface* held while the *internals*
moved. The Migrator is hostile to "I'll `sed` this across all 200 files", to
"wave validation is optional, it's all the same change", to "the shim is
temporary, no need to document removal", and to "old API is mostly gone, I'll
handle the last few in a follow-up" — "mostly gone" means unfinished. A stance
sharpens *what you look for and refuse*; it never changes the procedure below and
never decides a verdict.

## Consumes

- One `task.md` — the structured work packet for this single step. `implement` works
  against the packet `decompose` handed it, **not** the surface spec or the structured form.
  Read in particular: `assigned_obligations`, `constraints`, `invariants`,
  `interfaces` (the SOL blocks pasted verbatim that fix scope); `write_surfaces`
  (your **owned paths**, the only files you may touch); `verification_bindings`
  (the proofs each obligation demands); and the `task_kind` enum, which must read
  `migration` or `upgrade` for this guide to apply.
- The migration spec — a SOL `*.swarm.md` whose `REQ`/`CONSTRAINT`/`INVARIANT`/
  `INTERFACE` blocks state what moves from A to B and what surface must be
  preserved — and the triggering audit, when one exists. Read it in full before
  editing.
- Project command slots resolved through the consuming repo's `AGENTS.md >
  Commands`: `cmdTest` and `cmdValidate` (run together after every wave), and the
  architectural/dependency-validation command confirming the old API is truly gone
  (often a `cmdValidate`-adjacent slot such as a dependency-cruiser, not a fixed
  contract slot). **If `AGENTS.md` is missing or a slot you need is undefined, ask
  the user which command to run before proceeding — never guess.** A guessed
  validation command produces a false signal about whether a wave left the codebase
  green.

## Produces

- Code/test changes within the declared write surfaces, and only there, migrating
  the assigned obligations from API A to API B.
- A `trace.md` recording one `TRACE` block per assigned obligation — `IMPLEMENTS`
  the `REQ` ids satisfied, `PRESERVES` the `CONSTRAINT`/`INVARIANT` ids held,
  `CHANGED` the modified surfaces, and at least one `PROOF` line with pasted,
  re-runnable output. Its `## Provenance` section carries the per-binding drift
  fields the staleness join depends on. Externalising the run's intermediate work
  into this durable artifact lets the downstream `verify` and `review` steps
  judge it.

## Preserves

- **Observable behaviour, end to end.** This is the obligation a migration exists
  to honour — see rule 1. The test suite passes before, at every wave checkpoint,
  and after. Constraints, invariants, and non-goals are held, not relaxed;
  changing an obligation's intent is an amendment decision at `improve`, never an
  `implement` action.
- **Only the assigned obligations.** Any change not traceable to an assigned
  obligation is an `## Unassigned changes` row in the trace (reason + authorizing
  ID, or `none`), judged at `review` — never a silent edit.
- **Only the declared write surfaces.** Owned paths MUST stay a subset of the
  union of the assigned obligations' `WRITES` surfaces. A path touching a file
  outside any assigned obligation's declared write surface is the owned-path
  defect `SOL-O005` ("owned path outside declared write surface") — the property
  that keeps parallel `implement` packets write-disjoint. If a wave needs a file
  outside your owned paths, stop: the file belongs to another packet, or the write
  surface needs amending upstream.

## Core rules

### 1. Surface-level behaviour is preserved — prove it, don't assume it

The implementation moves from API A to API B; what callers observe does not. Prove
preservation with an equivalence check that **would fail if behaviour changed** —
property-based, differential, or golden-output. Differential is the natural fit:
keep the old-API path reachable behind a shim and diff old vs new until clean. A
green suite is *necessary but not sufficient* — it only covers what was already
tested, so a behaviour delta in an untested corner passes silently; where no
stronger oracle exists, record in the self-review *why* the suite is a sufficient
oracle for this specific migration. If a test fails after a wave, investigate
before "fixing" it — adapting a test to a new result is how a migration silently
turns into a rewrite. *Rationale:* a migration that changed behaviour is a rewrite
mislabelled; relabel it and load that discipline rather than shipping drift under a
mechanical change.

### 2. Plan in waves, up front

Break the migration into waves before starting. A wave is the smallest atomic
change that leaves the codebase compiling and passing tests. Document the waves up
front; do not discover them mid-migration. *Rationale:* an undocumented wave plan
cannot be validated against, and a plan drawn up after the migration started has no
checkpoint structure to catch drift before it accumulates.

### 3. Validate after every wave — never let two waves' breakage accumulate

Run `cmdTest` and `cmdValidate` at the end of every wave; paste both outputs as you
go. The codebase must be green at every wave checkpoint, not only at the end.
*Rationale:* per-wave validation catches a break while it is one wave old and cheap
to bisect; final-only validation lets two (then five, then ten) waves' breakage
tangle together until untangling it is its own project — the permanent
half-migration failure mode.

### 4. Each file migrated individually — no bulk codemods

No `sed`, no codemod, no shell loop sweeping hundreds of files in one commit. Bulk
operations hide the one context-specific callsite using the API in an unusual way
— the fixed substitution silently breaks it, and the green-looking global edit is
exactly the misleading signal the Migrator distrusts. Each file is read, migrated,
and reviewed deliberately. *Rationale:* the outliers are where migrations break,
and a bulk edit is structurally blind to them.

### 5. Track callsite coverage explicitly, across the whole codebase

Count the old-API callsites up front; track per wave how many are migrated and how
many remain. The migration is done only when old-API callsites *outside
explicitly-tracked shims* number **zero** — counted over the **whole codebase**,
not just the modules the migration was scoped to. *Rationale:* an old-API call in
an un-scoped module is the half-migration that never closes; the up-front count is
the falsification target that makes "done" checkable instead of asserted.

### 6. Document every shim with a verifiable removable-when criterion

A compatibility shim lets old callers keep working while the migration proceeds.
Record three things *before* introducing each shim: its **path** (where it lives),
its **forward target** (what it forwards to), and a mechanically verifiable
**removable-when criterion** (e.g. `git grep -c '<old-API>' src/` returns 0). A
shim with no removal criterion is permanent by default. *Rationale:* permanent
shims are the migration's lasting cost; the criterion turns a temporary bridge back
into a finite one — without it, "temporary" means "forever".

### 7. Search beyond grep — the references a text search cannot reach

Static text-search misses the callsites that fail rule 5 silently. After grep,
audit these explicitly and paste the results into the self-review:

- dynamic-dispatch sites (interface implementations, virtual methods);
- string-based references (registry lookups, dependency injection by name);
- generated code (build outputs, codegen templates);
- test fixtures and snapshots; reflection.

*Rationale:* the phantom completion fires precisely where the old API survives in a
form `git grep` of the call syntax cannot see; the explicit audit is the only thing
that closes the gap a text search leaves.

### 8. Promote out-of-scope findings — never fix them inline

Anything you discover that is not on the migration plan's list gets a
`## Promotion queue` row with a target (an audit or follow-up task) and a status,
not a silent fix. "While I'm migrating" semantic changes destroy reviewability —
the reviewer can no longer tell the mechanical surface move from a behaviour delta
riding along with it. All promotion items MUST be resolved before the task closes.
*Rationale:* the migration's whole value is that it is reviewable as a mechanical
change; one bundled "improvement" forfeits that.

### 9. Forced visible output: paste it, don't assert it

Any verification step that is otherwise invisible MUST produce pasted, verbatim
output. A `PROOF` line referencing real run output is admissible; an unqualified
"tests passed" or "validation clean" is not. A `TRACE` claiming `IMPLEMENTS` with
**zero** `PROOF` lines is a structural parse error (`SOL-S014`), not a soft lint;
an `IMPLEMENTS`/`PRESERVES` naming an unknown obligation is the unbound
cross-reference `SOL-M003`. The observed `proof_result` (`passed | failed | blocked
| unverified`) is only the core run observation; the `PASS` decision is made
downstream by the profile-independent `verify` step, and the lifecycle decorators
(the 7-value verdict's `WAIVED`/`STALE`/`CONTRADICTED`) are applied later at
`review` — never here. *Rationale:* the verbatim paste is the only thing that
closes the bypass where "the wave passed" is asserted but the command was never
run — the execution failure mode this gate defends against.

## Procedure

The step has a common spine and the migration-specific waves below.

1. **Read the packet and the spec, not the structured form.** Read the full `task.md` (parent
   contract, In/Out scope, obligations verbatim, constraints/invariants) and the
   migration spec / driving audit. Resolve project commands from `AGENTS.md >
   Commands`; ask the user for any undefined slot.
2. **Confirm the owned paths.** Verify `write_surfaces` is a subset of the assigned
   obligations' `WRITES` surfaces. If a wave needs a file outside it, stop — that is
   `SOL-O005`; the file belongs to another packet, or the write surface needs
   amending upstream.
3. **Halt on ambiguity.** If an assigned obligation is unclear or contradictory,
   surface it — do not invent the requirement. Resolving it silently is an
   amendment you are not authorized to make at `implement`.
4. **Record the from / to / why.** Write down the API being replaced (with version
   if relevant), the API replacing it, and one sentence on why now.
5. **Capture the equivalence oracle before touching code** (rule 1). Establish the
   differential/golden/property baseline that pins current behaviour; run `cmdTest`
   and confirm green. If no stronger oracle than the suite exists, note the
   sufficient-oracle justification now.
6. **Count old-API callsites and plan the waves** (rules 2, 5). Grep the *whole*
   codebase for the old API; fill the callsite tracker; lay out the wave table —
   each wave the smallest atomic change that leaves the codebase green.
7. **Run each wave, one file at a time** (rule 4). At the end of every wave run
   `cmdTest` and `cmdValidate` and paste both (rule 3). Document each shim before
   introducing it (rule 6). Begin a wave only after the previous wave's validation
   passed.
8. **Audit beyond grep** (rule 7). After the last wave, audit dynamic dispatch,
   string-based lookups, generated code, and fixtures/snapshots; paste the results.
   Drive remaining old-API callsites (outside tracked shims) to zero.
9. **Write the TRACE claims** (rule 9). Per obligation: `IMPLEMENTS` / `PRESERVES`
   / `CHANGED` + at least one pasted `PROOF` line. Record the `## Provenance` drift
   fields per binding.
10. **Resolve the promotion queue** (rule 8) — every out-of-scope discovery has a
    target + status; none left unresolved.
11. **Self-review** — see below; the task is not done until every check is answered
    in writing with the evidence pasted.

## What does not belong

- **In a migration:** behavioural drift bundled with the surface change. If the new
  API behaves differently and that divergence is intentional, it is a separate
  spec/task (a `rewrite`) — promote it, do not ship it here.
- **In the task's `## Findings`:** durable architectural concerns not promoted
  upstream to an audit.
- **In this guide:** the refactor and rewrite disciplines. A behaviour-preserving
  restructuring at a single API version is a `refactor`; a deliberate behaviour
  change is a `rewrite`; net-new behaviour at the new API version is a `feature`.
  Each has its own guide — do not run a migration under one of those labels, or one
  of those under this.

## Anti-patterns

- ❌ A bulk codemod / `sed` / shell loop touching hundreds of files in one commit →
  one file at a time; the global edit hides the outlier (rule 4).
- ❌ Running validation only at the end, not per wave → validate after every wave;
  final-only lets drift tangle into the half-migration (rule 3).
- ❌ Declaring done with old-API callsites still present outside tracked shims →
  "mostly gone" is unfinished; drive the count to zero across the whole codebase
  (rule 5).
- ❌ A shim with no removable-when criterion → temporary without a criterion is
  permanent debt (rule 6).
- ❌ "While I'm migrating" semantic tweaks bundled into the surface change → promote
  them; they forfeit the migration's reviewability (rule 8).
- ❌ Trusting `git grep` alone → dynamic dispatch, registries, generated code, and
  reflection are not text-searchable; audit them explicitly (rule 7).
- ❌ A wave plan drawn up after the migration started → plan the waves up front
  (rule 2).
- ❌ Adapting a failing test to the new API's output and calling the wave green →
  that is a behaviour change; relabel as `rewrite` or investigate (rule 1).
- ❌ "Tests passed" / "validation clean" with no pasted output → paste the runner's
  last lines verbatim, fenced, as data (rule 9).

## Output contract

The `trace.md` and the filled `task.md` together satisfy the spec contracts; this
guide does not redefine them.

- The `trace.md` MUST carry: frontmatter (`type: trace`, `id`, `source_task`,
  `source_spec`, `created`); `## Claimed implementation` (the `TRACE` blocks);
  `## Provenance` (the per-binding drift fields); `## Verification matrix`
  (ID → required proof → actual proof → status); `## Unassigned changes` (each with
  reason + authorizing ID, or `none`); `## Promotion items` (target + status).
- Each `TRACE` claiming `IMPLEMENTS` MUST carry at least one `PROOF` line
  (`SOL-S014` otherwise); an `IMPLEMENTS`/`PRESERVES` naming an unknown obligation
  is `SOL-M003`.
- The observed `proof_result` maps 1:1 to the downstream core verdict (`passed →
  PASS`, `failed → FAIL`, `blocked → BLOCKED`, `unverified → UNVERIFIED`); the PASS
  decision and lifecycle decorators are not made here (rule 9). The Migrator stance
  may influence which proofs you demand of yourself; it never decides whether a run
  PASSes.

## Self-review

> **Hard gate.** The task is not complete until every question below has a written
> answer directly beneath it, with the named output pasted verbatim. Migrations
> fail in two ways — a wave that left the codebase half-migrated, and a
> "completion" that left old-API callsites lurking. Review as a senior engineer
> hostile to both.

- **Verification outputs (paste actual command output — do not paraphrase):**
  `git status`; each per-wave `cmdTest` + `cmdValidate` output; the final
  `cmdTest` and `cmdValidate` (last 2 lines each); `git grep -n '<old-api-marker>'`
  showing remaining callsites (zero, or only inside documented shims).
- **Behaviour preservation:** What is the equivalence oracle, and would it fail if
  behaviour changed? Are the test results before and after identical? Did any
  behaviour change anywhere — and if so, is it promoted and the spec/audit updated?
  If the suite was the only oracle, is the sufficient-oracle justification recorded?
- **Wave integrity:** Did every wave end with the codebase green? Did `cmdValidate`
  and `cmdTest` pass at *every* wave checkpoint, with the outputs pasted? Or did
  validation slip to the end?
- **Callsite coverage:** Did I grep the *entire* codebase for the old API, not just
  the modules I expected it in? Is the tracker count accurate? Are zero old-API
  callsites remaining outside documented shims?
- **Beyond grep:** Where might a callsite hide that text search won't find —
  dynamic dispatch, string-based lookup, registry, generated code, reflection,
  fixtures? Is the explicit audit of each pasted?
- **Shim hygiene:** Is every shim documented with a verifiable removable-when
  criterion? Are any shims that should have been removed in *this* migration still
  present?
- **Scope:** Did I touch only the assigned obligations and only the declared write
  surfaces (no `SOL-O005`)? Are all promotion items resolved? Did "while I'm
  migrating" creep in?
- **Final adversarial step:** What did I leave behind? Is the old API removed, or
  is its removal scheduled with a clear, tracked timeline? Any TODOs,
  half-migrated files, or stub-shimmed modules left behind? Do not close without
  this.

## Bundled resources

- `references/task-template.md` — a fillable migration-task frame (objective,
  from/to/why, wave plan, compatibility-shim table, callsite tracker, per-wave
  validation slots, promotion queue, and a self-review hard gate covering wave
  integrity, callsite coverage, shim hygiene, behaviour preservation, and final
  state). It scores on the multi-session-waves, multi-stage-plan,
  state-separate-from-deliverable, and paste-output-gate criteria, so it ships a
  template. Instantiate it into your local task file, resolve the `cmd*` slots from
  `AGENTS.md > Commands` (asking the user for any undefined slot), and fill it in as
  you work.
