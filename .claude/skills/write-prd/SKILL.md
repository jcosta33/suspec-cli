---
type: pass-guide
name: write-prd
pass: author
description: >-
  Author a `prd.md`, intent-only parent of a spec: problem, affected users,
  success outcomes — so every obligation cites one origin of WHY. ALWAYS
  apply when a change adds new product behaviour or alters existing scope, when
  asked for a PRD or to "write down what we want and why," or when intent must
  be recorded before any spec. Do not author
  REQ/CONSTRAINT/INVARIANT/INTERFACE, prescribe a mechanism, leave Non-goals
  empty, or claim it governs code. Skip when turning intent into the spec,
  proposing HOW a design delivers, recording present-state risk, reproducing a
  defect, or surveying options.
---

# Pass guide: write-prd (`author` · intent parent of a spec)

How to author a `prd.md` well. It is **SOFT control**: procedure, not meaning. It MUST NOT define SOL/APS semantics, modality, authority order, or verification — those are fixed by the language references and pass contract; this guide only *applies* them. The `prd.md` artifact contract (required sections, stance rules), the `author`-pass contract (entry pass, pre-`PARSE`, no runtime), and the SOL obligation grammar (`REQ`/`CONSTRAINT`/`INVARIANT`/`INTERFACE`) are fixed elsewhere and never redefined here.

A PRD is one recognized **parent** the `author` pass normalizes into a `spec.swarm.md`. Its epistemic stance is **intent**: it states desired product outcomes and is **non-authoritative until authored** into a spec. That stance is normative — it MUST be preserved on promotion — and is the single line every rule below defends.

Per-section stance rules, the success-metrics table shape, filename/placement, and a worked before/after live one hop away in `references/prd-anatomy.md` — open it for lookup; do not re-derive a section's stance here.

## Purpose

Produce a `prd.md` that records **product intent** — the problem, who is affected, the outcomes that define success — as a durable, citable source. The PRD is the upstream statement of *desire* an `author` pass reads, distills, and turns into obligations. It carries **no obligations of its own**: it does not govern the codebase the way a spec or ADR does, and acquires obligation force only on promotion to a `spec.swarm.md`. *Why intent is its own artifact, not written straight into a spec:* provenance. Requirements practice distinguishes intent from evidence, proposal, decision, observation, and defect; recording it separately gives every later obligation a single origin of *why it exists*, preserved across promotion.

## Consumes

- The chat or brief stating the product intent, plus any evidence grounding it (surveys, durable project facts, prior research).
- The `prd.md` copyable skeleton in the kernel templates — copy it, then fill the seven sections.
- The `author`-pass and `prd.md` artifact contracts — for lookup, never redefined here.

## Produces

- One `prd.md` — a **working artifact**, plain `.md`, whose filename **MUST NOT** carry the `.swarm.` infix (that infix marks compiler-visible files only; a PRD is never parsed or emitted by a compiler). In an adopted project it lives under the workspace `sources/` tree (home for parents of a spec), never under `generated/` (derived packets) or `memory/` (durable recall).
- The seven required sections in fixed order, each on the **intent** side of the line. No obligation blocks. The PRD is the input an `author` pass distills into a spec — not that spec.

## Procedure

Run these steps in order. Each rule carries its WHY so you can extend it to a case the contract did not anticipate. Throughout, hold the one boundary that defines the artifact: a sentence describing a *mechanism* or reading as an *obligation* belongs not in the PRD but in the spec the `author` pass will produce.

### 1. State the problem before any solution

Open `## Problem` with the user or business problem in plain prose: what is wrong or missing, and for whom it hurts. Name no fix, feature, or API. *Why:* a problem statement that smuggles in a solution makes every downstream reader inherit a pre-committed mechanism never authored as an obligation or weighed against alternatives — the PRD makes the *why* citable, not the *how*.

### 2. Identify the affected population, not its behaviour

In `## Users`, name who is affected and which segment the outcome serves. Assert no behaviour or requirement here — a user segment is a population, not an actor in a `REQ`. *Why:* conflating "who is affected" with "what the system must do" is the first step toward writing obligations into an intent doc; keep them separate so the author pass can decide which actor each obligation binds.

### 3. Write goals as outcomes, never as obligations or mechanisms

Each `## Goals` entry is an **outcome statement** — the result that defines success — never the means of delivery. Do **not** write `REQ` blocks, modal "MUST" clauses, or any mechanism. *Why:* a goal written as a `REQ` lets an *intent* read as an approved behavioral contract and silently bypasses the authoring step where intent acquires obligation force — the same prohibition that keeps an audit from prescribing a fix and a bug-report from naming an implementation. Goals seed obligations; they are not obligations.

### 4. Make `## Non-goals` explicit and non-empty

`## Non-goals` is **mandatory and MUST NOT be empty**: it states the outcomes deliberately out of scope — the boundary of intent. An absent boundary is a **defect**, not an omission. *Why:* without it, the author pass cannot tell a dropped outcome from an overlooked one, and scope silently expands as each reader assumes the omission was an oversight. The boundary makes the intent falsifiable.

### 5. Write success metrics as observable signals, in the table shape

`## Success metrics` is a table — `Metric | Target | How observed (future monitor: proof)`. Each metric describes a *signal* that a goal was met, never a verification binding. Each row **SHOULD** name *how it is observed*. *Why:* on promotion, a metric that already names how it is observed can seed a future observable check on the obligation it justified; an unobservable metric strands its goal with no path to proof. Naming the observation now is the cheapest place to make a goal verifiable later.

### 6. Constrain delivery, not the solution space

