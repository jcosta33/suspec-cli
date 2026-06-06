# {{title}} — spec authoring

## Metadata

- Slug: {{slug}}
- Pass: author
- Task kind: spec-writing
- Profile: Architect
- Created: {{createdAt}}
- Status: active
- Deliverable: `<spec-dir>/{{slug}}.swarm.md`

---

> SPEC-AUTHORING SESSION — produces a `*.swarm.md` source spec, not code. The spec declares what MUST hold; the implementer picks the mechanism. Resolve every `[blocking]` QUESTION before finishing. Complete the distillation-loss statement before close.
>
> `VERIFY BY` adapters resolve `cmd*` slots from the consuming repo's `AGENTS.md > Commands` (`cmdTest`/`cmdValidate`/`cmdFormat`/`cmdBenchmark`/`cmdLint`/`cmdTypecheck`). If a needed slot is undefined, ask the user — never guess a command.

---

## Objective

What capability is being specified and what decision it informs. One paragraph.

---

## Parents being normalized

List each parent and its epistemic stance — preserve the stance across the boundary; intent is asserted only in the spec's SOL blocks.

- Triggering ask: `<path-or-chat>`
- Research (inquiry) / Audit (observation) / PRD (intent) / RFC (proposal) / NFR (quality attribute) / interface source (boundary shape): `<paths>`

---

## Pattern survey

Existing patterns/interfaces consulted before specifying new ones. Cite the project paths read.

- `<project-path>` — <what it does> — <reused / why it does not fit>

---

## Progress checklist

- [ ] Read every parent in full; record stance per parent
- [ ] Survey existing patterns; record consulted paths above
- [ ] Draft frontmatter (required set) + `## Intent` / `## Non-goals` / `## Context`
- [ ] Author `## Interfaces` (INTERFACE blocks, each binding a `contract:` proof)
- [ ] Author `## Obligations` / `## Constraints` / `## Invariants` (each binding a proof)
- [ ] Lift every behavioral ambiguity into a `## Questions` QUESTION block
- [ ] Fill `## Verification coverage` and `## Downstream tasks` tables
- [ ] Resolve / decide / route every `[blocking]` QUESTION
- [ ] Complete `## Distillation loss statement` (Preserved / Dropped / Still uncertain)
- [ ] Self-review gate below passes

---

## Design decisions

For each significant structural choice. A decision without named alternatives is incomplete — the reader cannot tell whether alternatives were considered or overlooked.

### Decision: <name>

**Chosen:** <what was chosen>

**Considered and rejected:** _<alternative A>_ — rejected because <reason>; _<alternative B>_ — rejected because <reason>.

---

## [blocking] QUESTION tracker

One row per blocking question. The spec is not finishable while any row is unresolved — resolve via a parent (research/ADR/audit), or decide a reasonable default and downgrade to `[non-blocking]`.

| Q-id | Question | AFFECTS | Resolution path | Status |
| ---- | -------- | ------- | --------------- | ------ |
|      |          |         |                 |        |

---

## Findings (session meta)

- ***

## Blockers

- *** (including unresolved `[blocking]` QUESTIONs)

## Next steps

- ***

---

## Self-review

> Hard gate. The spec is not delivered until every item below has a written answer and the forced-output blocks are pasted. Review as a verifier about to derive proofs from this spec — look for the requirement you assumed the implementer would infer.

### Forced output — [blocking] QUESTION status (paste verbatim)

```
- (none — spec is finishable)
— or —
- <Q-id> — blocking because <reason>; resolution path: <research / ADR / decision recorded>
```

### Forced output — distillation-loss statement present

- Are `### Preserved`, `### Dropped`, `### Still uncertain` all written? Did anything non-droppable (architectural constraint, payload shape, acceptance criterion) land in `### Dropped`?
  Answer:

### Testability

- Pick the most ambiguous obligation. Can a verifier derive its proof from the block alone? Does every binding block carry a `VERIFY BY`, each INTERFACE a `contract:` proof?
  Answer:

### Requirement, not mechanism

- Any obligation that names the data structure / library / mechanism instead of the observable bound? Any "should be fast / secure / intuitive" wishes?
  Answer:

### Stance preserved

- Did any parent's observation / inquiry / proposal get asserted as intent without being lifted into a SOL block here? Any parent mis-named with a `.swarm.` infix?
  Answer:

### Sections + ids

- Required sections in contract order, frontmatter required set populated? Ids unique and prefix-matched to block type?
  Answer:

### Commands resolved or asked

- Every `VERIFY BY` adapter resolves a defined `AGENTS.md > Commands` `cmd*` slot, or the undefined slot was raised to the user?
  Answer:
