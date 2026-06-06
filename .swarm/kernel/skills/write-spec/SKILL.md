---
type: pass-guide
name: write-spec
pass: author
activates_for_task_kind: spec-writing
description: >-
  Author pass: capture intent as a `*.swarm.md` spec — SOL obligation blocks each binding a proof,
  every requirement testable, ambiguity in QUESTION blocks. ALWAYS apply when a task names
  `author` or asks for a spec, requirements, acceptance criteria, or interface contract, or when
  normalizing a research/audit/PRD/RFC/NFR parent into binding intent. Never prescribe
  implementations, put obligation force in prose outside a block, ship a `[blocking]` QUESTION, or
  drop intent silently. Skip present-state code, defect reproduction, surveying without deciding,
  partitioning the IR, or writing code.
---

# Pass guide: write-spec (author)

How to perform the `author` pass — first of the nine passes (`author → lint → improve → lower → decompose → implement → verify → review → promote`) and the only one that *writes* a `*.swarm.md` source spec. `author` sits **outside** the seven analysis phases: the entry pass before `PARSE`, the boundary where unstructured intent (chat, a research/audit/PRD/RFC parent) becomes the first compiler-visible artifact. Analysis begins at the next pass, which reads this pass's output.

This guide is SOFT control: procedure, not meaning. The load-bearing facts — what each block type, modal, and proof type *means*, the required section order — are fixed in the SOL language reference and the spec artifact contract, applied here, never redefined. A correctly authored spec is understandable without this guide.

Stance: **Architect**. Declare what MUST hold, not how it will be built. The implementer who later reads the spec picks the mechanism; make the obligation unambiguous, testable, and bounded.

## Purpose

A spec is the contract between whoever specifies and whoever builds. An implementer should be able to build from it with no follow-up questions, and a verifier should derive a proof from each obligation without re-interviewing the author. Its epistemic stance is **intent**: the one source artifact asserting what *must* hold — every other parent records what *is*, *failed*, *might* be done, or *was decided*, and acquires obligation force only when authored into a spec here.

## Consumes

- The triggering ask plus any recognized parent: a research write-up (inquiry stance), an audit (observation stance), a PRD (intent, not yet authoritative), an RFC (proposal), NFRs/SLOs (quality attributes), use-cases/examples (scenarios), or an interface source like an OpenAPI / GraphQL / DB schema (boundary shape). *Why:* the spec is normalized *from* these — you lift each parent's content across the boundary into binding obligations, not invent intent from nothing.
- The consuming repo's `AGENTS.md > Commands` for the `cmd*` slots a `VERIFY BY` binding references (`cmdTest`/`cmdValidate`/`cmdFormat`/`cmdBenchmark`/`cmdLint`/`cmdTypecheck`). If a needed slot is undefined, **ask the user** — never guess a command. *Why:* the spec is stack-agnostic; the concrete command is a project value.

## Produces

- One `*.swarm.md` source spec. The `.swarm.` infix before the final extension is the sole discriminator marking it compiler-visible; a plain `.md` is a working artifact, never parsed as SOL. Name the spec `<slug>.swarm.md` (e.g. `auth-refresh.swarm.md`) and leave every parent (audit, research, PRD, RFC, finding, ADR) a plain `.md`. *Why:* the infix is what a future tool keys on to "parse this as obligations"; mis-naming a parent `.swarm.*` smuggles a non-spec into the compiler's view.

The file carries YAML frontmatter (required set: `type: spec`, `id`, `swarm_language: SOL/0.1`, `aps_version`, `spec_version`, `status`) then the required sections in this exact order: `## Intent`, `## Non-goals`, `## Context`, `## Interfaces`, `## Obligations`, `## Constraints`, `## Invariants`, `## Questions`, `## Verification coverage`, `## Downstream tasks`, `## Distillation loss statement`. Copy the skeleton at the kernel's spec template (`templates/spec.swarm.md`) and replace every placeholder.

## Preserves

`author` is bound by the distillation-loss discipline: nothing load-bearing from a parent may be dropped silently. Architectural constraints, interface/payload shapes, and acceptance criteria are *never* droppable; narrative, rejected alternatives, and survey prose MAY be dropped — but only with an accounting in the closing statement. Each parent's epistemic stance is also preserved across the boundary: an observation, inquiry, or proposal becomes binding *intent* only here, in SOL obligation blocks — it does not arrive pre-promoted.

