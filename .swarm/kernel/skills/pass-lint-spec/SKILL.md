---
type: pass-guide
name: pass-lint-spec
pass: lint
profile: skeptic
description: >-
  Run the `lint` pass on a `spec.swarm.md`: detect S/P/M defects, emit the
  six-field diagnostic record, decide blocking status and CLARIFY gate —
  without changing a character of the spec. ALWAYS apply when a task names the
  `lint` pass, a spec is checked before a downstream pass, or a pre-`lower`
  gate decision is asked. Do not rewrite, reorder, or "tidy" the spec, invent
  or relayer codes, or claim a tool enforces the result. Skip when repairing
  named defects (`improve`), building the IR (`lower`), partitioning into
  packets (`decompose`), binding proofs (`verify`), or authoring a spec
  (`author`).
---

# Pass guide: lint

How to run the `lint` pass well. It is **SOFT control**: procedure, not meaning. It MUST NOT define modality, authority order, verification semantics, lint-code meaning, or any other load-bearing fact — those are fixed by SOL and the IR; this guide only *applies* them. Every code, severity, gate, and record shape below has a fixed meaning this guide applies and never redefines:

- The lint taxonomy, the `SOL-<LAYER><NNN>` namespace, the six-field diagnostic record shape, BLOCKING/ADVISORY, and the principal code lists are fixed by [`../../language/errors.md`](../../language/errors.md) (and [`../../language/APS.md`](../../language/APS.md) for the APS prose families behind the `P` layer).
- The `lint` pass contract — non-mutating, `PARSE`+`NORMALIZE`, Skeptic carrier, no runtime — is fixed by [`../../passes/lint.md`](../../passes/lint.md).
- The CLARIFY gate is fixed by [`../../passes/lint.md`](../../passes/lint.md) (and the blocking-question rule, R-BLOCKING-Q, also lives there).

The per-code defect text, the code→`improve`-op map, the worked diagnostic record, and the waiver fields live one hop away in `references/code-catalogue.md` — open it for lookup; do not re-derive a code's meaning here.

## Purpose

Read one `spec.swarm.md` and emit a **lint report** — diagnostic records plus an overall blocking status — *without changing the spec*. `lint` catches defects before any work is committed ([`../../passes/lint.md`](../../passes/lint.md)). You only *detect and name* defects; repair is the `improve` pass ([`../../passes/improve.md`](../../passes/improve.md)), triggered by the codes you emit. Naming the repair in `suggest` is detection; *applying* it is not.

Run it with the **Skeptic** stance (the `skeptic` profile): assume each obligation is under-specified until its actor, modality, object, and proof are present and observable; never wave a clause through because it "reads fine." *Why:* a defect that changes what gets built is cheapest to catch here, before generation; under-specification is the most severe defect class, and a clause that reads fine to a generous reader is exactly the one that hands a coder a guess.

## Consumes

- One `spec.swarm.md` (the surface artifact; prose + SOL blocks).
- The language reference for codes and record shape — for lookup, never to redefine.
- Optionally, a project `swarm.config.json`/`.yaml` (or the `lint:` section of `.swarm/config.yaml`) carrying severity overrides and waivers (see [`../../language/errors.md`](../../language/errors.md)), and `memory/glossary.md` for term resolution (`SOL-P006`/`SOL-P057`).

## Produces

- A **lint report**: `{ code, severity, layer, span, message, suggest }[]` plus an overall **blocking status** (blocks if any unwaived diagnostic carries `severity: BLOCKING`). Record shape is fixed by [`../../language/errors.md`](../../language/errors.md).
- No edit to the spec. `lint` is **non-mutating** (see [`../../passes/lint.md`](../../passes/lint.md)): change a character and you left the `lint` pass.

## Procedure

Run these steps in order. Each rule carries its WHY so you can extend it to a defect the catalogue did not anticipate. Steps 1–3 detect (produce the report); step 4 decides blocking status; step 5 decides the CLARIFY gate as a separate predicate. Throughout, hold the binding-clause vs commentary boundary ([`../../language/APS.md`](../../language/APS.md)): an APS prose rule applies with full force inside a typed obligation block (`REQ`/`CONSTRAINT`/`INVARIANT`), as advisory only in commentary.

### 1. Scan the `S` layer (well-formedness, `PARSE`)

For each SOL block, decide whether it parses as well-formed: a precondition with no actor clause or no modal consequence (`SOL-S001`); an actor clause with no modal verb (`SOL-S003`); an id prefix not matching the block type (`SOL-S005`, e.g. `REQ C-001:`); a `SHOULD`/`SHOULD NOT` with no `BECAUSE`/`EXCEPT` (`SOL-S006`); a missing required top-level section or sections out of order (`SOL-S012`). Look up exact definitions in [`../../language/errors.md`](../../language/errors.md) / `references/code-catalogue.md`; do not re-derive. *Why:* `S` is the `PARSE` half — a block that does not parse cannot be reasoned about by any later layer, so well-formedness is checked first.

### 2. Scan the `P` layer (controlled prose, `NORMALIZE`)

