# Swarm Lint Codes — `SOL-<LAYER><NNN>` Error Reference

This file is the complete v0.1 diagnostic catalogue for Swarm: every lint code, by layer, with its severity, defect, and the closed repair op that resolves it. It also fixes the diagnostic record shape, the SARIF lowering, the severity-override and waiver discipline, and the legacy-code translation table.

Swarm is markdown-only and has no runtime. A *checker* that emits these codes is a **contract** a future `lint-spec` tool builds against — never shipped code in this repo. The codes here are what such a checker must produce and what conformant artifacts are graded against.

---

## 1. The namespace

Every diagnostic code matches one grammar:

```ebnf
lint_code = "SOL-", layer, number;
layer     = "S" | "P" | "M" | "V" | "O";
number    = digit, digit, digit;          (* zero-padded, 3 digits *)
```

One prefix (`SOL-`), exactly **five layers** (S/P/M/V/O), a three-digit number. There is a single code prefix: `SOL-`. `APS-` is **retired as a code prefix** — "APS" survives only as the *name* of the controlled-prose standard (the Agent Prose Semantics rules, see `./APS.md`) and MUST NOT appear in any code; prose violations surface as `SOL-P` codes. Each layer is a 100-block, **append-only with tombstoning**: a retired code keeps its row marked `TOMBSTONED`, carries a `superseded-by` pointer where one exists, and its number is never reissued. The rationale is a single greppable namespace that stays stable across versions — numbers are never recycled, so a code always means one thing.

### The five layers

Each layer maps 1:1 to a compiler phase/pass. A code's letter tells you the phase it belongs to and which gate it blocks at.

| Layer | Letter | Detects | Phase it guards | Gate it blocks at |
|---|---|---|---|---|
| SYNTAX | `S` | Parser-detectable well-formedness of a single block | `PARSE` | lint → lower gate |
| PROSE | `P` | Controlled-prose / requirement-smell, single-obligation-local (the APS layer; subsumes the `SOL-L###` code scheme) | `NORMALIZE` (lint / improve) | lint → lower gate |
| SEMANTIC | `M` | Cross-reference: duplicate id, contradiction, unbound ref | `NORMALIZE` | lint → lower gate |
| VERIFICATION | `V` | Proof-binding: missing / stale / non-observable proof | `VERIFY` | merge gate |
| ORCHESTRATION | `O` | Planning / parallelism: write-conflict, dep cycle, blocking `QUESTION` reaching lowering | `LOWER` (raised by the lower / decompose passes, surfaced by the lint gate) | merge gate |

The passes that raise each layer: S/P/M fire during lint (`../passes/lint.md`) and improve (`../passes/improve.md`), V during verify (`../passes/verify.md`), and O during lower (`../passes/lower.md`) and decompose (`../passes/decompose.md`).

### The diagnostic record

Every emitted diagnostic is the **checker-emit / SARIF-authoring** record:

```json
{
  "code": "SOL-P005",
  "severity": "BLOCKING",
  "layer": "P",
  "span": { "file": "auth.swarm.md", "block": "AC-001", "line": 12, "col": 9 },
  "message": "vague-quality word 'fast' with no same-line observable criterion",
  "suggest": "CONCRETIZE or QUANTIFY: bind a measurable threshold on the same line"
}
```

| Field | Type | Meaning |
|---|---|---|
| `code` | string | A `SOL-<LAYER><NNN>` code from this catalogue. |
| `severity` | enum | `BLOCKING` \| `ADVISORY`. A recorded waiver may demote its IR `level` to `warning`, or to `off` (suppress). |
| `layer` | enum | `S` \| `P` \| `M` \| `V` \| `O` — redundant with the code's letter; carried explicitly for filtering, and MUST equal it. |
| `span` | object | Source location `{ file, block, line, col }`, at minimum `{ file, block }`; `line`/`col` SHOULD be present when available. |
| `message` | string | One-line human-readable defect statement. |
| `suggest` | string \| null | The named repair: a closed improve op (see `../passes/improve.md`) or a concrete fix; `null` if none. MUST name a closed op wherever one applies — never an open-ended rewrite. |

#### SARIF lowering (span → source location, severity → level)

The authoring record above is what a checker emits. The typed IR carries the same diagnostic in a SARIF-shaped `diagnostics[]` array — the `level` severity vocabulary follows the SARIF static-analysis interchange format, so the diagnostics drop into any SARIF-aware viewer. The lowered element is `{ code, level, node, source, message, suggest }`, and the mapping is fixed:

