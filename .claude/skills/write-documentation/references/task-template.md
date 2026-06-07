# {{title}}

## Metadata

- Slug: {{slug}}
- task_kind: documentation
- pass: implement
- Stance: Documentarian
- Source `task.md`: {{taskFile}}
- Owned paths (write_surfaces): {{writeSurfaces}}
- Created: {{createdAt}}
- Status: active

---

> **DOCUMENTATION IMPLEMENT PASS** — Document exactly the assigned obligations, for a human who has
> not read the code. One Diátaxis frame. Lead with what the reader must do. Every example runs;
> every behaviour claim cites `file:line`. No hedging. Nothing leaves your hand unverified.
>
> **Commands:** `{{cmdFormat}}` / `{{cmdValidate}}` resolve from `AGENTS.md > Commands` (validate
> only if the project lints docs). A doc-lint command (`markdownlint`, `vale`, …) is not a standard
> slot — ask the user if the project uses one. The runner for a code *example* is the example's own
> command, not a `cmd*` slot. If `AGENTS.md` is missing or a slot is undefined, ask before
> substituting — do not guess.

---

## Parent contract

(The inherited hand-off, pasted from the `task.md`: objective + deliverable + acceptance bar +
boundaries — owned vs forbidden paths.)

---

## Scope

**In:** (the assigned obligations this packet documents — nothing wider)

-

**Out:** Do not document unassigned obligations. Do not edit doc files outside the assigned write
surfaces. Do not weaken or re-interpret constraints, invariants, or non-goals. Do not mix Diátaxis
frames. Do not polish neighbouring prose "while I'm here".

---

## Assigned obligations

(The exact SOL blocks, pasted verbatim — the `REQ` / `INTERFACE` ids this doc covers.)

-

## Constraints and invariants

(The `CONSTRAINT` / `INVARIANT` SOL blocks this doc MUST describe faithfully, pasted verbatim.)

-

---

## Doc target

**File:** (the path to the document being written or updated.)

**Diátaxis frame:** _tutorial / how-to / reference / explanation_ — pick exactly one. Do not mix.