For every binding clause, walk the APS rule families ([`../../language/APS.md`](../../language/APS.md)) and emit the prose code each resolves to. The blocking set is `SOL-P001`–`SOL-P008` (dangling condition, missing actor, missing/informal modality, bundled obligation, vague/high-risk word with no same-line observable criterion, undefined term, bare `MUST NOT` with no paired affirmative, uncaptured ambiguity not lifted to a `QUESTION`). The advisory set is `SOL-P050`–`SOL-P058` — emit as `warning`. Apply the binding-clause vs commentary reclassification ([`../../language/APS.md`](../../language/APS.md)): `SOL-P056` (comparative without baseline) is BLOCKING inside an obligation block, ADVISORY in commentary; high-risk-word rules are BLOCKING only inside binding clauses. *Why:* the same words carry different stakes by position — "fast" in a `REQ` is an untestable obligation; "fast" in commentary is a stylistic note. Classify by the binding-clause boundary ([`../../language/APS.md`](../../language/APS.md)), never by feel.

### 3. Scan the `M` layer (semantic, `NORMALIZE`)

Across obligations, check actor/object incompleteness — a modal present but no resolvable actor *and* object (`SOL-M001`) — and contradiction — two obligations sharing a contradiction key with opposed modalities, **exact-key match only in v0.1** (`SOL-M002`, [`../../language/errors.md`](../../language/errors.md)). The `M` layer is *repaired* by `improve`, but `lint` *surfaces* it; layers and passes are 1:1 by domain, not by who reports ([`../../language/errors.md`](../../language/errors.md)). The `V`/`O` codes (`SOL-V001` missing proof; `SOL-O001`/`SOL-O005` orchestration; `SOL-O003` blocking question reaching `lower`) are owned by their downstream passes/gates — record them only when already determinable from the surface spec; else leave them to `verify`/`decompose`. *Why:* surfacing an `M` defect here is free and pre-generation; inventing a `V`/`O` finding the surface spec cannot determine is a guess dressed as a diagnostic.

### 4. Emit each diagnostic and decide blocking status

For every defect, emit the full record `{ code, severity, layer, span, message, suggest }` ([`../../language/errors.md`](../../language/errors.md)): `severity` is `BLOCKING` or `ADVISORY`; `layer` is the code's letter; `span` is at minimum `{ file, block }`; `message` is a one-line defect statement; `suggest` names the repair — the `improve` op the code maps to (`SOL-P004`→`ATOMIZE`, `SOL-P005`→`CONCRETIZE`/`QUANTIFY`, `SOL-P008`→`CLARIFY`, `SOL-M002`→`DECONFLICT`, `SOL-V001`→`BIND`; full map in [`../../passes/improve.md`](../../passes/improve.md) and `references/code-catalogue.md`) — or `null` if none. Apply any project severity overrides/waivers from [`../../language/errors.md`](../../language/errors.md). The **overall blocking status** is BLOCKING if any unwaived `BLOCKING` diagnostic remains; such a diagnostic MUST be resolved before the artifact advances past the gate its layer is checked at (S/P/M at the lint→`lower` gates, [`../../passes/lint.md`](../../passes/lint.md)). *Why:* a record missing any field, or a `suggest` that paraphrases rather than names an `improve` op, cannot route to `improve` — the report's value is feeding a closed, machine-routable repair set.

### 5. Decide the CLARIFY gate (the pre-`lower` checkpoint)

This is a *predicate*, not a new diagnostic — it writes no artifact and introduces no new code ([`../../passes/lint.md`](../../passes/lint.md)). Decide, per obligation, whether the spec is **lowerable**. An in-scope obligation is **not lowerable** while any of these holds for it:

- an unresolved `[blocking]` `QUESTION` `AFFECTS` it (answering it, or downgrading to `[non-blocking]` with rationale, clears it; unresolved, it surfaces as `SOL-O003`);
- a blocking `SOL-M002` contradiction names it;
- an unresolved `SOL-P008` uncaptured ambiguity attaches to it.

A tripped gate surfaces as the *existing* code that tripped it (`SOL-O003`/`SOL-M002`/`SOL-P008`), already in your report from steps 2–3 — the gate aggregates these three into one checkpoint; it is **not a fourth code**. Do not conflate it with the `CLARIFY` *improve op* ([`../../passes/improve.md`](../../passes/improve.md)): the op *creates* the explicit interpretation or `QUESTION` from one buried `SOL-P008`; the gate *waits on* such questions being discharged ([`../../passes/lint.md`](../../passes/lint.md)). Verify the predicate by hand against the spec/IR; state it as a review-checkable contract and never claim a tool enforces it. *Why:* the planner→coder handoff is the dominant failure surface — lowering past an unresolved ambiguity commits a guess as an obligation, the single most expensive defect to discover downstream.

### Project commands

`lint` needs **no `cmd*` slot** in the common case: it is a non-mutating, review-checkable contract performed by hand today (Invariant 1 — no runtime, parser, or checker is shipped; see [`../../passes/lint.md`](../../passes/lint.md)). If the consuming repo has wired a static-analysis slot (`cmdLint`/`cmdValidate`), you MAY paste its real output as corroboration — but its absence never blocks the pass, and you MUST NOT present any tool as *enforcing* the lint result. If a task asks you to run a project lint command and the relevant slot is undefined in the consuming repo's `AGENTS.md > Commands`, **ask the user** — never guess a command.