| Authoring field | IR field | Lowering rule |
|---|---|---|
| `severity` | `level` | `BLOCKING → error`; `ADVISORY → warning`. A waiver to `warning` lowers `level` to `warning`; a waiver to `off` **suppresses** the diagnostic — it is omitted from `diagnostics[]` entirely (`off` is not a `level` value). |
| `span` | `source` | `{ file, block, line, col } → source { file, line_start, line_end }` (a source-location span). |
| `span.block` | `node` | The block id resolves to the IR node the diagnostic is attached to. |
| `layer` | — | Derived from the code's layer letter — checkable, not stored. |
| `code` | `code` | Identical at both layers. |

The closed IR `level` enum is `error` / `warning` / `note`. The surface model is strictly binary: every emitted code lowers to `error` or `warning`. The third value, `note`, has **no surface producer in v0.1** — it is reserved for informational annotations a future emitter may attach, and a conformant v0.1 checker MUST NOT produce it. These are the same diagnostic at two layers (authoring vs IR), not two contradictory schemas.

---

## 2. Severity: BLOCKING vs ADVISORY

Severity is **binary and intrinsic**:

- **BLOCKING** iff the defect changes *what gets built* — the obligation is incomplete, non-binding, untestable, ambiguous, contradictory, or unsafe to parallelize. Carries `severity: BLOCKING` (IR `level: error`) and MUST be resolved before the artifact passes its layer's gate; none may remain at promotion unless waived.
- **ADVISORY** iff the defect affects only *how the text reads* — style, length, voice, redundancy. Carries `severity: ADVISORY` (IR `level: warning`) and does not block on its own.

The surface model is strictly binary: every code lowers to `error` or `warning`. The third IR `level` value `note` has **no surface producer in v0.1**.

Two position-sensitive rules are re-classified by the binding-clause vs commentary boundary (a span is *binding* iff it sits inside a `REQ`/`CONSTRAINT`/`INVARIANT` obligation block, *commentary* everywhere else — see `./APS.md`): **`SOL-P056`** (comparative without baseline) is BLOCKING inside an obligation block, ADVISORY in commentary; the high-risk-word rules are BLOCKING only inside binding clauses.

### Severity overrides and the waiver record

Default severities here are the normative defaults. A project may adjust them through one configuration surface — a root `swarm.config.json` / `swarm.config.yaml`, or equivalently the `lint:` section of an adopted project's `.swarm/config.yaml` — validated against the shape below. There are exactly two legal moves:

1. **Promote (strict mode):** raise an ADVISORY code to `error`. Always permitted; no record needed beyond the config entry.
2. **Demote (waiver):** lower a BLOCKING code to `warning` or `off`. Permitted **only** with a recorded waiver. A demotion without a complete waiver record is itself a conformance defect.

A `swarm.config` MUST NOT redefine, rename, invent, or re-layer codes; it MUST NOT change a code's `layer`; and it MUST NOT demote a blocker by any means other than a waiver record.

```json
{
  "$schema": "swarm.config/0.1",
  "language": "SOL/0.1",
  "severity_overrides": {
    "SOL-P052": "error",        // strict: promote advisory -> error
    "SOL-P056": "error"
  },
  "waivers": [
    {
      "code": "SOL-V001",
      "scope": "AC-014",                 // a code applies repo-wide; an obligation id / glob narrows it
      "to": "warning",                   // warning | off
      "authority": "spec-owner:j.costa", // human or spec owner
      "reason": "Upstream metrics adapter not yet wired; manual check tracked in TASK-22.",
      "expiry": "2026-07-01",            // ISO date; auto-expires (see below)
      "recorded_at": "2026-05-31"
    }
  ]
}
```

The **waiver-record fields** are all required: `code`; `scope` (a code applies repo-wide, an obligation id/glob narrows it); `to` (`warning` or `off`); `authority`; `reason`; `expiry` (ISO date); and `recorded_at` (ISO date). `to: warning` lowers the diagnostic's IR `level` to `warning`; `to: off` is **not** an IR `level` — it suppresses the diagnostic, which is omitted entirely from the IR `diagnostics[]` array. A waiver with any required field missing is invalid and the demotion does not take effect.

A waiver **auto-expires** at its `expiry` date *and* on the next change to the waived obligation's source content-hash, whichever comes first — preventing zombie waivers that outlive the text they excused. On expiry the code returns to its default severity. A severity demotion at the lint layer is distinct from a `WAIVED` verdict at the verification layer (see `../passes/verify.md`): the former silences a *diagnostic*, the latter accepts a *failing proof* — both require the same authority + reason + expiry discipline.

The rationale: one config, two legal moves — strict-up freely, blocking-down only on the record — keeps every relaxation of the defaults auditable, time-boxed, and attributable.

