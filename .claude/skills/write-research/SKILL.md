---
type: pass-guide
name: write-research
pass: author
activates_for_task_kind:
  - research-writing
description: >-
  Author a `research.md` surveying options/evidence behind one decision-informing question,
  committing to NO decision. ALWAYS when a task names `pass: author` + `task_kind: research-
  writing`, or asks for research, an options/library/API comparison, an evidence survey, or a
  recommendation feeding a downstream decision. Never author obligation blocks, present opinion as
  a finding, cite a blog without its primary source, or settle an open question by asserting a
  decision. Skip spec authoring, present-state audits, and defect diagnosis — research is their
  upstream input, not a substitute.
---

# Pass guide: write-research (`author` · `task_kind: research-writing`)

> **This guide is SOFT control (Invariant 2).** It conditions *how* you run an `author` pass on a
> research artifact; it never defines what a `research.md` *is*, what obligation force evidence
> carries, the source-authority order, or the distillation-loss budget — those live in the language
> references and the `research` contract, which govern where they disagree with this guide. Every
> load-bearing term below (the inquiry stance, the `R-NNN`/`Q-NNN` local ids, the source-authority
> order, the loss budget) is *delivered* by Swarm, not redefined here. The `author` pass
> ships no stdlib guide in the base language version; this is the later-release SOFT guide the pass
> contract permits — it adds discipline, grants no new authority. It carries the **Surveyor /
> Researcher** stance: map the decision space well, leave it open, and let every claim that cannot
> survive a citation fall out of the document.

## Purpose

A research artifact answers one decision-informing question by surveying the options-and-evidence
field, then stops. Its job is to leave the decision space well-mapped, not to close it: it asserts
**inquiry**, not intent. This guide prevents the failure the inquiry stance exists to stop — an
inquiry hardening into a decision (or worse, obligation blocks) and being read downstream as an
approved contract, bypassing the `author` pass, the only place surveyed evidence legitimately
acquires binding force. The discipline is *evidentiary*: cite or omit; vague attribution is not
citation; an unverified claim is bracketed, never presented as fact.

This is one branch of the **entry pass** of the nine (`author → lint → improve → lower → decompose →
implement → verify → review → promote`). It produces a detached, citable evidence store one or many
downstream artifacts may reference — the upstream *input* to a spec, never the spec itself, never a
present-state audit or a defect diagnosis.

Two modes share this guide; one artifact picks exactly one:

- **Technical research** — libraries, APIs, algorithms, standards, protocols. Primary sources:
  RFCs, peer-reviewed papers, official docs, source code, verified product behaviour.
- **UX / market research** — user expectations, competitor behaviour, design patterns. Same
  evidentiary discipline, softer subject.

If a topic is genuinely both, split it — one artifact, one mode, one question.

## Project context (the `cmd*` slots)

A research artifact is a document, not code, so it touches almost no project commands. The one slot
that applies is the format-hygiene command (`cmdFormat`, run on the artifact before close) from the
consuming repo's `AGENTS.md > Commands`. If a finding's evidence is *verified product behaviour*, the
command exercising the product is that finding's own runner (a `curl`, a sandbox script), **not** a
`cmd*` slot. If `AGENTS.md` is missing or a needed slot is undefined, **ask the user** — never guess
a command; a guessed command produces a false proof.

## Consumes

- The triggering ask — the human's question, or the upstream artifact (a PRD's open question, a
  spec's unresolved design choice) needing evidence before a decision.
- The `research.md` template's required shape: frontmatter (`type: research`, `id`, `status`,
  `created`/`updated`) and the four body sections in order — **Question · Findings · Open questions
  · Recommendation**. This guide fills that shape; it does not redefine it.
- The Surveyor / Researcher stance the task names. A stance sharpens *what you survey and refuse*; it
  never changes the four-section shape or grants the inquiry decision force.

## Produces

- One `research.md` under the workspace's `sources/research/` — a detached evidence store keyed by a
  stable `id`, committed and durable (not generated, not scratch).
- Findings each carrying a stable local id `R-NNN` (Claim · Evidence · Confidence · Bears on), the
  open `Q-NNN` questions the inquiry surfaced, and an advisory `## Recommendation` naming the
  `R-NNN` findings grounding it.

## Preserves

- **The inquiry stance.** Findings survey; they do not conclude. The `## Recommendation` is a
  *direction a spec author MAY lift*, not a committed obligation — preserved as advice when the
  artifact is later authored into a spec.
- **Durability of `R-NNN` and `Q-NNN`.** Each finding is a citable span a downstream artifact
  references as `<research-id>#R-NNN`; on acceptance it promotes to a standalone `finding.md`. Each
  open question carries forward as a `QUESTION` block in the promoted spec — *not* dropped, *not*
  silently settled here. Letting a finding or open question vanish on promotion is the loss the
  loss budget forbids (see the `lower` pass).
