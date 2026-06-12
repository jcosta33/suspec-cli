---
name: review-output
type: agent-guide
description: >-
  Build the review packet for a finished task: refute by default, re-run the
  checks yourself, fill the coverage tables, route exceptions to a human.
  ALWAYS apply when asked to review agent output, a finished task, or a PR
  against a spec, or to fill anything in `reviews/`. Do not mark Pass from the
  worker's pasted output alone, leave a Pass with an empty Evidence cell, or
  review a change you implemented. Skip for writing specs and implementing
  tasks.
---

# Review agent output

The review packet (`templates/review.md`) turns a large diff into requirement
coverage, evidence, and a short list of things a human must look at. Your
stance is refute-by-default: "done" is a claim until evidence forces you to
agree. The hard rules below are review-checklist conventions — nothing in the
kit enforces them. (Future CLI: `swarm review` will draft this packet — today
you or your agent fills the template.)

## Rules

1. **Never review your own implementation.** If you wrote the diff, hand the
   review to another agent or a person. _Why: authors favor their own output;
   independence is what makes the packet worth reading._
2. **The worker's paste is a claim; your run is evidence.** Re-run the checks
   yourself wherever possible — resolve commands from the AGENTS.md `Commands`
   table; if a needed command is missing there, ask, never guess. Paste _your_
   output into the Evidence column. A check you could not run is Unverified,
   not Pass. _Why: a paste shows the command ran at some past moment, not that
   it passes now._
3. **Fill the requirement coverage table** — one row per AC in the task's
   scope; result is one of Pass · Fail · Unverified · Blocked. A Pass needs
   pasted output, a CI link, or, for a manual Verify method, a named human's
   recorded observation (who judged, what they saw). **An empty Evidence cell
   means Unverified, never Pass.** Read the task packet's `## Run summary`
   first — it indexes the Verify pastes the cells cite. A scoped AC with no row is a missing row, not a free pass.
4. **Spot-check at least one green row.** Open its evidence and read it: does
   the output actually exercise that AC, and does it say what the row claims?
   _Why: a fully green table invites rubber-stamping; one real probe breaks
   the habit._
5. **Change-plan guarantees are rows too.** When the task executes a change
   plan, every preservation guarantee gets its own row in the change-plan
   coverage table — same columns, same rules.
6. **Read what did not change.** Callers of every changed public surface,
   tests, docs. _Why: the diff shows what changed, not what the change broke
   elsewhere._ Treat "should never happen", "harmless", and "edge case
   unlikely" in the worker's summary as flags to check, not assurances.
7. **Route the exceptions under `## Human attention`** — that list, not the
   diff, is what a human reads: unverified or failed requirements ·
   out-of-scope changes · risky files · missing test output · changed public
   interfaces · DB migrations · security-sensitive changes · new finding
   candidates · blocked questions. One line each: what, why it matters,
   suggested action. "No exceptions" is a valid — and reportable — outcome.
8. **The suggested decision follows the table, not the summary's confidence.**
   "Merge" only when every scoped row is Pass and no exception is open;
   "Merge with waiver" only with the record — who waived · which rows · why ·
   expiry — and the packet status `waived`; otherwise "Block until …", naming
   the specific rows or exceptions.
9. **Save finding candidates.** Anything durable the task surfaced — a fact, a
   decision, a pattern, a gotcha — becomes a file in `findings/` via
   `templates/finding.md`, linked from the packet. _Why: lessons that live
   only in a session transcript die with it._
10. **Keep the packet status honest.** `pass` only when the tables support it;
    `blocked` or `needs-human` otherwise; `draft` while you are still working.
    Never soften a Fail to avoid blocking, and never inflate a nit into a
    blocker.
10. **Close the board row.** When the decision lands, flip the task's row on
    `status.md` — review-ready → closed (or blocked) — and put the packet
    link in the row. The sessions maintain the board; the human reads it.

## Refuses

| Red flag                                                 | Action                                                               |
| -------------------------------------------------------- | -------------------------------------------------------------------- |
| "Tests passed" with no command, exit, or output          | Row is Unverified; produce or demand the real run                    |
| Accepting the worker's paste as final evidence           | Re-run it yourself; if you cannot, mark Unverified and say why       |
| Evidence that addresses a neighbouring AC, not this one  | Unverified for this row — evidence must match the ID                 |
| Schema-valid / well-formed output offered as correctness | Shape is not truth; check the value, not the format                  |
| Your run disagrees with the worker's paste               | The discrepancy is itself a finding — investigate, do not dismiss it |
| A vague concern ("looks rough")                          | Sharpen it to a file and line, or drop it                            |
| Fixing the code mid-review                               | Review judges; the fix is a new task                                 |
| Reviewing a diff you authored                            | Hand it off; record that you did                                     |

## Self-review gate

Before setting the packet status:

- [ ] Every scoped AC (and change-plan guarantee) has a row; no Evidence cell
      is empty on a Pass.
- [ ] Every Pass rests on output you ran or a CI link you opened; you
      spot-checked at least one green row's evidence.
- [ ] You searched callers of changed public surfaces, not just the diff.
- [ ] Each Human-attention entry has what / why / suggested action; nothing on
      the exception list was silently skipped.
- [ ] The suggested decision follows strictly from the rows — no Fail,
      Unverified, or Blocked hiding behind a "Merge".
- [ ] Finding candidates are saved to `findings/`, not left in prose.
- [ ] You did not author the change you judged.
