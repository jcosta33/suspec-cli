# Research task: {{title}}

## Metadata

- Slug: {{slug}}
- Stance: Surveyor / Researcher
- Pass: author · task_kind: research-writing
- Created: {{createdAt}}
- Status: active
- Deliverable path: `sources/research/{{slug}}.md` (plain `.md` — no `.swarm.` infix)

---

> 🔒 **RESEARCH (INQUIRY) SESSION** — Produces a `research.md` evidence store, not code and not a
> spec. It SURVEYS options and evidence and commits to NO decision. No source/config/dependency
> changes; no `REQ`/`CONSTRAINT`/`INVARIANT`/`INTERFACE` obligation blocks. Copy the `## Deliverable`
> block to the path above at close.
>
> **Commands:** the only relevant slot is `cmdFormat` (run on the artifact before close), resolved
> from `AGENTS.md > Commands`. A product-behaviour finding's runner is the finding's own command (a
> `curl`, a sandbox script), not a `cmd*` slot. If `AGENTS.md` is missing or a slot is undefined,
> ask the user before substituting.

---

## Objective

The one decision-informing question this research must answer, and the downstream decision it
informs. One paragraph maximum. Be concrete: "Which scheduling approach minimises jitter at 10ms
lookahead?" not "how does scheduling work".

---

## Linked context

- Triggering ask: <the human's prompt, or the upstream artifact with the open question>
- Prior research / findings / audits relevant: `<paths or research-ids>`
- Codebase context (if applicable): `<paths>`

---

## Constraints

- **No source/config/dependency changes — research document only.**
- **No obligation blocks.** A `research.md` authors no `REQ`/`CONSTRAINT`/`INVARIANT`/`INTERFACE`;
  evidence acquires obligation force only when promoted into a `spec.swarm.md` via the author step.
- **Inquiry stance — commit to no decision.** Findings survey; the recommendation is advisory.
- Use search tools aggressively — codebase, official docs, papers, standards, library source.
- Mark unverified claims `[unconfirmed]`; never present them as findings.
- Survey breadth-first, then depth. At least three independent sources (a floor, not a target).

---

## Plan (breadth-first, then depth)

1. Refine the research question in the `## Deliverable` block below.
2. List sub-topics and candidate options (breadth) before drilling in.
3. Conduct the survey; capture sources and `R-NNN` findings as you go.
4. Verify product-behaviour claims by exercising the product; record observed output.
5. Compare options explicitly in a table where multiple exist.
6. Surface unresolved points as open `Q-NNN`.
7. Write an actionable, advisory recommendation naming the `R-NNN` it rests on.
8. Run the visibility gate; copy the `## Deliverable` block to its final home.

## Progress checklist

- [ ] Question stated concisely (one or two sentences)
- [ ] Sources planned breadth-first; ≥3 independent sources consulted
- [ ] Findings recorded as `R-NNN` with Claim · Evidence · Confidence · Bears on
- [ ] Product-behaviour claims verified (not inferred from docs)
- [ ] Options compared side-by-side where multiple exist
- [ ] Open questions captured as `Q-NNN`
- [ ] Recommendation actionable (or: why none + the unblocking `Q-NNN`)
- [ ] Distillation Loss Statement written (if distilling a longer investigation)
- [ ] Visibility gate table all ✅
- [ ] `## Deliverable` block copied to `sources/research/{{slug}}.md`

---

## Deliverable

> Copy everything between this line and `--- END DELIVERABLE ---` into
> `sources/research/{{slug}}.md` at session close, matching the `research.md` frontmatter
> (`type: research`, `id`, `status`, `created`/`updated`).
>
> ⚠️ **EVERY FINDING CITES A SOURCE.** Vague attribution ("according to common practice") is not
> citation. If a claim cannot be traced to a paper, doc, repo, standard, or verified product
> behaviour, mark it `[unconfirmed]` or omit it. Fabricated findings poison every downstream
> artifact that cites `#R-NNN`.

### Mode

Technical (libraries / APIs / algorithms / standards / source code) — or UX/market (user
expectations, competitor behaviour, design patterns). Pick exactly one; if the topic is genuinely
both, split it.

### Question

The specific, decision-informing question. One or two sentences. If it will not state concisely, the
scope is unclear — clarify before continuing.

### Sources

Numbered. Primary sources preferred (standards, peer-reviewed papers, official docs, source code,
verified product behaviour). Each entry carries enough specificity to re-find it. A blog is cited
only alongside the primary source it rests on.