## Output contract

- A lint report: an array of `{ code, severity, layer, span, message, suggest }` records (each conforming to the shape fixed by [`../../language/errors.md`](../../language/errors.md)) plus the overall blocking status.
- Codes are unified `SOL-<LAYER><NNN>` only; no legacy aliases, no invented codes, no IR `note` level.
- The spec is unchanged. The report names repairs (in `suggest`) but applies none.
- The CLARIFY-gate result is a per-obligation lowerable / not-lowerable predicate, referencing the existing code(s) that trip it — not a new diagnostic, not a claim of tool enforcement.

## Anti-patterns

Failure modes seen on real lint runs, each with the correction:

- ❌ Editing the spec to fix a defect you found ("it was a one-word fix"). → Emit the diagnostic with a `suggest`; the fix is the `improve` pass ([`../../passes/improve.md`](../../passes/improve.md)). One changed character means you left the `lint` pass ([`../../passes/lint.md`](../../passes/lint.md)).
- ❌ Emitting a legacy or invented code — `APS-*`, flat `SOL101/201/301`, `SOL-L###`, or a brand-new number. → Cite only unified `SOL-<LAYER><NNN>` codes; `APS` is the *name* of the prose standard, not a code prefix ([`../../language/errors.md`](../../language/errors.md)). Legacy forms are retired aliases.
- ❌ Demoting a BLOCKING code with a partial waiver (e.g. `authority` but no `expiry`). → An incomplete waiver does not take effect; the blocker stands. All seven fields are required ([`../../language/errors.md`](../../language/errors.md)) — see `references/code-catalogue.md`.
- ❌ Inventing, renaming, relayering, or silently demoting a code, or changing its `layer`. → Defaults are fixed by the language reference; a `swarm.config` may only promote (strict mode) or demote with a complete waiver. It MUST NOT redefine codes.
- ❌ Emitting an IR `note`-level diagnostic. → `note` has **no surface producer in v0.1** ([`../../language/errors.md`](../../language/errors.md)); a conformant checker MUST NOT emit it.
- ❌ Adding a fourth "CLARIFY" code for a tripped gate. → The gate aggregates `SOL-O003`/`SOL-M002`/`SOL-P008`; it introduces no new diagnostic ([`../../passes/lint.md`](../../passes/lint.md)).
- ❌ Claiming the lint or CLARIFY gate is "enforced by tooling" or "the linter passed." → There is no runtime (Invariant 1); both are review-checkable contracts performed by hand today (see [`../../passes/lint.md`](../../passes/lint.md)). State them as contracts, not tool output.
- ❌ Classifying a position-sensitive code (`SOL-P056`, the high-risk-word rules) by feel. → Classify by the binding-clause vs commentary boundary ([`../../language/APS.md`](../../language/APS.md)); the same word blocks inside an obligation and is advisory in prose.
- ❌ Recording a `V`/`O` finding the surface spec cannot determine. → Those layers are owned by `verify`/`decompose`; surface them only when the spec already determines them, else leave them downstream.

## Self-review

Before closing the pass, confirm — and where a step would otherwise leave no visible trace, write the trace into the report:

- [ ] **Non-mutating.** The `spec.swarm.md` is byte-for-byte unchanged. (A diff is the proof; if you ran a project static-analysis slot, paste its real output — "passed" without output is not proof.)
- [ ] **Codes are unified and real.** Every emitted code is a `SOL-<LAYER><NNN>` from the catalogue in [`../../language/errors.md`](../../language/errors.md); no `APS-*`, no flat `SOL###`, no `SOL-L###`, no invented code, no `note`.
- [ ] **Record shape is complete.** Every diagnostic has all six fields; `suggest` names an `improve` op ([`../../passes/improve.md`](../../passes/improve.md)) or a concrete fix, or is `null`.
- [ ] **Severities follow the spec.** Defaults are as [`../../language/errors.md`](../../language/errors.md) defines; any demotion carries a complete waiver record; any promotion is a recorded strict-mode override.
- [ ] **Binding boundary applied.** Position-sensitive codes (`SOL-P056`, the high-risk-word rules) were classified by the binding-clause vs commentary boundary ([`../../language/APS.md`](../../language/APS.md)), not by feel.
- [ ] **CLARIFY gate decided, not invented.** Reported as a predicate over existing codes, with no fourth diagnostic and no enforced-by-tooling claim.
- [ ] **No `improve` work leaked in.** No clause was rewritten, concretized, atomized, or deconflicted; repairs were *named*, not *done*.

## Bundled resources

- `references/code-catalogue.md` — per-code defect text (S/P/M/V/O blocking + P advisory sets), the code→`improve`-op map, the worked diagnostic record, and the waiver fields. A lookup table restating [`../../language/APS.md`](../../language/APS.md) / [`../../language/errors.md`](../../language/errors.md) for convenience; the language reference is authoritative on any disagreement.