---

## 3. The full catalogue

Every v0.1 code, by layer, with `{code, severity, layer, message, resolves-by}`. "Resolves by" names a closed improve op (see `../passes/improve.md`) where one applies, otherwise a direct edit. Block types, modals, clauses, and metadata fields are defined in `./SOL.md`; the high-risk-word rules in `./APS.md`; the nine proof types in `../passes/verify.md`.

### 3.1 Layer S — SYNTAX (fire at `PARSE`; all BLOCKING)

A malformed block cannot be parsed into a node, so every S code is BLOCKING and resolved by a direct **edit** — no improve op applies (improve ops operate only on already-parseable obligations).

| Code | Severity | Layer | Message (short name + defect) | Resolves by |
|---|---|---|---|---|
| `SOL-S001` | BLOCKING | S | dangling-precondition (syntax): a trigger clause (`WHERE`/`WHILE`/`WHEN`/`IF`) present but no `THE <actor> <MODAL> <response>` actor-clause follows. | Edit: add the missing actor-clause. (Prose companion: `SOL-P001`.) |
| `SOL-S002` | BLOCKING | S | unknown-block-or-keyword: header is not one of the 7 block types, or a body line uses an unknown/malformed clause keyword. | Edit: use a valid block type / clause keyword. |
| `SOL-S003` | BLOCKING | S | actor-clause-no-modal: an actor-clause with no modal (`MUST`/`MUST NOT`/`SHOULD`/`SHOULD NOT`/`MAY`). | Edit: insert a valid modal. (Chained `AND THE` modals are permitted; only total absence trips this.) |
| `SOL-S004` | BLOCKING | S | duplicate-block-id: two blocks share the same surface id within one spec (intra-spec). | Edit: renumber. (Cross-spec collisions are `SOL-M001`.) |
| `SOL-S005` | BLOCKING | S | prefix↔type-mismatch: the id prefix does not match the block type (e.g. `REQ C-001:`). | Edit: use the canonical prefix (REQ→`AC-`, CONSTRAINT→`C-`, INVARIANT→`I-`, INTERFACE→`IF-`, QUESTION→`Q-`, TRACE→`T-`). |
| `SOL-S006` | BLOCKING | S | should-without-because: `SHOULD`/`SHOULD NOT` used without an accompanying `BECAUSE` or `EXCEPT` in the same block. | Edit: add a `BECAUSE`/`EXCEPT`, or strengthen to `MUST`/`MUST NOT`. |
| `SOL-S007` | BLOCKING | S | malformed-header: header is missing the mandatory trailing colon, or the id is malformed (spaces, illegal characters). | Edit: write `TYPE PREFIX-NNN:`. |
| `SOL-S008` | BLOCKING | S | non-control-first-line: a trailing metadata clause (`DEPENDS ON`/`WRITES`/…) or free prose appears before the block's control content (leading EARS condition or `THE <actor> <MODAL>` clause). A leading condition clause is control content and does not trip this. | Edit: lead with the condition/actor clause; move metadata to the trailing block. |
| `SOL-S010` | BLOCKING | S | unknown-metadata-field: a trailing metadata field is outside the closed set (`DEPENDS ON`/`TOUCHES`/`WRITES`/`READS`/`AFFECTS`/`RISK`/`DOMAIN`). | Edit: use a valid field or move the text to commentary. |
| `SOL-S011` | BLOCKING | S | missing-obligation-id: a header is present but carries no `*_id` after the block type (type recognized, id absent). | Edit: add a valid `PREFIX-NNN` id after the block type. |
| `SOL-S012` | BLOCKING | S | required-section-missing: a `spec.swarm.md` is missing a required top-level section from its ordered set (e.g. `## Intent`, `## Non-goals`, `## Obligations`), or carries them out of order. Document-level companion of the per-obligation `SOL-O004`. | Edit: add the missing `## ` section heading (or reorder) per the spec layout in `../templates/spec.swarm.md`. |
| `SOL-S013` | BLOCKING | S | untrusted-source-character: an agent-read artifact contains a zero-width, bidirectional-control, other non-printing, or homoglyph-suspect codepoint in obligation/instruction bytes — a hidden-instruction injection vector. | Edit: strip the offending codepoints or re-author in printable characters. |
| `SOL-S014` | BLOCKING | S | missing-required-clause: a block omits a clause its grammar makes mandatory — e.g. a `TRACE` with `IMPLEMENTS` but no `PROOF` line. | Edit: add the required clause (for `TRACE`, at least one `PROOF` line). |

### 3.2 Layer P — PROSE (fire at `NORMALIZE`; `001–049` BLOCKING, `050–099` ADVISORY)

