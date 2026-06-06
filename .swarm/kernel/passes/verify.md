# Verify — the verdict model, the proof taxonomy, and oracle adequacy

This pass defines the verdict model, the proof taxonomy, and oracle adequacy: the rules by which Swarm judges whether an obligation was satisfied. Self-standing — the authority for this pass lives here.

Swarm ships **no runtime** (Invariant 1, NO RUNTIME). Everything described here — the linter, the merge gate, the drift differ, the adequacy harness, the enforcement lane — is a **contract a future tool builds against**, never shipped code. Today every verdict is recorded by a human or agent in markdown and re-checked by hand or by CI scaffolding that does not yet exist. This file never claims any of it is automatically enforced; where it says a check "MUST raise" or the gate "blocks," read that as the obligation on a future deterministic check, manual until one exists.

---

## 1. What gets judged

A **verdict** is the recorded judgment of one *required* verification binding on one obligation. An **obligation** is a `REQ`, `CONSTRAINT`, `INVARIANT`, or `INTERFACE` block — the blocks that carry binding force or declare a verifiable boundary.

- A `QUESTION` is **never** judged.
- A `TRACE` is the **input** to judgment.
- A `VERDICT` **is** the recorded judgment, and it reuses the judged obligation's surface id.

The verdict model is the confidence backbone: it is the only place that answers "did this actually get done?", and it is the gate every change must pass before promotion.

---

## 2. The seven-value verdict model (4 core + 3 lifecycle)

The verdict vocabulary is **exactly seven values**, in two disjoint roles. A verdict carries **exactly one CORE value** and **zero or more LIFECYCLE decorators**: 4 CORE values are the base, and 3 LIFECYCLE decorators extend them, never replace them.

### 2.1 The four CORE run results (mutually exclusive)

Exactly one core value MUST be assigned to every required binding. On a single run, a single bound proof lands in exactly one.

| CORE value | Meaning | Precise condition |
| --- | --- | --- |
| `PASS` | A bound proof ran and succeeded. | A proof was bound via `VERIFY BY`, executed, and its observed result satisfies the obligation. |
| `FAIL` | A bound proof ran and failed. | A bound proof executed and its observed result contradicts the obligation. |
| `BLOCKED` | A bound proof could not run. | A prerequisite, tool, adapter, environment, or fixture was missing. Truth is *unknown*, not false. |
| `UNVERIFIED` | No acceptable proof, or none executed. | No acceptable proof was bound, or a binding exists but no run was attempted. |

`BLOCKED` and `UNVERIFIED` MUST NOT be conflated — they route differently (`BLOCKED` is an environment fix; `UNVERIFIED` is a binding/execution gap). A reviewer who cannot tell whether a proof *ran and was prevented* versus *was never attempted* MUST record `UNVERIFIED`, the weaker and more honest claim.

### 2.2 The three LIFECYCLE decorators

A lifecycle decorator annotates a core value with a status arising *after* or *around* the run. They are governance facts, not run results.

| LIFECYCLE value | Decorates | Meaning | Mandatory fields |
| --- | --- | --- | --- |
| `WAIVED` | `FAIL` or `UNVERIFIED` | A failing/unverified obligation is explicitly accepted as an exception. | authority, reason, expiry |
| `STALE` | a prior `PASS` only | A previously-passing proof's evidence no longer matches the current source/surface hashes (drift). | prior-verdict ref, changed-surface |
| `CONTRADICTED` | any core value | Two proofs disagree, or a `TRACE`/code disagrees with the obligation. | two conflicting evidence refs |

- `WAIVED` MUST decorate only `FAIL` or `UNVERIFIED` — there is no reason to waive a `PASS`.
- `STALE` MUST decorate only a prior `PASS` — a `FAIL`/`BLOCKED`/`UNVERIFIED` was never trusted, so it cannot go stale.
- `CONTRADICTED` MAY decorate any core value, because contradiction is a relationship between *two* evidence sources regardless of either's individual result.

---

## 3. The VERDICT line

A `VERDICT` block records one judgment: a **verdict line** followed by `REASON` and `EVIDENCE` clauses.

```ebnf
verdict_line = "VERDICT", ws, obligation_id, ":", ws, core_value,
               [ ws, lifecycle_decorator ];
core_value   = "PASS" | "FAIL" | "BLOCKED" | "UNVERIFIED";
lifecycle    = "WAIVED" | "STALE" | "CONTRADICTED";
```

The line is `VERDICT <id>: <CORE>` optionally followed by one parenthetical `(<lifecycle> by <authority>: <reason>)`. The `<id>` reuses the obligation's surface id (`AC-001`, `C-001`, `I-001`, `IF-001`).

```sol
VERDICT AC-001: PASS
REASON The client clears the session store and redirects to `/login` when the refresh-token expiry is simulated.
EVIDENCE test:cmdTest:auth-refresh-expired-token#it_clears_session — exit 0, 1 passed
```

```sol
VERDICT AC-014: FAIL (WAIVED by spec-owner@example: known flaky upstream sandbox; expiry 2026-06-30)
REASON The payment sandbox returns 502 intermittently; the obligation is unmet but accepted for this release window.
EVIDENCE test:cmdTest:payment-timeout#retryable_attempt — exit 1, 1 failed
```

### 3.1 Lint enforcement of well-formedness (`SOL-V` layer)

Verdict well-formedness is the `SOL-V` (VERIFICATION) lint layer's job. A conformant linter MUST raise:

| Code | Severity | Condition |
| --- | --- | --- |
| `SOL-V005` | BLOCKING | Core value not in `PASS`/`FAIL`/`BLOCKED`/`UNVERIFIED`, OR a lifecycle decorator missing its mandatory fields. |
| `SOL-V007` | BLOCKING | `WAIVED` decorates a `PASS`/`BLOCKED`, OR `STALE` decorates anything other than a prior `PASS`. |
| `SOL-V008` | BLOCKING | A required obligation has no `VERDICT` at the merge gate. |

The mandatory fields are what make a decorator auditable: `WAIVED` needs authority + reason + **expiry** (without expiry it is a zombie waiver); `STALE` needs prior-verdict ref + changed-surface (without which it cannot be reconciled); `CONTRADICTED` needs **two** conflicting evidence refs (without which it cannot be tie-broken).

---

## 4. The merge gate

The **merge gate** is the single normative predicate deciding whether a change set may be promoted, evaluated over every **required** obligation (`REQ`/`CONSTRAINT`/`INVARIANT`/`INTERFACE` in scope) and each of its required `VERIFY BY` bindings.

> **Merge gate (normative).** A change set MAY be promoted **if and only if**, for **every required `VERIFY BY` binding** of every required obligation, the binding's latest verdict is `PASS` or `WAIVED`, **and none** is `STALE`, `CONTRADICTED`, `FAIL`, `BLOCKED`, or `UNVERIFIED`.

The node-level `status` is the **aggregate** over an obligation's bindings: a blocking value if any binding is blocking, else `PASS`. "Latest" is the verdict from the most recent recorded run for that binding.

| Latest verdict | Disposition |
| --- | --- |
| `PASS` (no lifecycle) | Passes. |
| `WAIVED` (on `FAIL`/`UNVERIFIED`, fields valid, not expired) | Passes. |
| `FAIL` | Blocks — fix code or amend the obligation. |
| `BLOCKED` | Blocks — fix the environment/adapter, then re-run. |
| `UNVERIFIED` | Blocks — bind a proof and run it, or `WAIVE`. |
| `PASS (STALE)` | Blocks — forces a 3-way reconcile (handled in the drift pass). |
| any `(CONTRADICTED)` | Blocks — routes to review with the stronger oracle authoritative. |

The gate is **enforced by a deterministic check outside the model** when one exists (CI, a PreToolUse hook, a merge-blocking status) and is **manual today**. A `WAIVED` verdict passes the gate **only while its waiver is live**; a waiver auto-expires on the next source-hash change, reverting to its underlying `FAIL`/`UNVERIFIED`.

### 4.1 `review.md` is the verdict container (there is no `verdict.md`)

A `VERDICT` is a SOL language block, not a file. The kernel ships **no** `verdict.md` template. Verdicts live in the **`review.md`** artifact, which when filled *is* the verdict record. A conformant `review.md` contains at minimum: claimed coverage, per-obligation `VERDICT` blocks (one per required binding), an obligation-verdict matrix, constraint/invariant/interface verdicts, an unauthorized-change list, a final change-set-level merge-gate verdict, and the promotion queue. A repo recording verdicts in a standalone `verdict.md` is **non-conformant**.