1. [<short-key>] <Author / Org>. *<Title>*. <venue / URL / repo+commit>.
2. [<short-key>] ...

### Findings

Each finding is a citable span with a stable local id `R-NNN` (a downstream artifact references it as
`{{slug}}#R-NNN`; an accepted finding promotes to a standalone `finding.md`). Survey only — draw no
conclusion here.

#### R-001 — <finding title>

- **Claim:** <the one durable fact this finding asserts>
- **Evidence:** <file / command / output / external source — enough to re-verify> [1][3]
- **Confidence:** <high | medium | low>
- **Bears on:** <which downstream question or option-to-be this informs>

#### R-002 — <finding title>

- **Claim:** <...>
- **Evidence:** <...> [2]
- **Confidence:** <...>
- **Bears on:** <...>

#### R-003 — <unverified finding>

- **Claim:** <...> `[unconfirmed]`
- **Evidence:** <why it could not be verified — paywalled, unreachable, conjecture from secondary>
- **Confidence:** low
- **Bears on:** <...>

### Comparison

Where multiple options exist, compare them side-by-side with named criteria. Not narrative — a table
a spec author can lift into a design-decision section.

| Criterion | Option A | Option B | Option C |
| --------- | -------- | -------- | -------- |
|           |          |          |          |

### Recommendation

A specific, actionable direction a spec author can lift into requirements, naming the `R-NNN`
findings that ground it. Advisory, not a committed obligation — authors no obligation block. If no
recommendation is possible, state *why* and name the open `Q-NNN` that would unblock one.

### Open questions

Unresolved points the inquiry surfaced. Each carries forward to the promoted spec as a `QUESTION`
block — do not settle one here by asserting a decision.

- [ ] **Q-001** — <unresolved point; what answering it would unblock>
- [ ] **Q-002** — <...>

### Distillation Loss Statement

(If distilled from a longer investigation.) **Dropped:** <what>. **Why the next stage does not need
it:** <why>.

--- END DELIVERABLE ---

---

## Decisions (session-level — distinct from the deliverable)

- ***

## Findings (session meta — process notes, distinct from the deliverable's `R-NNN` findings)

- ***

## Assumptions

- [pending]

---

## Blockers

- ***

## Next steps

- *** (concrete starting points if this session ends incomplete)

---

## Visibility gate (forced visible output — HARD GATE before close)

> The artifact is not finalisable until every row is ✅. Any ❌ → halt, fix the row, re-output the
> table. Do not deliver the artifact to the user until this table sits here all ✅.

| `R-NNN` | Evidence field non-empty? | Confidence set? | Verified, or `[unconfirmed]`? | Recommendation cites it? |
| ------- | ------------------------- | --------------- | ----------------------------- | ------------------------ |
| R-001   | ✅ / ❌                    | ✅ / ❌          | verified / `[unconfirmed]`    | ✅ / n/a                  |

---

## Self-review

> **Hard gate.** The task is not complete until every question below has a written answer directly
> beneath it. An unanswered question is a skipped check. Review as a senior engineer about to
> greenlight this research as input to a spec.

### The inquiry-stance constraint — check this first

- Does the artifact author any `REQ`/`CONSTRAINT`/`INVARIANT`/`INTERFACE` block? It must not — those
  belong only to a `spec.swarm.md`. Did the recommendation stay advisory rather than reading as a
  committed decision? Are open points left open as `Q-NNN`, not silently settled?
  Answer:

### Filename / placement

- Is the deliverable a plain `.md` (no `.swarm.` infix) under `sources/research/`?
  Answer:

### Source coverage

- Did you consult primary sources (standards, papers, official docs, source code), not just secondary
  commentary? Are ≥3 independent sources cited? Were product-behaviour claims verified by exercising
  the product, not inferred from docs?
  Answer:

### Citation discipline

- Does every `R-NNN` finding's Evidence trace to a numbered source? Are unverified claims marked
  `[unconfirmed]`? Are blogs cited only alongside the primary source they rest on?
  Answer:

### Recommendation actionability

- Could a spec author lift the recommendation directly into requirements? If none is possible, did
  you say why and name the unblocking `Q-NNN`?
  Answer:

### Open questions

- Is each open `Q-NNN` flagged for follow-up with what would close it, so it carries forward as a
  `QUESTION` block on promotion?
  Answer:

### Final polish

- "What else could I do? Did I miss a primary source? Is a competing option more defensible than the
  one I recommended? Did anything I dropped while distilling belong in the Loss Statement?"
  Answer:
