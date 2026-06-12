---
name: write-spec
type: agent-guide
description: >-
  Write or revise a spec: capture intent as verifiable requirements, never
  implementation. ALWAYS apply when asked to write a spec, requirements, or
  acceptance criteria, or to turn a ticket, intake note, PRD, audit, or research
  doc into one. Do not prescribe mechanisms, leave a requirement without a
  "Verify with:" line, guess past an ambiguity, or introduce a new pattern
  without surveying what exists. Skip for implementing a task, reviewing output,
  small cleanups, and defects with an obvious fix — those need no spec.
---

# Write a spec

A spec is the contract between whoever wants the change and whoever builds it.
Done well, an implementer can build from it with no follow-up questions, and a
reviewer can check every requirement against evidence. Start from
`templates/spec.md`; this guide is how to fill it, not a restatement of it.
Everything below is a convention plus a review checklist — nothing in the kit
enforces it.

## Rules

1. **State intent, not implementation.** Write the observable behavior or the
   bound; the implementer picks the mechanism. _Why: naming the mechanism
   over-constrains the solution and hides the actual requirement._ If a
   mechanism is genuinely load-bearing (a wire format, compatibility with an
   existing API), state it as its own requirement with the reason attached.
2. **One behavior per AC.** "When X, the component must Y." If the sentence
   needs an "and", split it into two ACs. _Why: a compound requirement gets
   partial credit at review — the half not done hides in the conjunction._
3. **Every AC gets a `Verify with:` line.** Prefer a runnable test or command;
   a named manual check is the fallback. _Why: it is the highest-value line in
   the file — the review packet is built from these lines, and a requirement
   nobody can check is a wish._ If you cannot say how to verify it, the AC is
   too vague: reword it to the concrete observable.
4. **Order requirements by importance.** Agents weight earlier instructions
   more — put the requirement you would block a merge over first.
5. **Survey before inventing.** Read what the codebase and workspace already
   have before specifying a new interface, pattern, or boundary. Record what
   you consulted; if you reuse a pattern, name it; if you introduce one, say
   why the existing ones do not fit. _Why: memory is not a survey — recall
   misses the helper added last week, and the duplication surfaces only when
   implementation collides with it._
6. **Record structural decisions with their alternatives.** When the spec
   commits a real choice — a boundary, a data flow, a compatibility stance —
   note what was considered and rejected, in `decisions/` (an ADR) for anything
   with reach beyond this spec, or under `## Dropped from sources` when it is a
   cut. _Why: a decision without alternatives is incomplete — the reader cannot
   tell whether the others were weighed or overlooked._
7. **Halt on ambiguity — never guess.** Any unresolved behavioral decision goes
   under `## Open questions`, not into an AC. A spec with open questions is not
   `status: ready`. _Why: a guess written as a requirement commits a decision
   nobody made._ Either get the answer, or make the call explicitly, record it
   in the spec, and close the question.
8. **Fill `## Dropped from sources`.** What the ticket or PRD asked for that
   this spec deliberately leaves out, and why. Be specific enough to challenge:
   "dropped: implementation details" is a category, not a record — "dropped:
   the CSV export option (only JSON consumers exist)" is. _Why: a silent drop
   looks like an oversight; a recorded drop is a decision someone can
   challenge._
9. **Non-goals are load-bearing.** Say what this spec deliberately does not
   change — it bounds the task and protects the reviewer from scope drift.
10. **Need stricter structure?** Any spec can switch its requirements to
   structured (SOL) form: add `format: sol` to the frontmatter, per the note in
   `templates/spec.md`. Use it for high-risk work; plain form is the default.

## When NOT to write a spec

Forced process on already-clear work hurts more than it helps. Skip the spec
when:

- **Small cleanup** (rename, dead code, comment fix) → a task packet alone.
- **Defect with a clear reproduction** → check the existing spec still holds,
  then a task; do not re-specify working behavior.
- **An open question, not a decided change** → research first; a spec follows
  the decision.
- **A present-state survey of existing code** → an audit; observations are not
  requirements.

## Refuses

| Pressure                                             | Do instead                                                                                                                         |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| "Just write `use Redis` in the spec"                 | State the requirement (the latency bound, the persistence behavior) — or a constraint with its reason if the choice is truly fixed |
| An AC with no way to verify it ("must be intuitive") | Reword to the concrete observable, or cut it                                                                                       |
| "Assume the obvious default and move on"             | Put it in Open questions, or record the decision explicitly — never guess silently                                                 |
| A new boundary with no survey behind it              | Survey first; cite what you read                                                                                                   |
| Editing code "to check the design works"             | The spec session changes the spec and nothing else                                                                                 |
| Speccing a two-line cleanup                          | A task packet alone; say so                                                                                                        |

## Self-review gate

Before handing the spec on, check each — fix, don't rationalize:

- [ ] Pick your vaguest AC: could an implementer build it with no follow-up
      question, and a reviewer check it from its `Verify with:` line alone?
- [ ] No AC names an algorithm, data structure, or library where a behavior
      belongs.
- [ ] Each AC is one behavior; none hides an "and".
- [ ] Requirements are in importance order; non-goals are stated.
- [ ] Every unresolved decision sits in Open questions, and the status is
      honest (`draft` until they close).
- [ ] `Dropped from sources` accounts for everything the source asked for that
      this spec leaves out.
- [ ] You can point at what you surveyed before any new pattern you introduced.
- [ ] `git status` (pasted) shows only spec documents changed — the spec
      session touched no code.