## Rejects

Refuse to finalize the spec, and surface the problem, when any of these hold. Each is a real lint defect the downstream pipeline raises — author so they never fire:

- A behavioral requirement stated only in prose, outside a block. Obligation force lives only inside `REQ`/`CONSTRAINT`/`INVARIANT` blocks; prose frames and explains but is never a contract. Hedged behavioral prose that should be a decision is the hedged-ambiguity defect `SOL-P008`.
- A binding obligation with no `VERIFY BY` — the missing-proof defect `SOL-V001`. An `INTERFACE` bound to anything but a `contract:` proof is `SOL-V006`; a proof type outside the closed nine is `SOL-V009`.
- A `[blocking]` `QUESTION` left open. It prevents lowering of every obligation it `AFFECTS`; one that reaches the next pass is an orchestration error — an unresolved decision being compiled into tasks.
- The required sections missing or out of order — the document-level defect `SOL-S012`.
- An implementation prescribed where a requirement belongs (see rule 2), or a parent's stance violated — e.g. authoring an audit's observation directly as a `REQ` without lifting it into intent here.

## Core rules

### 1. Every obligation is testable; bind a proof to each

A requirement a verifier cannot test is a wish, not an obligation. If you cannot describe its proof — the command, the assertion, the observable — it is too vague. Every binding block (`REQ`, `CONSTRAINT`, `INVARIANT`, `INTERFACE`) MUST carry a `VERIFY BY <type>:<adapter>:<artifact>` from the closed nine proof types (`static`, `test`, `contract`, `property`, `model`, `perf`, `security`, `manual`, `monitor`); the `<adapter>` is a `cmd*` slot resolved through the consuming repo's `AGENTS.md > Commands`. *Why:* the unbound obligation (`SOL-V001`) is the gap that lets work be marked "done" with nothing to judge it against.

- Testable: `THE client MUST redirect an expired session to /login with a fresh S256 code_challenge (≥ 32 bytes verifier entropy)` → `VERIFY BY test:cmdTest:auth-refresh-expired`.
- Not testable: `THE login flow MUST be secure` — no proof can be derived; reword to the concrete observable that "secure" means here.

### 2. State the requirement, not the mechanism

The implementer picks the implementation; the spec fixes the obligation. Write the observable behavior or the bound, not the data structure or library. *Why:* a spec naming the mechanism over-constrains the solution space and silently turns into implementation the verifier cannot independently check.

- Requirement: `Lookup MUST be O(1) per key` (an `INVARIANT`, `VERIFY BY perf:cmdBenchmark:lookup-latency`).
- Mechanism leak: "use a `Map<string, X>`". If a mechanism *is* load-bearing (compatibility with an existing API, a wire format), state it as a `CONSTRAINT` with a `BECAUSE` naming the requirement driving it, not a bare instruction.

### 3. Write each block in its canonical SOL shape under its own section

The seven block types each have a fixed grammar and a dedicated section; restated here so you author it right the first time:

- `REQ` (Obligations) — `WHEN <trigger>` / `THE <actor> MUST <observable response>`. Conditions use the EARS keywords in order (`WHERE → WHILE → WHEN → IF`); `THEN` is optional sugar after `IF` only. `AND THE …` chains a second consequence (each lowers to a separate obligation). A condition with no actor clause is `SOL-S001`; an actor clause with no modal is `SOL-S003`.
- `CONSTRAINT` (Constraints) — `THE <actor-or-surface> MUST NOT <forbidden action>`; bounds *how* obligations may be met. Carry a `static`, `contract`, or `manual:` proof. No `POLICY` block, no surface authority clause.
- `INVARIANT` (Invariants) — `<property> MUST|MUST NOT <hold>`; an always-held property, never a one-time triggered behavior (that is a `REQ`). Do not write `ALWAYS`/`NEVER` (redundant). Prefer a `property`, `model`, or `static` proof — binding an invariant only to a unit `test` is the weak-proof warning `SOL-V003`.
- `INTERFACE` (Interfaces) — `<signature> RETURNS <type>` with contiguous `ACCEPTS:`/`ERRORS:` bullet continuation lines (a blank line closes the body). MUST bind a `contract:` proof (else `SOL-V006`).
- `QUESTION` (Questions) — header carries `[blocking]` or `[non-blocking]` before the colon, body names what it `AFFECTS`. See rule 5.
- `TRACE` and `VERDICT` are *not* authored here — they are downstream review artifacts. A spec carries the first five only.

*Why:* a block whose prefix mismatches its type is `SOL-S005`; duplicate ids within one spec are `SOL-S004`. The header is one flush-left line `TYPE PREFIX-NNN:` with a mandatory trailing colon, and a blank line *inside* a body terminates it — author bodies as contiguous lines.

### 4. Use only the five modals, and uppercase only

The obligation's force is carried by exactly five uppercase modals — `MUST`, `MUST NOT`, `SHOULD`, `SHOULD NOT`, `MAY`. Lowercase `must`/`should`/`may` is plain prose and binds nothing. `CAN`/`WILL` in a binding clause is the non-modal defect `SOL-P003`; `SHALL`/`SHALL NOT` is the deprecated alias `SOL-P058`. A `SHOULD`/`SHOULD NOT` REQUIRES a same-block `BECAUSE` or `EXCEPT` (else `SOL-S006`). *Why:* the modal is the token a downstream verdict judges strength against; an informal modal leaves the obligation's force undefined.

### 5. Lift every behavioral ambiguity into a `[blocking]` QUESTION — and resolve it before you finish

A `[blocking]` QUESTION is one whose answer would change the spec's content. Capture it as a `QUESTION Q-NNN [blocking]:` block naming what it `AFFECTS` — never as hedged prose (that is `SOL-P008`). The spec is not finishable while a blocking question is open: either route it to a parent that resolves it (research, ADR, audit) and resume, or, if a reasonable default answers it, **make the decision**, record it in `## Context` (or as a resolved note), and downgrade the question to `[non-blocking]`. *Why:* a blocking question that reaches lowering is an unresolved decision being compiled into tasks — an orchestration error, not a deferrable nicety. Non-blocking questions MAY remain open if they touch no assigned obligation.

### 6. Survey existing patterns before introducing a new one

Before specifying a new interface or behavior, check what the consuming project already has. Record what you consulted in `## Context` (cite the project path you read); if you reuse a pattern, say which; if you introduce a new one, say why the existing patterns do not fit. *Why:* a spec authored without a survey re-specifies behavior that already exists, and the duplication is invisible until implementation collides with it.

### 7. Forced visible output: close the distillation-loss statement and the blocking-question list

The deliverable *is* the proof for this pass, so the gate is written and inspectable. Before handoff, the spec MUST carry a complete `## Distillation loss statement` with three subsections — `### Preserved` (intent carried forward), `### Dropped` (detail intentionally not carried, and why downstream does not need it), `### Still uncertain` (open uncertainty) — and you MUST paste the blocking-question status verbatim into the task file:

```
## [blocking] QUESTION status
- (none — spec is finishable)
— or —
- Q-003 — blocking because <reason>; resolution path: <research / ADR / decision recorded>
```

*Why:* the silent failure mode is a late step claimed but skipped — "I accounted for the loss" with no statement, or "no open questions" with an unresolved blocker still in the file. The written marker converts that invisible claim into something the next reader can check. If the list shows any blocking question, the spec is not finishable: route it, resolve it, re-paste the list.

## What does not belong

- Present-state observations of existing code → an audit (observation stance), not a spec.
- A defect's reproduction and root cause → a bug-report, which promotes into a fix task, not a spec.
- An options survey committing to nothing → a research write-up; it promotes *into* a spec via this pass, but is not itself the spec.
- Implementation step-by-step, the data structure, the chosen library → the implementer's concern; the spec states the requirement that constrains the choice.
- Unmeasurable acceptance language ("intuitive", "performant", "fast") in any obligation → reword to the concrete observable, or it is an untestable wish.

## Anti-patterns

