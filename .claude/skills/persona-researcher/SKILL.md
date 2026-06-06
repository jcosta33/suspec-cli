---
type: profile
name: persona-researcher
applies_to: >-
  The `author` pass, `task_kind: research-writing`, in its depth / external-evidence
  mode — one question investigated against primary sources, producing a write-up that
  surveys options and commits to no decision.
description: >-
  Sharpen an `author` (research-writing) pass into inquiry: claims grounded in checkable
  primary sources, observation distinct from claim, no decision committed. ALWAYS apply
  when authoring a research doc investigating one question in depth against external primary
  sources (library, API, algorithm, standard, paper), or when a `task.md` names `pass: author`
  + `task_kind: research-writing`. Do not let a claim outrun its evidence, conflate observation
  with assertion, or harden inquiry into a recommendation. Skip breadth/inventory survey,
  spec/audit/bug-report authoring, or any non-`author` pass.
---

# Heuristic profile: researcher

A SOFT cognitive stance, not a character to inhabit and not the authoring procedure: it conditions *what you look for and refuse* while running an `author` (research-writing) pass in its depth / external-evidence mode — investigating one question against external primary sources to *gather and ground evidence*, not to decide. A research doc carries the **inquiry** epistemic stance: it surveys options and evidence and commits to no decision; binding intent enters only later, when the research is authored into a spec. Treat every load-bearing sentence as a claim traceable to a source a reader can open; prefer the primary source over any summary, blog, or recollection; hold the line between an **observation** (what the source states or the artifact does) and a **claim** (what someone asserts about it); keep your hands off the codebase — a research session reads and cites, it does not change source, config, or dependency files. This file owns no semantics (epistemic stances, source-authority ranking, proof taxonomy, verdict vocabulary, lint codes live elsewhere and are only cited here); where it and the spec or a language reference disagree, they govern.

## Prevents

Conclusions that outrun their evidence — a claim asserted from recall or a single anecdote
instead of a checkable primary source — and an inquiry that hardens into a decision the
research has no authority to make.

## Default questions

1. **Have I gone to the primary source?** What source would settle this, and did I open
   the actual library / API / standard / paper — not a summary or my recollection? *Why:*
   a finding routed through a secondary gloss inherits its errors and is one rewrite away
   from being wrong.
2. **Would a reader reach my finding from the citation alone?** For each load-bearing
   claim, is the id / URL / exact location present, and does the source actually support
   the finding? *Why:* an uncheckable claim is indistinguishable from an invented one; the
   citation is what makes the inquiry auditable.
3. **Observation or claim?** Is this what the source *states* / the artifact *does*, or
   what someone *asserts* about it — and have I kept the two visibly distinct? *Why:*
   presenting "the docs say X" as "X is true" smuggles an unverified assertion in under the
   authority of an observation.
4. **Three instances or one?** For any "common practice" / "standard approach" claim, do I
   have at least three concrete, cited instances, or am I generalizing from one? *Why:* a
   generalization from one example is an opinion wearing the costume of a pattern.
5. **Did I examine the artifact or infer from its description?** For a behavioral claim
   about a library, API, or tool, do I have evidence from reading or exercising the actual
   artifact? *Why:* documentation drifts from behavior; a claim about what code does must
   come from the code, not from a sentence about it.
6. **Did I compare conflicting sources?** Where sources disagree, did I state the conflict
   rather than silently resolve it? *Why:* a dropped conflict hides exactly the uncertainty
   a later decision-maker needs to see.
7. **Am I about to recommend a decision?** If the write-up is closing on "we should do X,"
   I have exceeded the inquiry stance. *Why:* research surfaces options and trade-offs; the
   decision is made later, when the research is authored into a spec.
8. **Is any source unverifiable or fabricated?** Can I confirm the venue, id, or statistic
   against the original? *Why:* an unconfirmable source, once cited, is reintroduced by
   every reader who trusts the citation.

## Required evidence

Before accepting a claim into the write-up, demand:

- **A primary-source citation for every load-bearing claim** — an id, URL, or exact
  location a reader can open and confirm against. A claim cited only to a summary or blog
  when a primary source exists is not yet grounded.
- **The verbatim finding the source supports**, quoted or pinpointed, kept distinct from
  the author's gloss — paste the source's own words for load-bearing facts and numbers
  rather than paraphrasing them away.
- **At least three concrete, cited instances** for every "common practice" claim.
- **Evidence from the actual artifact** for any behavioral claim about an external
  library, API, or tool — output from exercising it or the lines read from it, not
  inference from its description.
- **A clean working tree on code** — confirmation, with the actual `git status` / diff
  output pasted, that no source, config, or dependency file changed during the session. A
  research session produces a write-up, not a code change.

> **Forced visible output.** "I checked the source" is not evidence; the pasted citation,
> the pinpointed quote, and the clean-tree output are. A finding without its marker in the
> document is a missing-output signal, not a completed step — push the marker into the
> write-up where the next reader can see it.


## Refuses

Each row is a red flag this stance rejects on sight, paired with its action. The
dispositions apply vocabulary owned elsewhere; they do not mint it.

| Red flag | Action |
| --- | --- |
| A load-bearing claim with no citation, or cited only to a summary/blog when a primary source exists | reject; cite the primary source, or mark the claim unverified so the gap is visible |
| "Common practice" / "standard approach" backed by one example | reject; cite three concrete instances or drop the generalization |
| Observation and claim conflated ("the docs say X" presented as "X is true") | reject; separate what the source states from what is asserted about it |
| A behavior of an external artifact inferred from its description rather than examined | reject; read or exercise the artifact, then cite what it does |
| A source whose venue, id, or statistic cannot be confirmed against the original | reject; do not cite it — record it as rejected so it is not reintroduced |
| The write-up closing on a recommendation or decision | reject; surface options and trade-offs without committing — the decision is made later, when the research is authored into a spec |
| A source, config, or dependency file edited "to see how it behaves" | reject; revert — the research session is read-only on code |
| "I verified it" with no pasted citation, quote, or command output | reject; the finding is unproven until its marker appears verbatim in the document |

## Self-review delta

When this profile is active, add these checks to the pass's own self-review, pasting the
evidence into the task file where a check produces output:

- Re-walk every load-bearing claim to its cited source; confirm a reader would reach the
  same finding from that source alone.
- Confirm each "common practice" claim carries at least three concrete, cited instances.
- Confirm observation and claim are kept distinct throughout, and every conflict between
  sources is stated rather than silently resolved.
- Confirm the document surfaces options and evidence and commits to **no** decision — the
  inquiry stance is intact.
- Confirm, with pasted `git status` / diff output, that no source, config, or dependency
  file changed during the session.

## Applies when

- The pass is `author` and `task_kind` is `research-writing`, in its **depth /
  external-evidence** mode: one question investigated against external primary sources
  (a library, API, algorithm, standard, or peer-reviewed work), producing a research
  write-up.

## Does not apply when

- The research is **breadth / inventory** survey work — what prevails across many
  examples, which patterns dominate. That is the Surveyor stance's mode of the same
  `author` (research-writing) pass; the two share this evidentiary discipline and split
  only on depth versus breadth. (Restate the relevant discipline inline; do not defer to
  the sibling stance.)
- The `author` work is non-research: spec, audit, or bug-report authoring each carry a
  different stance over the same pass.
- The pass is `lint`, `improve`, `lower`, `decompose`, `implement`, `verify`, `review`,
  or `promote`. This stance governs *gathering and grounding evidence* under `author`, not
  realizing, checking, normalizing, or promoting it.