**Audience:** (who reads this doc. Be specific — "developers" is not specific enough; "developers
integrating our SDK for the first time" is.)

**Reader's question:** (the one question this doc answers, stated as the reader would ask it.)

---

## Source material

(What this doc draws on — code, the assigned obligations, prior docs, runtime behaviour. Every
claim in the doc must trace to one of these.)

-

---

## Examples to verify

(Every code example must run as written. List each example, the command that runs it, and the
expected outcome. The captured output goes in the verification matrix / self-review below.)

| Example | Run command | Expected outcome |
| ------- | ----------- | ---------------- |
|         |             |                  |

---

## Plan

(Written before drafting. What is the lead — the action the reader's question asks about? What
supports it? Which examples and which `file:line` citations does each obligation require?)

1.
2.
3.

---

## Progress checklist

- [ ] Packet read in full (parent contract, scope, assigned obligations, constraints/invariants)
- [ ] Owned paths confirmed ⊆ assigned obligations' `WRITES` surfaces (no `SOL-O005`)
- [ ] Diátaxis frame, audience, and reader's question fixed (one frame only)
- [ ] Source material listed; every claim traces to a source
- [ ] Examples-to-verify table filled
- [ ] Doc outlined — lead first, then support
- [ ] Doc written, leading with what the reader needs to do
- [ ] Every code example run as written; output captured and pasted below
- [ ] Every behaviour claim cross-checked against the code and cited `file:line`
- [ ] Docs I own that contradict this one searched for and reconciled; contradictions in docs I do
      not own promoted
- [ ] `{{cmdFormat}}` run on every touched file (paste output below)
- [ ] `{{cmdValidate}}` / doc-lint steps if the project lints docs (paste output below)
- [ ] TRACE claims written (`IMPLEMENTS` / `PRESERVES` / `CHANGED` / `PROOF` per obligation)
- [ ] Promotion queue resolved (no discovery left unpromoted)
- [ ] Self-review hard gate fully answered

---

## Implementation or step trace

(What was written or updated, per assigned obligation. One short paragraph each.)

-

## Decisions

(Authoring choices the obligations did not constrain — frame, structure, what to include vs cut, and
why. A behaviour claim you could not anchor to a line does NOT go here; it halts the work and goes
to Blockers.)

-

## Findings

(Discoveries about the system that emerged while writing — real issues, contradicting docs you do
not own, behaviour no obligation covers. Promote durable findings before close.)

-

## Promotion queue

(Every out-of-scope discovery with a target + status. ALL must be resolved before this task closes.)

| Discovery | Target | Status |
| --------- | ------ | ------ |
|           |        |        |

---

## Blockers

(Obligations whose intent the code contradicts, or claims you cannot anchor to a line — surfaced for
upstream clarification. Do not paper over a discrepancy in prose; wait for it to be clarified.)

-

## Next steps

(Concrete starting points if this session ends incomplete.)

-

---

## Verification matrix

(Per obligation: the check the spec named, the required proof, the actual pasted proof, the status.
`implement` records only the observed `proof_result`; the verdict is decided downstream.)

| Obligation / criterion | Check binding (`test`/`command`/`manual`) | Required proof | proof_result |
| ---------------------- | ----------------------------------------- | -------------- | ------------ |
|                        |                                           |                |              |

---

## Self-review

Stop. Documentation that hedges, that ships examples that do not run, or that contradicts the code
is worse than no documentation — it actively misleads, and the reader cannot tell. Act as a senior
engineer hostile to vagueness, about to greenlight this doc for the merge gate.

> **Hard gate.** The task is not complete until every question below has a written answer directly
> beneath it, and every command result is the actual pasted output — not a paraphrase, not a
> prediction.

### Verification outputs (paste actual command output — do not paraphrase)

- For each code example: the captured run output proving it works as written:
- `{{cmdFormat}}` on touched files (last 2 lines):
- `{{cmdValidate}}` / doc-lint, if the project lints docs (last 2 lines):

### Did I do only this step?

- Every doc change traces to an assigned obligation, or it is recorded as an unassigned change with
  a reason + authorizing ID or `none`. Anything outside the obligations?
  Answer:

### Owned paths

- No doc file outside the union of assigned `WRITES` surfaces was touched (no `SOL-O005`)?
  Answer:

### Reader-first

- Does the doc lead with what the reader needs to do, or does it bury the action under background?
  Read the first ~100 words — does someone with the reader's question find what they need there?
  Answer:

### Examples actually run

- Did I execute every code example, not just believe it would work? Is the output pasted above? Are
  the examples self-contained (no missing imports, no implied setup)?
  Answer:

### Currency

- Does the doc reflect the code as of this commit? Is every behaviour claim cited to `file:line`?
  Did I grep for docs I own that contradict this one and reconcile them, and promote contradictions
  in docs I do not own? Any `TODO` / `FIXME` / `XXX` left behind?
  Answer:

### Doc-type integrity

- Did I hold one Diátaxis frame, or did the doc drift between tutorial, how-to, reference, and
  explanation? Tutorials are for learning; how-tos are for tasks; references are for lookup;
  explanations are for understanding — mixing them confuses readers in all four modes.
  Answer:

### No hedging

- Did I remove every "should" / "might" / "could" the reader cannot act on, stating the behaviour or
  its condition instead?
  Answer:

### Intent preserved

- Are all constraints, invariants, and non-goals described as they are, not weakened or
  re-interpreted?
  Answer:

### Promotion

- Are all promotion-queue items resolved? Nothing stubbed, deferred, or half-documented?
  Answer:

### Final adversarial step

- Will a reader who has not seen the code understand this? Is anything in this doc going to be wrong
  in three months? Did I actually run the gates, or did I trust my memory? Do not leave the work
  without this final step.
  Answer:

Only when every answer above is written, and every verification output is the real pasted result, is
this task complete.
