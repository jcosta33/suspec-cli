---
name: write-research
type: agent-guide
description: >-
  Write a research note: survey the options and evidence behind ONE decision-informing question,
  and commit to no decision. ALWAYS apply when asked for research, an options / library / API
  comparison, an evidence survey, or a recommendation feeding a later decision. Never present
  opinion as a finding, cite a blog without its primary source, fabricate or leave a claim
  unmarked when you could not verify it, settle an open question by asserting a choice, or write
  requirements. Skip when writing a spec (write-spec), recording the present state of code
  (write-audit), or diagnosing a defect (write-bug-report) — research is their upstream input,
  not a substitute.
---

# Writing a research note

A research note answers one decision-informing question by mapping the options and the evidence,
then stops. Its job is to leave the decision space well-mapped, not to close it: the decision is
made later, when someone lifts the findings into a spec or an ADR. Use the template at
`advanced/research.md`; do not reinvent its sections.

The discipline is evidentiary: cite or omit. A claim that cannot survive a citation falls out of
the document. These rules are conventions backed by review — nothing in this repository enforces
them automatically.

## The Researcher stance

Investigate one question in depth against primary sources. Keep observation distinct from claim,
keep your confidence honest, and refuse to let the inquiry harden into a decision. For a
breadth survey instead — what prevails across many products, patterns, or users — also load
`advanced/persona-surveyor/SKILL.md`; it carries the extra rules breadth needs.

## Rules

### 1. State the one question before searching

Write the question section first, in one or two sentences, naming the decision it informs.
"Which message-broker library minimizes operational complexity at our 10K msg/sec target?" — not
"look into message brokers". If the question will not state concisely, the scope is unclear, and
an unbounded survey returns noise. One note, one question; split a double topic in two.

### 2. Map breadth-first, then drill down

List the sub-topics and candidate options before drilling into any one. Going depth-first on the
first option found is how a survey silently becomes an advocacy piece for whatever you read first.

### 3. Prefer primary sources, in this order

Standards documents (RFC, W3C, ISO) → peer-reviewed papers → official library or API docs → the
library's source code (cite repo + version) → verified product behavior (you ran it; output
recorded) → secondary commentary, only with the primary source it rests on cited too. A
citation's authority is its source's authority; if you cite a blog, find and cite what it is
based on. Survey at least three independent sources — a floor, not a target; the goal is
coverage of the option space, and a recommendation grounded in one source is a single point of
failure.

### 4. Record each finding as R-NNN with its confidence

Give every finding a stable id (`R-001`, `R-002`, …) and four fields: the one durable **claim**,
the **evidence** (source, command, or output — enough for a reader to re-verify), a
**confidence** (high / medium / low), and what it **bears on** (the option or question it
informs). A finding with no evidence field is an opinion with an id; a missing confidence hides
how much weight the recommendation can bear. Stable ids let a spec or ADR cite the exact finding
it rests on.

### 5. Verify product-behavior claims by exercising the product

When a finding asserts how a product behaves, run it (a curl, a sandbox script, a recorded
session) and record the observed output as the evidence — do not read the behavior off the
documentation. Docs and actual behavior diverge often enough that an inferred claim is a guess
wearing a citation.

### 6. Mark every unverified claim `[unconfirmed]` — never fabricate

If you could not reach the source, it was paywalled, or the claim is conjecture from secondary
material, bracket it `[unconfirmed]` rather than presenting it as fact. A fabricated finding
poisons every document that later cites it; the bracket pushes the gap into the page where the
next reader sees it.

### 7. Compare options in a table, not narrative

Where several options exist, put them side by side with named criteria. A narrative comparison
hides which option wins on which axis and forces the next author to re-derive the table.

### 8. Surface what you could not answer as open questions — do not settle them

Every point the inquiry raised but did not answer becomes an open question (`Q-001`, …), with a
note on what answering it would unblock. Resolving it here by asserting a choice breaks the
stance and hides the unknown from the person who should decide.

### 9. Close with an advisory recommendation — or say why none is possible

The recommendation names a specific direction and the R-NNN findings that ground it; it commits
nothing and writes no requirements. If no clear recommendation is possible, say so explicitly
and name the open question that would unblock one — "it depends" without saying _on what_ hands
the reader back the question they came with.

## What does not belong

- Requirements in any form: no AC items, no SOL blocks (`advanced/sol-reference.md`) — those belong in
  the spec someone writes _from_ this note.
- Opinion or "best practice" with no cited primary source.
- A decision. Findings survey; they do not conclude.
- Sources you did not actually consult.
- Code edits — a research session is read-only on source; it produces a document.

## Before you finish

- [ ] The question is stated first and the whole note answers it — no scope drift.
- [ ] Every R-NNN finding has a non-empty evidence field and a confidence value.
- [ ] Every claim you could not verify is marked `[unconfirmed]`; none is dressed as fact.
- [ ] Blogs cited only alongside the primary source they rest on.
- [ ] Product-behavior claims were exercised, with output recorded.
- [ ] Open questions are listed, not silently settled.
- [ ] The recommendation names the findings it rests on — or names the open question blocking one.