- **Source authority.** A lower-authority inquiry MUST NOT silently override a higher-authority
  artifact (an accepted finding, an ADR); where it appears to contradict one, record the tension as
  an open `Q-NNN`, do not overwrite the higher-authority fact (the authority order is approved
  spec / ADR > task > chat).

## Rejects

These MUST NOT appear in the artifact you deliver:

- **Any obligation block.** A `research.md` MUST NOT author `REQ` / `CONSTRAINT` / `INVARIANT` /
  `INTERFACE` blocks. Surveyed evidence has no obligation force until *promoted into a
  `spec.swarm.md`* by the `author` pass; writing obligation blocks here lets an inquiry be read as an
  approved contract and bypass authoring — exactly what the inquiry stance prevents.
- **A `.swarm.` infix on the filename.** A research artifact is a plain `.md` working source-doc, not
  a compiler-visible spec; the missing infix is the proof it is not parsed as SOL. `*.swarm.md` would
  mis-class it as the one human-authored spec.
- **Opinion presented as a finding.** A `## Findings` claim without a citation is opinion. "Best
  practice" / "common practice" without a cited primary source is opinion in a costume.
- **A decision smuggled into the survey.** Resolving an open `Q-NNN` by asserting a choice, or
  letting the recommendation read as a committed obligation, breaks the stance.
- **A finding that cites a blog without its primary source.** The blog is a pointer; cite the RFC,
  paper, doc, or source it rests on — in addition to, or instead of, the blog.

## Procedure

### 1. State the one decision-informing question before searching

Write `## Question` first, in one or two sentences, naming the decision it informs. *Why:* the
question bounds the research; if you cannot state it concisely the scope is unclear, and an unbounded
survey returns noise instead of a decision-ready map. "Which message-broker library minimises
operational complexity at our 10K msg/sec target?" — not "look into message brokers".

### 2. Plan the survey breadth-first, then depth

List the sub-topics and candidate options before drilling into any one. *Why:* the inquiry stance's
deliverable is a *well-mapped space*; going depth-first on the first option found is how a survey
silently becomes an advocacy piece for whatever you read first.

### 3. Prefer primary sources, in this order

1. Standards documents (RFC, W3C, ISO). 2. Peer-reviewed papers. 3. Official library / API docs.
4. The library's source code (cite repo + commit/version). 5. Verified product behaviour
(interactive testing, recorded session). 6. Secondary commentary — only with the primary source it
rests on cited too. *Why:* a citation's authority is its source's authority; secondary commentary
inherits the errors of whatever it summarised, so the higher you climb the less you inherit. If you
cite a blog, find and cite what it is based on.

### 4. Survey at least three independent sources — coverage, not a count

Three is a floor, not a target; the discipline is *coverage of the option space*, not citation
tally. *Why:* a recommendation grounded in one source is a single point of failure; three
independent sources is the minimum that lets a disagreement surface. A small topic may need only
three; a broad one needs more.

### 5. Record each finding as `R-NNN` with Claim · Evidence · Confidence · Bears on

Give every finding a stable local id `R-NNN` and the four fields: the one durable **Claim**, the
**Evidence** (file / command / output / external source — enough to re-verify), the **Confidence**
(`high | medium | low`), and what it **Bears on** (the downstream question or option-to-be). *Why:*
`R-NNN` is the load-bearing handle — what a downstream artifact cites as `<research-id>#R-NNN` and
what an accepted finding promotes to a `finding.md` under; a finding with no Evidence field is an
opinion with an id, and a missing Confidence hides how much weight the recommendation can bear.

### 6. Verify product-behaviour claims; do not infer behaviour from docs

When a finding asserts how a product behaves, exercise the product (curl, sandbox, recorded session)
and record the observed output as the Evidence — do not read it off the documentation. *Why:* doc
and actual behaviour diverge often enough that an inferred claim is a guess wearing a citation; the
run is what converts the guess into evidence.

### 7. Compare options explicitly in a table, not narrative

Where multiple options exist, put them side-by-side with named criteria. *Why:* a narrative
comparison hides which option wins on which axis and forces the spec author to re-derive the table; a
side-by-side table lifts directly into a spec's design-decision section.

### 8. Mark every unverified claim `[unconfirmed]` — never fabricate

If you could not reach the source, it was paywalled, or the claim is conjecture from secondary
material, bracket it `[unconfirmed]` rather than presenting it as fact. *Why:* a fabricated finding
poisons every downstream artifact citing `#R-NNN` and every spec authored from it; the bracket is the
forced-visible signal that pushes the gap into the document where the next reader sees it instead of
trusting it.

### 9. Surface unresolved points as open `Q-NNN` — do not settle them

Every point the inquiry raised but did not answer becomes an open `Q-NNN`, with what answering it
would unblock. *Why:* an open question carries forward as a `QUESTION` block in the promoted spec;
resolving it here by asserting a decision breaks the inquiry stance and hides the unknown from the
author pass that should adjudicate it.

### 10. Write an actionable, advisory recommendation — or say why none is possible