P-layer rules are single-obligation-local; each maps to a closed improve op (see `../passes/improve.md`), never an open rewrite. The `001–049` / `050–099` split is normative for the P layer only.

| Code | Severity | Layer | Message (short name + defect) | Resolves by |
|---|---|---|---|---|
| `SOL-P001` | BLOCKING | P | dangling-condition: a trigger with no modal *consequence* at the prose level (semantically empty even if syntactically a sentence). | author rewrite: supply the consequence. |
| `SOL-P002` | BLOCKING | P | missing-actor: the obligation has no responsible actor. | `CONCRETIZE`: name the actor. |
| `SOL-P003` | BLOCKING | P | missing/informal-modality: no modal, or lowercase `should`/`must`/`may` used where binding force is intended. | `NORMALIZE`: uppercase to the correct modal. |
| `SOL-P004` | BLOCKING / ADVISORY | P | bundled/overloaded-obligation: one clause bundling multiple separable obligations is BLOCKING; a permitted `AND THE` chain beyond two is an ADVISORY warning. | `ATOMIZE`: split into one obligation per block. |
| `SOL-P005` | BLOCKING | P | vague-quality-no-criterion: a vague-quality / high-risk word in a binding clause with no same-line observable criterion (see `./APS.md`). | `CONCRETIZE` or `QUANTIFY`. |
| `SOL-P006` | BLOCKING | P | undefined-term: an undefined term in a binding clause (not resolvable via in-file `TERM` or `memory/glossary.md`). | `CLARIFY` / `BIND`: define the term. |
| `SOL-P007` | BLOCKING | P | negation-ambiguity: a bare `MUST NOT` whose scope is ambiguous, not paired with the affirmative behavior. | `CLARIFY`: state the affirmative alongside the prohibition. |
| `SOL-P008` | BLOCKING | P | uncaptured-uncertainty: behavioral uncertainty left in prose, not lifted to a `QUESTION` block. | `CLARIFY`: raise a `QUESTION`. |
| `SOL-P050` | ADVISORY | P | pronoun: a vague pronoun with a non-unique antecedent. | `CONCRETIZE`: name the unique referent. |
| `SOL-P051` | ADVISORY | P | passive-voice: passive voice in an obligation sentence. | `NORMALIZE`. |
| `SOL-P052` | ADVISORY | P | sentence-length: obligation sentence exceeds ~20 words. | `COMPRESS` / `ATOMIZE`. |
| `SOL-P053` | ADVISORY | P | non-present-non-active: non-present-tense or non-active phrasing. | `NORMALIZE`. |
| `SOL-P054` | ADVISORY | P | prose-noise: a decorative phrase that adds no constraint. | `COMPRESS`. |
| `SOL-P055` | ADVISORY | P | redundancy: repeated context that adds no constraint. | `COMPRESS`. |
| `SOL-P056` | ADVISORY / BLOCKING | P | comparative-no-baseline: a comparative/superlative with no baseline. **BLOCKING in a binding clause, ADVISORY in commentary**. | `QUANTIFY`: supply the baseline. |
| `SOL-P057` | ADVISORY | P | terminology-drift: a term used inconsistently with its `memory/glossary.md` definition (synonym, casing variant, competing label). Advisory because the term still resolves — so not the blocking `SOL-P006`. | `NORMALIZE`: replace the variant with the canonical glossary term. |
| `SOL-P058` | ADVISORY | P | deprecated-modal-alias: `SHALL`/`SHALL NOT` used as a modal — a recognized deprecated alias of `MUST`/`MUST NOT`. | `NORMALIZE`: rewrite to `MUST`/`MUST NOT`. |

The **high-risk-word list** (subjective/promotional terms, loopholes, comparatives, and ambiguous quantifiers/connectives, drawn from the requirements-smell literature) and the **same-line-makes-it-observable rule** govern `SOL-P005`/`SOL-P056`: a high-risk word is permitted only when the same sentence, bullet, or immediately-following line converts it to observable behavior (actor+action+object, a measurable threshold, or a named verification target); otherwise the rule fires BLOCKING. The full catalogue and the rule mechanics live in `./APS.md`.

### 3.3 Layer M — SEMANTIC (fire at `NORMALIZE`, cross-obligation; all BLOCKING)

A broken reference or contradiction changes what is built, so every M code is BLOCKING.