---

## 5. The proof taxonomy

A verdict is only as trustworthy as the proof behind it. The governing invariant is **CODE IS REALITY**: a proof can *falsify* an obligation but may never silently *amend* its intent — and **schema-valid output is not a proof** (shape is not truth).

### 5.1 The nine proof types (closed set)

`VERIFY BY` binds an obligation to exactly one of **nine** proof types. The set is **closed**: a linter MUST reject any type outside it as `SOL-V009` (unknown-proof-type).

| Proof type | One-line definition |
| --- | --- |
| `static` | A non-executing analysis of source: type-check, lint, dependency-boundary check, schema validation of source. |
| `test` | An executable test that drives the system and asserts an observable outcome. |
| `contract` | A verification that a declared boundary (`INTERFACE`) honours its `RETURNS`/`ACCEPTS`/`ERRORS` shape — a consumer/provider contract test, pact, or boundary schema check. |
| `property` | A generative/property-based check asserting a universally-quantified property over many generated inputs. |
| `model` | Model-checking OR an economical proof of a property — **not** a full theorem per obligation. |
| `perf` | A measured performance/throughput/latency assertion against a threshold. |
| `security` | A security-specific oracle: SAST/DAST, secret scan, authz/authn test, dependency-vuln gate. |
| `manual` | A recorded human judgment — the **honest escape hatch** when no executable oracle exists. |
| `monitor` | A runtime/production observation (logs, metrics, alerts, canary). Runtime evidence maps here. |

Two normative notes:

- `unit`/`integration`/`e2e` are **scope qualifiers under `test`**, not separate types — written `test:unit:`, `test:integration:`, `test:e2e:`. As a top-level type they are `SOL-V009`.
- There is **no `runtime` type**; any "verified in production" claim binds as `monitor`.

### 5.2 The `VERIFY BY` binding syntax

The surface clause is `VERIFY BY` (two words, uppercase; `VERIFY_BY` is surface-illegal) followed by a typed reference:

```ebnf
typed_ref  = proof_type, [ ":", test_scope ], ":", adapter, ":", artifact, [ "#", selector ];
test_scope = "unit" | "integration" | "e2e";   (* only legal when proof_type = "test" *)
```

- `<type>` is the closed, lint-typed, IR-typed dimension.
- `<adapter>` is a **project free-string** that resolves to a command slot in `AGENTS.md > Commands`.
- `<artifact>` is a project free-string (file, test id, suite name, contract file).
- `<selector>` (optional, after `#`) narrows to a single case, scenario, or property.

```sol
REQ AC-001:
WHEN the refresh token is expired
THE client MUST clear the local session
VERIFY BY test:unit:cmdTest:auth-refresh-expired-token#clears_session
```

```sol
INTERFACE IF-001:
`refreshSession` RETURNS `Session | AuthExpired`
OWNED BY auth-client
VERIFY BY contract:cmdContract:refresh-session.pact#refreshSession
```

The IR field is `verify_by[]`, normalized to `{type, adapter, ref, selector, gate}`. A **bare** `VERIFY BY <ref>` with no `type:` segment is structurally valid but raises an advisory untyped-binding smell; the typed form is REQUIRED wherever a type-driven rule fires (`INTERFACE` → `contract`, `INVARIANT` preference, a `CONTRADICTED` tie-break, a default-suite check). `improve`/`NORMALIZE` upgrades bare refs to typed bindings.

### 5.3 Two-layer resolution: obligation binding + project adapter

`VERIFY BY` keeps the obligation portable while each project names its own commands:

1. **Obligation layer (SOL, in `*.swarm.md`):** the `<type>:<adapter>:<artifact>` clause declares *what kind of proof* and *which logical command + artifact* prove it. The type is closed and analyzable; adapter and artifact are free strings.
2. **Project layer (`AGENTS.md > Commands`):** the `<adapter>` resolves through the Commands table, whose `cmd*` placeholder slots **are the adapters**.

Default proof-type → `cmd*` slot mapping:

| Proof type | Default `cmd*` slot(s) |
| --- | --- |
| `static` | `cmdLint`, `cmdTypecheck`, `cmdValidate` |
| `test` (any scope) | `cmdTest` |
| `contract` | integration-boundary command (e.g. `cmdContract`) |
| `property` | `cmdTest` (property runner) or `cmdProperty` |
| `model` | `cmdModel`, or `cmdTest` for an economical proof |
| `perf` | `cmdBenchmark` |
| `security` | `cmdSecurity` / `cmdScan` |
| `manual` | no command — a recorded human review |
| `monitor` | `cmdMonitor` / dashboard ref — no merge-time execution |

Keeping the *type* in the obligation and the *command* in `AGENTS.md` means the same `spec.swarm.md` ports across repos; only the Commands table changes. A binding whose adapter has no matching Commands row is `SOL-V002` (proof-not-executable), which surfaces as `BLOCKED` at run time — never `PASS`.

### 5.4 Type-selection rules per block type

| Block type | Rule | Lint on violation |
| --- | --- | --- |
| `REQ` | Any of the nine types; `test` typical. | `SOL-V001` if no `VERIFY BY` at all. |
| `CONSTRAINT` | Any type; `static`/`test` typical. | `SOL-V001` if no `VERIFY BY` and no explicit `manual`. |
| `INVARIANT` | **Prefers `property` \| `model` \| `static`.** A test-only binding is a `SOL-V003` warning (ADVISORY by default; BLOCKING in strict mode). | `SOL-V003`. |
| `INTERFACE` | **Requires a `contract` proof.** | `SOL-V006`. |

An `INVARIANT` asserts a universal ("for all states, P holds") that a single example-based `test` cannot establish; an `INTERFACE` is a boundary contract whose proof must exercise `RETURNS`/`ACCEPTS`/`ERRORS`.

`model` means model-checking OR an economical proof — bounded model checking, an SMT-discharged property, an exhaustive small-scope check, or any economical argument an oracle can replay. It MUST NOT be read as a mandate to discharge a full mechanized theorem per obligation: end-to-end per-obligation proof is unreliable at single trial (4.9% Lean end-to-end proof success) and verified-code synthesis is strongly language-specific — Dafny 82% (68%→96% over a year) but Verus 44% and Lean 27%. When even `model` is infeasible, `manual` is the honest type.

### 5.5 The proof-strength order

When two proofs disagree (`CONTRADICTED`), the tie-break uses a fixed preorder over proof types:

```text
model  >  property | contract  >  test  >  static  >  manual | monitor
```

| Rank | Types | Why |
| --- | --- | --- |
| 1 (strongest) | `model` | Establishes a universal property, not an example. |
| 2 | `property`, `contract` | Generative coverage / boundary-shape conformance. |
| 3 | `test` | Example-based executable oracle. |
| 4 | `static` | Source analysis without execution. |
| 5 (weakest) | `manual`, `monitor` | Human judgment / lagging observational signal. |

The stronger proof is **authoritative pending reconciliation** at the merge gate. This places executable oracles above an LLM-judge `manual` verdict.

### 5.6 One VERDICT per required binding

Each required `VERIFY BY` binding produces **exactly one** `VERDICT`. If an obligation declares three required bindings, the gate expects three verdicts and *all* must be `PASS`/`WAIVED`. A missing verdict for a required binding is `SOL-V008` and counts as `UNVERIFIED` at the gate.

### 5.7 Per-task-kind default suites

Each task kind (the `task_kind` enum carried on a task frame) has a **default suite**: a set of `(proof-type @ phase)` recommendations for which proofs SHOULD be bound and at which phase they run. A suite says *"a task of this shape usually needs at least these proofs"*. The suites are **recommendations, not a closed law** — an author MAY override per obligation, and a binding-completeness check (the `SOL-V` layer) verifies that an obligation's bound proofs cover its task kind's default suite, or that any omission is explicitly justified.

The full closed set is **17 `task_kind` values**; this file renders the fixed subset `{feature, fix, refactor, migration, performance, spec-writing, review}` (the seven whose verification shape is most representative):