`## Recommendation` states a specific direction a spec author can lift into requirements, naming the
`R-NNN` findings that ground it; it authors no obligation block. If no clear recommendation is
possible, *say so explicitly* and name the open `Q-NNN` that would unblock one. *Why:* "it depends"
without saying *on what* is a non-deliverable — it hands the spec author the same unanswered question
they came with; naming the unblocking `Q-NNN` makes even a no-recommendation result useful.

### 11. UX / market mode — concrete examples, observed vs claimed

In UX/market mode: "common practice" cites at least three concrete examples (one is not a pattern);
user-expectation claims cite the research that produced them, not intuition; and distinguish *what
users do* (observed) from *what users say they want* (claimed) — they differ. Where competitors
disagree, compare explicitly and state which approach this project should follow and why. *Why:* a
softer subject is exactly where unsourced intuition slips in as fact, so the evidentiary bar is
identical to technical mode.

### 12. State the distillation loss when distilling from a longer investigation

If the artifact distils a long-running investigation (a transcript, a scratch task file), append a
short statement of what was **dropped** and **why the next stage does not need it**. *Why:* the
loss budget (the `lower` pass) governs what may be dropped across the
boundary; an undeclared drop is silent loss, and
the next author cannot tell a deliberate omission from a forgotten finding.

### 13. Pre-deliver visibility gate (forced visible output) — HARD GATE

Do not finalise until **every** `R-NNN` finding carries a non-empty Evidence field and a Confidence
value, every unverified claim is bracketed `[unconfirmed]`, and the recommendation names the `R-NNN`
it rests on. Before declaring done, output this table into the task file:

| `R-NNN` | Evidence field non-empty? | Confidence set? | Verified, or `[unconfirmed]`? |
| ------- | ------------------------- | --------------- | ----------------------------- |
| R-001   | ✅ / ❌                    | ✅ / ❌          | verified / `[unconfirmed]`    |

Any ❌ row means the artifact is **not finalisable** — halt, fix the row, output the table again. Do
not deliver until this table sits in the task file with every cell ✅. *Why:* citation and
verification are otherwise invisible compliance — a missing `R-NNN` Evidence field or an unbracketed
conjecture is the quiet execution-drift failure where the document *looks* complete; forcing the
table into the file converts that silent gap into a marker the next reviewer can see.

## What does not belong

- **In `## Findings`:** opinion, intuition, "best practice" with no cited primary source; any `REQ` /
  `CONSTRAINT` / `INVARIANT` / `INTERFACE` block; a conclusion (findings survey, they do not decide).
- **In the evidence:** sources you did not consult; a blog cited without the primary source it rests
  on; a product-behaviour claim read off the docs instead of exercised.
- **In `## Recommendation`:** "it depends" without saying on what; "further investigation needed"
  without naming the investigation (that is a named open `Q-NNN`); an obligation block of any kind.
- **In the filename:** a `.swarm.` infix — a research artifact is plain `.md`.

## Anti-patterns

- ❌ Authoring `REQ`/`CONSTRAINT`/`INVARIANT`/`INTERFACE` blocks in the research → survey the
  evidence; obligation force is acquired only when the artifact promotes into a `spec.swarm.md`.
- ❌ Opinion presented as a finding → every `## Findings` claim cites a source, or it is `[unconfirmed]`.
- ❌ Settling an open question by asserting a decision → record it as an open `Q-NNN`; let the author
  pass adjudicate.
- ❌ "It depends" with no *on what* → state the condition, or name the open `Q-NNN` that would unblock
  a recommendation.
- ❌ Citing a blog as the source → find and cite the RFC / paper / doc / code it rests on.
- ❌ Inferring product behaviour from documentation → exercise the product, record the observed output
  as Evidence.
- ❌ One example treated as a pattern (UX mode) → "common practice" needs at least three concrete
  examples.
- ❌ Conflating "users say they want X" with "users actually do X" (UX mode) → record observed and
  claimed as distinct.
- ❌ Research with no decision-informing question → write `## Question` first; if it will not state
  concisely, the scope is unclear.
- ❌ A `.swarm.md` filename → plain `.md`; the missing infix is what keeps it from being parsed as a
  spec.

## Bundled resources

- `references/task-template.md` — a fillable research-task frame combining the workflow scaffold
  (metadata, the `cmd*` slot note, constraints, plan, progress checklist, decisions, session
  findings, and a self-review hard gate covering source coverage, citation discipline, recommendation
  actionability, and open questions) with the deliverable structure inlined as a `## Deliverable`
  block (research question, sources, `R-NNN` findings, comparison table, advisory recommendation,
  open `Q-NNN` questions, distillation-loss statement). It scores on the multi-stage-plan,
  state-separate-from-the-deliverable, and visibility-gate criteria, so it ships a template.
  Instantiate it into your task file, resolve `cmdFormat` from `AGENTS.md > Commands` (asking the
  user for any undefined slot), and copy the `## Deliverable` block to its final home under
  `sources/research/<slug>.md` at session close.