`## Release constraints` records date, rollout, compliance, or dependency limits on *shipping* — never authored `CONSTRAINT` blocks. *Why:* a delivery constraint ("must ship before the audit window") is about *when/how it reaches users*; a `CONSTRAINT` block restricts *what the solution may do*. Writing the latter here re-creates the goals-as-`REQ` violation against the solution space and bypasses the author pass.

### 7. Ground intent with linked evidence, not pasted evidence

`## Linked evidence` references the research and findings that ground the intent; it **points at** evidence, never restates or replaces it. Where an evidence item has a local id, a cross-file reference uses the `<source-id>#<local-id>` form. *Why:* the PRD is the intent parent, not the evidence store; duplicating evidence lets the two drift, and a PRD that *argues* its evidence has started doing the inquiry parent's job. Link, and let the evidence artifact stay authoritative on its own facts.

### 8. Keep frontmatter and section order conformant

Carry the YAML frontmatter (`type: prd`, a stable `id` slug, `status` one of draft/accepted/superseded, `created`, `updated`) and the seven sections in fixed order: Problem, Users, Goals, Non-goals, Success metrics, Release constraints, Linked evidence. *Why:* the `id` is the citable name the author pass and every downstream obligation reference; omitting or reordering a required section breaks the contract the promotion step relies on. Order and identity are load-bearing, not stylistic.

### Project commands

Authoring a PRD needs **no `cmd*` slot**: it is a hand-authored source document, not a built or tested artifact, and Swarm has no runtime that parses or emits it. If a task asks you to run a project command against the PRD (e.g. a docs linter or link checker) and the relevant slot — `cmdValidate`, `cmdLint`, `cmdFormat` — is undefined in the consuming repo's `AGENTS.md > Commands`, **ask the user**; never guess.

## Output contract

- One conformant `prd.md`: `type: prd` frontmatter + the seven sections in order; plain `.md`, no `.swarm.` infix; under the workspace `sources/` tree in an adopted project.
- **Zero obligation blocks.** No `REQ`, `CONSTRAINT`, `INVARIANT`, or `INTERFACE` anywhere. Goals are outcomes; release constraints are delivery limits; success metrics are signals.
- `## Non-goals` is present and non-empty.
- Every statement sits on the intent side of the line — no mechanism, no obligation, no claim the PRD governs the codebase. The PRD remains the durable record of intent the eventual spec's obligations serve.

## Anti-patterns

Concrete failure modes, each with the correction:

- ❌ Writing a goal as `REQ AC-001: WHEN … THE system MUST …`. → A goal is an outcome statement; obligation blocks exist only once the PRD promotes to a `spec.swarm.md` via the author pass. Restate it as the *outcome* and let the author pass mint the `REQ`.
- ❌ Slipping a mechanism into `## Problem` or `## Goals` ("users need a Redis cache for sessions"). → State the outcome ("session lookups stay fast under load"); the mechanism is a proposal/design decision the spec or an RFC owns, not the PRD.
- ❌ Leaving `## Non-goals` empty or omitting it. → It is mandatory and MUST NOT be empty; an absent boundary of intent is a defect. Name at least one outcome you are deliberately not pursuing.
- ❌ A success metric with no observable column ("the feature feels faster"). → Each metric should name *how it is observed* so it can later seed a proof on the obligation it justified; an unobservable metric strands its goal.
- ❌ Writing a `CONSTRAINT` block under `## Release constraints`. → Release constraints limit *delivery* (date/rollout/compliance/dependency); a `CONSTRAINT` restricts the solution space and is authored only into the spec.
- ❌ Naming the PRD `<slug>.swarm.md` or placing it under `generated/`. → A PRD is a working artifact: plain `.md`, no `.swarm.` infix, under `sources/` (a parent of a spec, never a derived packet or recall record).
- ❌ Treating the PRD as governing the codebase or as "the spec." → A PRD is non-authoritative until authored; it feeds the author pass, which produces the obligation-bearing spec. The PRD asserts *desire*, the spec asserts *contract*.
- ❌ Pasting research/findings into `## Linked evidence` instead of referencing them. → Link by `<source-id>#<local-id>`; the evidence artifact stays authoritative on its own facts, and the two cannot drift.

## Self-review

Before closing the pass, confirm — and where a step would otherwise leave no visible trace, write the trace into the deliverable:

- [ ] **Intent only.** No `REQ`/`CONSTRAINT`/`INVARIANT`/`INTERFACE` block anywhere in the file. (Grep for these keywords; paste the empty result, or the offending lines, into your self-review — "it's intent-only" without the check is not proof.)
- [ ] **No mechanism.** Re-read `## Problem` and `## Goals`: each states *what outcome and why*, naming no fix, feature, or API.
- [ ] **Non-goals non-empty.** `## Non-goals` is present and names at least one deliberately out-of-scope outcome.
- [ ] **Metrics observable.** Every `## Success metrics` row names a target and how it is observed; flag any that cannot be.
- [ ] **Delivery, not solution-space.** `## Release constraints` limits shipping, not what the solution may do.
- [ ] **Evidence linked, not pasted.** `## Linked evidence` references its sources by id; no evidence restated inline.
- [ ] **Conformant shell.** Frontmatter (`type: prd`, `id`, `status`, `created`, `updated`) and the seven sections present and in order; filename is plain `.md`, no `.swarm.` infix.

## Bundled resources

- `references/prd-anatomy.md` — the seven sections with per-section stance rules, the success-metrics table shape, filename/placement rules, and a worked outcome-vs-mechanism before/after. A lookup aid restating the artifact contract for convenience; the kernel artifact contract is authoritative on any disagreement.