| Code | Severity | Layer | Message (short name + defect) | Resolves by |
|---|---|---|---|---|
| `SOL-M001` | BLOCKING | M | actor/object-incompleteness: a referenced actor, object, or surface is unresolved across the spec / imports (also catches cross-spec id collision). | `BIND` / `CONCRETIZE`: resolve or declare the referent. |
| `SOL-M002` | BLOCKING | M | contradiction: two obligations share a **contradiction key** (normalized actor + trigger/state + the `affects[]` ∪ `writes[]` surface set, case-folded/whitespace-collapsed exact match) and carry **opposed modalities** (positive vs negative force, or `MUST NOT` vs `MAY`). **Exact-key match only in v0.1**; paraphrase/entailment contradiction is out of scope. | `DECONFLICT`. |
| `SOL-M003` | BLOCKING | M | unbound-cross-reference: a `DEPENDS ON` / `IMPLEMENTS` / `PRESERVES` reference names an id that does not exist. | `BIND`: fix the reference. |
| `SOL-M004` | BLOCKING | M | authority-conflict: a lower-authority block attempts to weaken a higher-authority obligation (the source-authority order: approved spec/ADR > task > chat). | `DECONFLICT` / amendment. |

### 3.4 Layer V — VERIFICATION (fire at `VERIFY`; gate the merge gate)

The subject is the `VERIFY BY <type>:<adapter>:<artifact>[#selector]` binding (see `../passes/verify.md`). Most are BLOCKING; `SOL-V003` and `SOL-V011` are ADVISORY by default and promote under strict mode.

| Code | Severity | Layer | Message (short name + defect) | Resolves by |
|---|---|---|---|---|
| `SOL-V001` | BLOCKING | V | no-verification-path: an obligation block (REQ/CONSTRAINT/INVARIANT) or an INTERFACE has no `VERIFY BY` binding. | `BIND`: attach a `VERIFY BY`. |
| `SOL-V002` | BLOCKING | V | proof-not-executable: the bound adapter does not resolve through `AGENTS.md` > Commands, or the artifact is missing. | `BIND`: point at a resolvable cmd* adapter. |
| `SOL-V003` | ADVISORY / BLOCKING | V | non-observable-proof: the bound proof is non-observable (e.g. an INVARIANT bound only to a non-observable unit `test`). ADVISORY by default; BLOCKING under strict mode. | `BIND`: prefer `property`/`model`/`static` for INVARIANT; `contract` for INTERFACE. |
| `SOL-V004` | BLOCKING | V | stale-proof: a prior `PASS` whose evidence no longer matches the current source content-hash, a changed write surface, a changed proof-exercised read surface, or a rebound adapter; surfaces as the `STALE` verdict. | 3-way reconcile (re-run / amend / fix code) — never a silent re-bless. |
| `SOL-V005` | BLOCKING | V | bad-verdict-value: a `VERDICT` core value is not one of `PASS`/`FAIL`/`BLOCKED`/`UNVERIFIED`, OR a lifecycle decorator is missing its mandatory fields (WAIVED→authority+reason+expiry; STALE→prior-verdict ref+changed-surface; CONTRADICTED→two conflicting evidence refs). | Edit: use a valid verdict line (see `../passes/verify.md`). |
| `SOL-V006` | BLOCKING | V | interface-without-contract: an `INTERFACE` whose `VERIFY BY` proof_type is not `contract`. | `BIND`: use `contract:` as the proof type for INTERFACE bindings. |
| `SOL-V007` | BLOCKING | V | invalid-lifecycle-decoration: a lifecycle decorator applied to the wrong core value (e.g. `WAIVED` on a `PASS`/`BLOCKED`, or `STALE` on anything other than a prior `PASS`). | Edit: remove or correct the lifecycle decorator. |
| `SOL-V008` | BLOCKING | V | missing-verdict-at-merge-gate: a required `VERIFY BY` binding has no `VERDICT` at the merge gate (counts as `UNVERIFIED`). | `BIND`: run the proof and record a verdict, or `WAIVE`. |
| `SOL-V009` | BLOCKING | V | unknown-proof-type: a `verify_ref` whose `proof_type` is outside the closed 9-set (`static`, `test`, `contract`, `property`, `model`, `perf`, `security`, `manual`, `monitor`). | Edit: use one of the nine canonical proof types (see `../passes/verify.md`). |
| `SOL-V010` | BLOCKING | V | missing-human-authority: a high-oversight-band obligation carries a `manual`/`WAIVED` verdict with no named human authority. | Edit: record the human authority on the `manual @ REVIEW` verdict / waiver. |
| `SOL-V011` | ADVISORY / BLOCKING | V | oracle-adequacy-unrecorded: a proof does not record what it exercised relative to the obligation predicate where one is required. ADVISORY by default; BLOCKING in strict mode for `RISK high`/`critical`. | Edit: add the `oracle_adequacy` record. |