- ❌ Stating a behavioral requirement in prose ("the client should clear the session on expiry") instead of a block → prose carries no obligation force; the requirement is invisible to lowering and verification. Put it in a `REQ` with a `VERIFY BY`.
- ❌ Authoring a `REQ`/`CONSTRAINT`/`INVARIANT` with no `VERIFY BY` because "it's obvious how to test it" → that is `SOL-V001`; an unbound obligation lets work be marked done with nothing to judge it. Bind the proof at author time.
- ❌ Binding an `INTERFACE` to a `test:` proof → an interface boundary requires a `contract:` proof that its shape matches reality (`SOL-V006`); a unit test does not check the boundary contract.
- ❌ Binding an `INVARIANT` only to a unit `test` → a unit test checks one state, not all states (`SOL-V003`); prefer `property`/`model`/`static`.
- ❌ Specifying the mechanism (`use a Map`, `store in Redis`) instead of the requirement → over-constrains the solution and turns the spec into unchecked implementation. State the bound (`O(1) per key`) and let the implementer choose.
- ❌ Leaving an unresolved decision as hedged prose ("we'll probably redirect to /login") → that is `SOL-P008`; lift it into a `[blocking]` QUESTION and resolve or decide before finishing.
- ❌ Shipping the spec with a `[blocking]` QUESTION still open → it blocks lowering of everything it `AFFECTS` and is an orchestration error if it reaches the next pass. Resolve, decide, or route it first.
- ❌ Naming a parent `audit.swarm.md` / `research.swarm.md` → the `.swarm.` infix marks the one compiler-visible spec; a parent is plain `.md`. Mis-naming smuggles a non-spec into the compiler's view.
- ❌ Dropping an architectural constraint, payload shape, or acceptance criterion into the loss statement's `### Dropped` → those are never droppable; only narrative, rejected alternatives, and survey prose may be dropped, and only with an accounting.
- ❌ Writing the sections in a convenient order, or omitting `## Verification coverage` / `## Downstream tasks` → required sections out of order or missing is the document-level defect `SOL-S012`.
- ❌ Hardcoding a concrete test/validate command into a `VERIFY BY` adapter → resolve `cmd*` slots through the consuming repo's `AGENTS.md > Commands`; if a slot is undefined, ask the user.

## Self-review delta

Before handoff, confirm — and paste real evidence into the task file where a step produces it; an assertion without the artifact is not a proof:

- [ ] **Every obligation testable.** Pick the most ambiguous-feeling `REQ`/`CONSTRAINT`/`INVARIANT` — could a verifier derive its proof from the block alone? Each binding block carries a `VERIFY BY` from the nine proof types (no `SOL-V001`); each `INTERFACE` binds a `contract:` proof (no `SOL-V006`).
- [ ] **No prose obligation.** No behavioral requirement lives outside a block; every binding modal is uppercase and one of the five (no `SOL-P003`/`SOL-P058`); each `SHOULD` carries a `BECAUSE`/`EXCEPT` (no `SOL-S006`).
- [ ] **Blocking-question list pasted.** The `## [blocking] QUESTION status` block is in the task file and shows `(none — spec is finishable)`, or every open one names its resolution path. Paste the list verbatim — a claim of "none open" without the list is not a proof.
- [ ] **Distillation-loss statement complete.** All three subsections present; nothing droppable (architectural constraint, payload shape, acceptance criterion) landed in `### Dropped`; each parent's stance preserved, not pre-promoted.
- [ ] **Sections in order.** Required sections present in contract order, frontmatter required set populated (no `SOL-S012`); ids unique and prefix-matched per type (no `SOL-S004`/`SOL-S005`).
- [ ] **Survey done.** Existing patterns consulted and recorded in `## Context`; reuse-vs-new justified.
- [ ] **Commands resolved or asked.** Every `VERIFY BY` adapter resolves a defined `AGENTS.md > Commands` `cmd*` slot; any undefined slot raised to the user, not guessed.
- [ ] **Implementer test.** "What requirement did I assume the implementer would infer?" Inference is the failure mode the spec exists to prevent — if the answer is non-empty, write the obligation.

## Bundled resources

- `references/task-template.md` — the spec-authoring task file: objective, linked parents, the survey, a progress checklist, design decisions with named alternatives, a blocking-question tracker, and a self-review whose gate is the pasted blocking-question list and the completed distillation-loss statement. The deliverable (the `*.swarm.md` spec) is authored into its final home; the task file is gitignored working memory, discarded once the spec lands.