| `task_kind` | Default suite `(proof-type @ phase)` |
| --- | --- |
| `feature` | `test @ VERIFY`, `static @ VERIFY`; `contract @ VERIFY` if any `INTERFACE` touched |
| `fix` | `test @ VERIFY` (a regression test that reproduces the defect), `static @ VERIFY` |
| `refactor` | `test @ VERIFY` (behaviour-preservation), `property\|contract @ VERIFY` for invariants/boundaries |
| `migration` | `test @ VERIFY`, `static @ VERIFY`, `contract @ VERIFY` (boundary conformance) |
| `performance` | `perf @ VERIFY`, `test @ VERIFY`, `static @ VERIFY` |
| `spec-writing` | `static @ NORMALIZE` (lint/APS); no executable suite (no code yet) |
| `review` | `manual @ REVIEW` over the recorded evidence; re-run of bound `cmd*` proofs |

The phase tag (`@ VERIFY`, `@ NORMALIZE`, `@ REVIEW`, `@ LOWER`) names the pass at which the proof is expected to run: source-only task kinds bind their `static` proof at `NORMALIZE` because there is no code to execute, while code-changing kinds bind their executable proofs at `VERIFY`. A `task_kind` with no executable suite still has an obligation — its `static` lint/APS pass — and a `PASS` there is a genuine verdict, not an exemption from judgment.

### 5.8 What is NOT a proof

These MUST be rejected and MUST NOT yield `PASS`:

- **Schema-valid output is not a proof.** Well-formed JSON / a structured-output call validating against its schema says nothing about whether the *value* is correct. Shape is not truth. Such a binding is `UNVERIFIED`.
- **"Tests passed" without output is invalid.** A `PASS` whose `EVIDENCE` is the bare phrase "tests passed" (no command, exit code, run output, or selector resolution) is `UNVERIFIED`.
- **A `manual` verdict without recorded reasoning** is `UNVERIFIED` — `manual` must carry a `REASON` and an `EVIDENCE` ref to the recorded judgment.

---

## 6. Oracle adequacy

A `PASS` is only as trustworthy as the **oracle** that produced it — the decision procedure that says whether observed behaviour satisfies the obligation. A proof can pass against a *weak* oracle and still be wrong. This is not a corner case: on SWE-bench Verified, 7.8% of patches that pass the official developer-written suite are in fact incorrect, and the bundled tests inflate reported resolution rates by ~6.2 absolute percentage points; an independent audit found 345 patches mislabeled as passing, affecting 40.9% of SWE-bench Lite and 24.4% of SWE-bench Verified leaderboard entries. The root issue is the **test-oracle problem** — a single concrete example cannot stand in for a universal predicate, and metamorphic/property-based pseudo-oracles are the principled response.

So Swarm treats "the proof passed" as **necessary but not sufficient**: a proof MUST also record *what it exercised* relative to the obligation, and stronger obligations demand stronger oracles. This is a **contract, not shipped tooling**; the `SOL-V011` check is manual-today.

### 6.1 A proof MUST record what it exercised (the adequacy record)

A `PASS` MUST carry an **adequacy record** — `oracle_adequacy`, one optional object on the trace-provenance schema — describing what the oracle exercised relative to the obligation's predicate, not merely that the bound `cmd*` exited zero.

| Field | Meaning |
| --- | --- |
| `predicate_form` | `existential` (an example suffices) \| `universal` (a for-all — an example does not). |
| `exercised` | What the oracle ranged over: `concrete-examples` \| `generated-inputs` \| `boundary-shape` \| `state-space` \| `observation`. |
| `evidence_path[]` | The surfaces the oracle actually executed/analysed — the *derived* exercised subset of `per_surface_hash[]` (its entries with `exercised: true`), not a separate stored field. The proof's footprint on the code. |
| `adequacy_evidence[]` | Zero or more `{kind, ref[, value]}` records, `kind` ∈ `mutation` \| `metamorphic` \| `property` \| `coverage`, substantiating that the oracle is adequate for the predicate. |

A missing `oracle_adequacy` object is permitted for `existential` predicates proven by `test`; it is a `SOL-V011` finding (oracle-adequacy-unrecorded) wherever a `RISK high|critical` obligation requires it.

### 6.2 Stronger obligations demand stronger oracles

For an obligation carrying `RISK high` or `RISK critical`, a single concrete `test` is an **inadequate oracle** — one example cannot establish a high-consequence or universally-quantified claim.

| Obligation `RISK` | Adequate bound oracle |
| --- | --- |
| `low` \| `medium` | Any type per the per-block type-selection rules; `test` alone is acceptable. |
| `high` \| `critical` | `property` \| `model`, OR a `test`/`contract` whose `oracle_adequacy.adequacy_evidence[]` carries `mutation` or `metamorphic` evidence. A bare concrete `test` with no adequacy evidence is `SOL-V011` (ADVISORY by default; BLOCKING in strict mode). |

This is the `INVARIANT` type-preference generalised to consequence: an `INVARIANT` is flagged because a universal predicate outruns an example; a `RISK high|critical` obligation is flagged because the *cost of a missed defect* outruns an example. The fix in both cases is an oracle that ranges over more than one input, or explicit evidence the example-based oracle is hard to fool.

### 6.3 Adequacy is a prior that strength can be overridden by

The proof-strength order is a **prior**, not a verdict: it ranks proof *types* by how much an oracle of that type typically establishes. The adequacy record refines that prior with evidence about *this* oracle. In a `CONTRADICTED` tie-break:

- Strength sets the **default** authoritative side.
- Recorded `adequacy_evidence` **MAY override** the default *within the recorded contradiction*: a `test` carrying strong mutation/metamorphic evidence and an `evidence_path` covering the disputed surface MAY outrank a nominally-stronger proof that exercised neither — but the reviewer MUST record the override and its reason (the two `EVIDENCE` refs still apply). An override is a recorded judgment, never a silent re-rank, and never closes the contradiction on its own.

Honouring adequacy over rank is what stops the order from becoming astrology-by-tier: once a proof states what it exercised, that specific evidence is a better guide than the type's average.

### 6.4 Adequacy binds to staleness via the evidence path

A surface participates in a proof's freshness only if it lies on the proof's `evidence_path`. A write surface the obligation declares in `WRITES` but the oracle never exercised does not, on its own, falsify *that proof's* `PASS`. Conversely, a modified surface that **is** on the `evidence_path` forces `STALE`. (The full drift/staleness mechanism — the trace-provenance schema, the four `STALE` conditions, and the 3-way reconcile — lives in the drift pass; this page only fixes the adequacy ↔ evidence-path link.) An empty or unrecorded `evidence_path` on a `RISK high|critical` obligation is itself a `SOL-V011` finding: an oracle that cannot say what it exercised cannot be shown adequate.

## The soft/hard control boundary

This honesty constraint governs what a verdict is *allowed to mean*. Everything Swarm ships is markdown, and markdown cannot stop an agent from doing anything. So Swarm MUST be precise about what is *guidance* and what is *enforcement*, and MUST NOT dress up the former as the latter.

> **Soft control.** Swarm prose, SOL, APS, skills/pass guides, heuristic profiles, and `AGENTS.md` are **SOFT control**: they are context and guidance for a model. They influence behaviour; they do not constrain it. They **MUST NEVER** be presented as enforcement.

> **Hard control.** Anything that must hold **regardless of the model** — a `CONSTRAINT`, an `INVARIANT`, a stop-rule, secret redaction, a write-surface gate, the proof-required merge gate — MUST be specified as a **deterministic check OUTSIDE the model**: a PreToolUse hook, a CI gate, a permission deny-rule, or a schema validator.

> **No runtime today.** Swarm is markdown-only. The hard lane is therefore **aspirational/manual today**. This page MUST NOT claim any deterministic check *exists* or *runs*. Every enforcement statement is "the deterministic home a future harness MUST provide," never "Swarm enforces."

Three corollaries follow directly, each normative:

- **Schema-valid output is not verification.** That a model emitted JSON matching a schema constrains *shape*, not *truth*. Schema validation MAY be a gate *input*; it MUST NOT be presented as proof an obligation is met.
- **Every completion claim maps to independent verification.** No obligation is `PASS` on the model's say-so; it is `PASS` only against an independent deterministic or evidentiary oracle — the merge gate over the proof taxonomy.
- **A SOFT-control artifact MUST NOT define hard semantics.** No skill, persona/profile, or `AGENTS.md` section may define modality, authority order, or verification semantics — those live in SOL and the typed IR.

The rationale is empirical: model adherence is probabilistic (prompt-format sensitivity, multi-turn reliability decay, lost-in-the-middle / context-rot), so a model is an unsound enforcement substrate. Only an external deterministic check can guarantee a property holds. Honesty about this boundary is what lets a Swarm verdict be trusted: the markdown layer makes an omission *conspicuous*; it cannot make a property *hold*.

## The enforcement-lane artifact

Because the hard lane is manual today, Swarm makes the gap **visible and accountable** rather than letting it hide. The **enforcement lane** is a first-class, currently-manual artifact: a markdown table that maps each hard-control obligation to its **eventual deterministic home**. It is the explicit ledger of "this is soft today; here is where it becomes hard," and it MUST be maintained as a table (no runtime).

Each row maps one `CONSTRAINT` / `INVARIANT` / stop-rule / secret-redaction rule to its deterministic home and current status:

```text
| Obligation / rule          | Kind        | Deterministic home (eventual)    | Status today  |
| -------------------------- | ----------- | -------------------------------- | ------------- |
| C-001 (no server/* import) | CONSTRAINT  | CI: cmdLint dependency-boundary  | manual review |
| I-001 (one token family)   | INVARIANT   | CI: property test in cmdTest     | manual review |
| stop-rule: no force-push   | stop-rule   | PreToolUse hook (git deny)       | aspirational  |
| secret redaction           | redaction   | PreToolUse hook + CI secret scan | aspirational  |
```

| Column | Meaning |
| --- | --- |
| Obligation / rule | The id or name of the hard-control item. |
| Kind | `CONSTRAINT` \| `INVARIANT` \| `stop-rule` \| `redaction`. |
| Deterministic home (eventual) | The PreToolUse hook / CI gate / permission deny-rule / schema validator that WILL enforce it when a harness exists. |
| Status today | `manual review`, `aspirational`, or — only when a harness genuinely runs it — `enforced by <mechanism>`. |

The four deterministic-home categories are exactly: **PreToolUse hook**, **CI gate**, **permission deny-rule**, **schema validator**. The lane MUST NOT mark any row `enforced` unless a deterministic check outside the model genuinely runs it; until then every hard-control obligation is honestly `manual review` or `aspirational`. The lane is the operational form of the soft/hard control boundary: the merge gate, the `SOL-V` lint diagnostics, the `RISK high|critical` oracle thresholds, and secret redaction are all hard-control obligations whose rows sit in this lane reading `manual review` or `aspirational` today.

---

## Related

- `./lint.md` — the `SOL-V` (VERIFICATION) lint layer that raises the well-formedness diagnostics (`SOL-V001`/`V002`/`V003`/`V005`/`V006`/`V007`/`V008`/`V009`/`V011`) referenced throughout this pass.
- `./improve.md` — the `improve`/`NORMALIZE` pass that upgrades bare `VERIFY BY` refs to typed bindings.
- `./implement.md` — the authoring side these per-task-kind verification contracts gate.
- `../templates/review.md` — the `review.md` artifact that is the verdict container: per-obligation `VERDICT` blocks, the obligation-verdict matrix, and the change-set-level merge-gate verdict.
- `../templates/trace.md` — the `TRACE` artifact whose trace-provenance schema carries `oracle_adequacy`, `per_surface_hash[]`, and the `evidence_path` that binds adequacy to staleness.
- `../templates/spec.swarm.md` — where `REQ`/`CONSTRAINT`/`INVARIANT`/`INTERFACE` obligations and their `VERIFY BY` bindings are authored.

<!-- Derived per the ADR-0044 derivation transform.
     TABLE-1 subset (per-task-kind default suites): {feature, fix, refactor, migration, performance, spec-writing, review} of the 17 canonical task_kind rows.
     STRUCTURE-1 pruned section (carried by another shipped payload file, not by this pass): the per-task-kind verification-contract rationale lives in `./implement.md` ("Task-kind contracts").
     STRUCTURE-1 inlined (no other payload file carries them, so they are rendered here for offline resolution): the soft/hard control boundary and the enforcement-lane artifact. -->