### 3.5 Layer O — ORCHESTRATION (fire at `LOWER`; gate plan emission and the merge gate)

These guard safe parallelism (see `../passes/lower.md`) and the coverage gates (see `../passes/decompose.md`). `SOL-O004` and `SOL-O006` are ADVISORY; the rest are BLOCKING.

| Code | Severity | Layer | Message (short name + defect) | Resolves by |
|---|---|---|---|---|
| `SOL-O001` | BLOCKING | O | conflicting-tasks-parallel: the plan marks two work packets parallel that share a write surface or an interface/migration node (violates the safe-parallelism predicate). | `SCOPE`: serialize, or split write surfaces. |
| `SOL-O002` | BLOCKING | O | dependency-cycle: a `DEPENDS ON` cycle exists in the lowered DAG. | `SCOPE` / `DECONFLICT`: break the cycle. |
| `SOL-O003` | BLOCKING | O | blocking-question-reaches-lowering: an unresolved `blocking` `QUESTION` reaches the `LOWER` pass (lowering MUST NOT proceed past an open blocking question). | `CLARIFY`: answer/close the QUESTION before lowering. |
| `SOL-O004` | ADVISORY | O | scope-too-broad: an obligation has no `WRITES`/`READS`/`AFFECTS`, leaving it unscoped (serializes by default and harms planning). | `SCOPE`: declare write/read/affect surfaces. |
| `SOL-O005` | BLOCKING | O | owned-path-outside-write-surface: a work packet writes a path outside its declared `WRITES` surface (the two-tier lowering check). | `SCOPE`: declare the path, or stop writing it. |
| `SOL-O006` | ADVISORY | O | import-policy-overlap: an imported file creates a duplicate/overlapping policy obligation. | `DECONFLICT` / `COMPRESS`. |
| `SOL-O007` | BLOCKING | O | uncovered-obligation: a lowered obligation maps to no task packet (the coverage gate). An orphan TRACE/VERDICT target resolving to no obligation is `SOL-M003`, not this. | `SCOPE` / decompose: assign the obligation to a packet. |
| `SOL-O008` | BLOCKING | O | double-owned-obligation: a lowered obligation is assigned to more than one `implement` packet. Appearing across *different* passes (implement/verify/review) is legitimate and does NOT trip this. | `SCOPE` / decompose: assign the obligation to exactly one implement packet. |

---

## 4. Principal BLOCKING set (quick index)

The canonical blocking set, for the common case: **S** — `SOL-S001`, `SOL-S003`, `SOL-S005`, `SOL-S006`, `SOL-S012`. **P** — the blocking prose set `SOL-P001`–`SOL-P008`. **M** — `SOL-M001`, `SOL-M002`. **V** — `SOL-V001`. **O** — `SOL-O001`, `SOL-O005`.

The principal ADVISORY prose set is `SOL-P050`–`SOL-P058`.

---

## 5. Improve-op ↔ lint-code map

The closed **10-op improve set** (see `../passes/improve.md`) is the canonical detect→repair wiring. Each op is strictly semantics-preserving; any intent change routes to amendment/review, never improve. `PROMOTE` carries no lint code (it routes through the promotion protocol — see `../passes/promote.md`).

| Improve op | Resolves codes |
|---|---|
| `NORMALIZE` | `SOL-P003`, `SOL-P051`, `SOL-P053`, `SOL-P057`, `SOL-P058` |
| `ATOMIZE` | `SOL-P004` (and `SOL-P052` by splitting) |
| `CONCRETIZE` | `SOL-P005`, `SOL-P002`, `SOL-P050`, `SOL-M001` |
| `QUANTIFY` | `SOL-P005`, `SOL-P056` |
| `BIND` | `SOL-V001`, `SOL-V002`, `SOL-V003`, `SOL-V006`, `SOL-V008`, `SOL-M003`, `SOL-P006` |
| `SCOPE` | `SOL-O001`, `SOL-O002`, `SOL-O004`, `SOL-O005`, `SOL-O007`, `SOL-O008` |
| `CLARIFY` | `SOL-P008`, `SOL-P007`, `SOL-O003` |
| `DECONFLICT` | `SOL-M002`, `SOL-M004`, `SOL-O006` |
| `COMPRESS` | `SOL-P054`, `SOL-P055`, `SOL-O006` |
| `PROMOTE` | (no lint code — routes through the promotion protocol, see `../passes/promote.md`) |

---

## 6. Legacy-code translation table (old → new)

