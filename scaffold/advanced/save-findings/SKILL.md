---
name: save-findings
type: agent-guide
description: >-
  Close a task by saving what it taught: sweep the task packet's Findings section,
  write one finding file per durable lesson with its evidence, and update the board.
  Use at Close — after the review, before the task is marked done — or whenever a
  session surfaced something the next task would want to know. One claim per finding,
  evidence attached, searchable title. Skip mid-task; the packet's Findings section
  is the staging area until Close.
---

# Saving findings

An agent session ends and its context evaporates — anything not written to a file is gone, and
the next task re-discovers it the expensive way. Close is where you stop that: **before closing
a task, record anything durable as a finding.** This is a convention — nothing in this
repository enforces it; it costs one short file per lesson.

## The close flow

1. **Sweep the staging area.** Read the task packet's `## Findings` section and the run
   summary. List every candidate: facts learned, quirks hit, decisions made, gotchas survived.
2. **Decide each candidate deliberately.** Durable → a finding file. Not durable → drop it,
   knowingly. The failure mode is neither saving nor dropping — candidates rotting in a closed
   task packet nobody reopens.
3. **Write one file per lesson** in `findings/`, from the template at
   `templates/finding.md`: what we learned (one claim),
   the evidence, where it applies, where it does not, what to do differently next time. The
   `from:` field names the task or review it came out of — a finding without provenance can't
   be re-checked when someone doubts it later.
4. **Update the board** (`status.md`): mark the task closed with a link to its review packet,
   and list each new finding as pending acceptance so it gets read — and accepted or marked
   stale — instead of rotting.
5. **Route the outgrown ones.** A decision big enough to outlive the feature is an ADR in
   `decisions/`, not a finding. New intended behavior is a spec amendment, not a finding.
   A reproduced defect is a bug report. The finding file is for reusable project facts.

## What counts as durable

The test: _would the next task in this area want to know this?_

- **Provider quirks** — "the payments sandbox rate-limits at 10 rps; the docs say 100."
- **Hidden contracts** — "the export job assumes `user.email` is never null."
- **Decisions with rationale** — "we retry idempotent calls only; see the review packet."
- **Gotchas** — "the suite passes locally with a stale fixture; regenerate first."

What does **not** count: run logs, transcripts, "the tests passed" (that lives in the review
packet), local environment details, anything you'd never search for again.

## Writing one well

- **One claim per finding.** Writing three? Write three files — a grab-bag finding is
  unsearchable and un-retractable.
- **Evidence attached.** Link the review packet, PR, or pasted output that grounds the claim.
  An evidence-free finding is a rumor with a filename.
- **Bound it honestly.** "Where it does not apply" is what keeps a true-in-March finding from
  misleading someone in November.
- **Title you'd search for.** Findings come back through grep and the board — there is no
  retrieval engine. "payments-sandbox-rate-limit" gets found; "notes-from-task-12" doesn't.

## How findings come back

Two cheap channels: the **board** lists findings pending acceptance, and **grep** finds plain
markdown with real words in it. When you write the next spec or task packet touching the same
area, link the finding in its `sources:` — that's the whole feedback loop: lessons from one
task become input to the next.

## When you outgrow this

A `findings/` folder plus grep carries a team surprisingly far. Teams with hundreds of
findings, several repos, or recurring cross-feature patterns graduate to the advanced memory
model in the Swarm documentation (`docs/reference/memory.md` in the Swarm repo) — a
load-when index, a glossary, patterns built from corroborated findings, and the full promotion
protocol that this close flow is the simple core of. Adopt it when grep stops being enough,
not before.

## Before you finish

- [ ] Every candidate in the task packet's Findings section was saved or deliberately dropped.
- [ ] Each saved finding states one claim, with evidence linked and a `from:` provenance.
- [ ] Each finding says where it applies _and_ where it does not.
- [ ] Decisions that outlive the feature went to `decisions/` as ADRs, not into `findings/`.
- [ ] The board shows the task closed (review packet linked) and new findings pending
      acceptance.