Swarm's diagnostic codes have passed through three prior code schemes before settling on the unified `SOL-<LAYER><NNN>` namespace: an `APS-*` prose-rule scheme, a flat research scheme (`SOL00x`/`10x`/`20x`/`30x`), and a layered research scheme (`SOL-S00x`/`SOL-L1xx`/`SOL-M2xx`/`SOL-O3xx`/`SOL-V4xx`). The `APS-` prefix is retired; every prior code remaps into `SOL-<LAYER><NNN>`. These prior codes are **non-normative aliases** and MUST NOT appear in any conformant artifact; they are recorded here only so a reader meeting an old code can resolve it. The mapping is one-way. The tables below are the authoritative remap.

### 6.1 APS family (retired prefix)

| Prior code | v0.1 code | Note |
|---|---|---|
| `APS-A001` | `SOL-P005` | vague-quality, no observable criterion |
| `APS-A002` | `SOL-P050` | pronoun ambiguity |
| `APS-C001` | `SOL-M001` | actor/object incompleteness |
| `APS-M001` | `SOL-P003` | informal modality |
| `APS-O001` | `SOL-P004` | bundled/overloaded obligation |
| `APS-P001` | `SOL-P054` | prose noise |
| `APS-Q001` | `SOL-P008` | uncaptured behavioral uncertainty |
| `APS-R001` | `SOL-P055` | redundancy |
| `APS-S001` | `SOL-S012` | document-level section gap → required-section-missing (per-obligation scope gap stays `SOL-O004`) |
| `APS-T001` | `SOL-M001` | traceability id → semantic completeness |
| `APS-V001` | `SOL-V001` | no verification path |
| `APS-X001` | `SOL-M002` | contradiction |

### 6.2 Flat research scheme (`SOL00x` / `10x` / `20x` / `30x`)

Allocation rule: flat `SOL00x`/`10x` → `SOL-S`; `SOL20x` → `SOL-M` (cross-ref) / `SOL-V` (proof) / `SOL-O` (planner); `SOL30x` → `SOL-P`.

| Prior code | v0.1 code | Note |
|---|---|---|
| `SOL001` | `SOL-S010` | invalid/missing frontmatter (metadata) |
| `SOL002` | `SOL-S002` | unknown block type |
| `SOL003` | `SOL-S007` | invalid block id |
| `SOL004` | — (TOMBSTONED) | `:::END` removed; bare-header form makes this moot |
| `SOL005` | `SOL-S008` | first line not a control sentence |
| `SOL006` | `SOL-S010` | unknown metadata field |
| `SOL007` | `SOL-S010` | duplicate scalar field |
| `SOL101` | `SOL-S001` / `SOL-P001` | `WHEN`/`IF` without consequence (syntax + prose companion) |
| `SOL102` | `SOL-S001` | `THEN` without modal obligation |
| `SOL103` | `SOL-S003` / `SOL-P003` | REQ lacks modal |
| `SOL104` | — (TOMBSTONED) | `ALWAYS`/`NEVER` removed from INVARIANT |
| `SOL105` | `SOL-S002` | malformed QUESTION |
| `SOL201` | `SOL-S004` / `SOL-M001` | duplicate id (intra-spec → S004; cross-spec → M001) |
| `SOL202` | `SOL-M003` | unresolved dependency reference |
| `SOL203` | `SOL-O002` | dependency cycle |
| `SOL204` | `SOL-V001` | missing verification binding |
| `SOL205` | `SOL-O003` | blocking QUESTION unresolved at lowering |
| `SOL206` | `SOL-M004` | authority conflict |
| `SOL207` | `SOL-M002` | contradiction |
| `SOL208` | `SOL-O001` | planner marks conflicting tasks parallel |
| `SOL301` | `SOL-P005` | ambiguous adjective/adverb |
| `SOL302` | `SOL-P005` | unverifiable wording |
| `SOL303` | `SOL-P004` | low singularity (multiple obligations) |
| `SOL304` | `SOL-O004` | missing owner/priority (scope/governance) |
| `SOL305` | `SOL-O004` | scope too broad for planning |
| `SOL306` | `SOL-O006` | imported-file policy overlap |
| `SOL307` | `SOL-P052` / `SOL-P054` | overlong block body |

### 6.3 Layered research scheme (`SOL-S00x` / `SOL-L1xx` / `SOL-M2xx` / `SOL-O3xx` / `SOL-V4xx`)

| Prior code | v0.1 code | Note |
|---|---|---|
| `SOL-S001` | `SOL-S001` | trigger, no consequence (unchanged) |
| `SOL-S002` | `SOL-S002` | unknown keyword / malformed block (unchanged) |
| `SOL-S003` | `SOL-S003` | actor-clause modal check (singularity warning is now `SOL-P004`) |
| `SOL-S004` | `SOL-S004` | duplicate id (unchanged) |
| `SOL-L101` | `SOL-P005` | subjective/promotional term (`SOL-L → SOL-P`) |
| `SOL-L102` | `SOL-P005` | ambiguous qualifier / loophole |
| `SOL-L103` | `SOL-P050` | vague pronoun |
| `SOL-L104` | `SOL-P004` | bundled obligation |
| `SOL-L105` | `SOL-P051` | passive voice |
| `SOL-M201` | `SOL-M001` | unresolved actor/term/surface |
| `SOL-M202` | `SOL-M002` | contradiction |
| `SOL-M203` | `SOL-V001` | missing `VERIFY BY` (re-layered S/M → V) |
| `SOL-M204` | `SOL-O005` / `SOL-V001` | declared write surface missing |
| `SOL-M205` | `SOL-O002` | dependency cycle |
| `SOL-O001` | `SOL-O001` | parallel write-surface conflict (severity raised to BLOCKING) |
| `SOL-V401` | `SOL-V001` | proof missing / not executable |
| `SOL-V402` | `SOL-V004` | stale proof (→ `STALE` verdict) |
| `SOL-V403` | `SOL-V003` | non-observable proof |

### 6.4 Cross-layer re-layerings

A handful of prior codes change *layer* in v0.1 because their concern moved to a later phase. The whole prior prose layer `SOL-L###` absorbs into `SOL-P###`.

| Prior code | v0.1 code | Re-layering |
|---|---|---|
| `SOL-S007` | `SOL-V001` | verification → V |
| `SOL-S010` (prior) | `SOL-V005` | verdict-value check → V (the v0.1 `SOL-S010` slot is re-allocated to `unknown-metadata-field`) |
| `SOL-S008` | `SOL-O003` | planner / blocking-QUESTION → O |
| `SOL-M003` (prior) | `SOL-V001` | proof-binding → V (the v0.1 `SOL-M003` slot is `unbound-cross-reference`) |
| `SOL-M007` | `SOL-V003` | proof-observability → V |
| `SOL-M008` | `SOL-V004` | proof-staleness → V |
| `SOL-M009` | `SOL-O001` | planner parallelism → O |

**Splits by phase.** Where one prior code maps to two v0.1 codes — e.g. `SOL101 → SOL-S001`/`SOL-P001`, `SOL201 → SOL-S004`/`SOL-M001` — the syntactic facet fires at `PARSE` (S) and the semantic/prose facet at `NORMALIZE` (P/M); a translator MUST emit both where both facets are present and MUST NOT collapse them. **Tombstoned** prior codes (`SOL004` `:::END` removed; `SOL104` `ALWAYS`/`NEVER` removed from INVARIANT) have no successor. New-in-v0.1 codes `SOL-O005` and `SOL-S013` have no prior alias.

---

## 7. Conformance

A conformant `lint-spec` checker (a contract, never shipped code) MUST: (1) emit only `SOL-<LAYER><NNN>` codes; (2) emit the diagnostic record shape defined above; (3) apply the default severities here, overridable only through the recorded `swarm.config` waiver schema; (4) never reuse a tombstoned number; (5) name a closed improve op (see `../passes/improve.md`) in `suggest` wherever one applies.

A curated good/bad golden corpus makes the `SOL-P` rules' precision and recall measurable. The target is an aspirational ≥0.90 precision / ≥0.85 recall — set deliberately above the field-measured ceiling for lightweight automated requirement-smell detection (roughly 59% precision / 82% recall, with high variation), and a design goal, not an achieved result.

Two scope limits hold in v0.1, by design: `SOL-M002` contradiction fires on **exact-key match only** — paraphrase/entailment contradiction is out of scope and may at most surface as an advisory judge-rendered diagnostic; and the IR `level: note` value has **no surface producer**, reserved for a future emitter.

---

## Related

- `./SOL.md` — the obligation language: the 7 block types, 5 modals, clauses, and metadata fields these codes check.
- `./APS.md` — the controlled-prose standard: the high-risk-word catalogue and the same-line-observable rule behind the `SOL-P` codes.
- `../passes/lint.md` and `../passes/improve.md` — the passes that raise S/P/M codes and the closed repair ops.
- `../passes/verify.md` — the merge gate, the 7-verdict model, and the nine `VERIFY BY` proof types the V codes check.
- `../passes/lower.md`, `../passes/decompose.md` — the planning surfaces the O codes guard.
- `../passes/promote.md` — the promotion protocol that the no-code `PROMOTE` op routes through.
- `../templates/spec.swarm.md` — the spec section layout `SOL-S012` checks.
