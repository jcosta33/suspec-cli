---
name: write-inventory
type: agent-guide
description: >-
  Write an inventory — a reconstructive map of what exists before anyone draws new
  boundaries: modules, interfaces and their callers, observed behavior with evidence,
  existing tests, and unknowns. Use before a rewrite, major refactor, migration, or
  sending an agent into unfamiliar brownfield code. Map, don't judge — risks and
  violations belong in an audit; prescriptions belong in the change plan. Skip for a
  simple feature, a small fix, or a single-file cleanup.
---

# Writing an inventory

Brownfield change fails predictably when nobody reconstructs the current contract before moving
code. An audit won't save you here: **audits find violations — the inventory is the contract
map you need before drawing new boundaries.** An audit can correctly flag that a module
violates the architecture, and still leave you unable to fix it safely, because fixing it needs
answers the audit doesn't carry: who calls this function? who subscribes to this event? what do
callers actually rely on? An audit alone is not enough preparation for a rewrite or a major
refactor — write the inventory first — a convention this kit expects before rewrites; nothing enforces it.

Copy the template at `templates/inventory.md`. This guide
is how to fill it well.

## The stance: map, don't judge

An inventory **observes**. Three documents divide brownfield work, and mixing them dilutes all
three:

| Document    | Question                   | Stance                |
| ----------- | -------------------------- | --------------------- |
| Inventory   | What was built here?       | reconstructive — maps |
| Audit       | What's broken or risky?    | adversarial — judges  |
| Change plan | How does it change safely? | prescriptive — plans  |

Catch yourself writing "this is bad" → that's an audit observation. Catch yourself writing
"we should split this" → that's the change plan. The inventory's sentences are all of the form
"this exists, behaves like this, here's the evidence."

## Section by section

- **Scope.** What the map covers and excludes. An inventory of everything is an inventory of
  nothing — bound it to the area the coming change will touch.
- **Current modules.** One row per module: path, responsibility in one line, notes (quirks,
  duplication). This is the territory list the change plan's Affected surfaces draws from.
- **Current interfaces.** The load-bearing section: each function, endpoint, or event — **who
  calls it** and the **observed contract** (what callers actually get, not what a comment
  promises). Grep for callers; don't recall them. An interface row with no caller column filled
  in is a guess wearing a table.
- **Observed behavior.** Behaviors anyone visibly relies on, each with **evidence**: a test
  name, a `file:line`, a pasted output. "The export job assumes `user.email` is never null —
  `export.ts:142`." A behavior row without evidence is an opinion; the change plan will turn
  these rows into preservation guarantees, so the evidence becomes the verify method.
- **Known risks.** Factual hazards you saw while mapping — spread logic, duplicated rules,
  coverage holes. Note them in one line each; deep judgment goes to an audit.
- **Existing tests.** Which test files cover this area. The change plan needs to know where the
  safety net already is — and where it isn't.
- **Unknowns.** The most valuable section: who may depend on shapes, values, or timing you
  _cannot see from here_ — external consumers, dynamic lookups, generated code, anything a grep
  can't reach. Every unknown is a place the coming change can break someone invisibly; naming
  it now is what turns "we didn't know" into "we knew and checked".

## How to gather it

Work from the code, not from memory or docs: grep the callers, run the tests, read the actual
signatures. For each claim, ask "what would I paste to back this?" — and paste it. An inventory
built from recollection inherits every drift between what people believe and what's deployed,
which is precisely the gap it exists to close.

## When to write one — and not

**Write one before:** a rewrite (required), a major refactor, a migration, a module split or
subsystem replacement, a wide dependency upgrade, or sending an agent into brownfield code
nobody fully remembers.

**Skip it for:** a simple feature, a small fix, a single-file cleanup, test-only changes.
This is a convention — nothing in this repository enforces it; the cost of skipping shows up
as a change plan built on guesses.

## Before you finish

- [ ] Every sentence observes; nothing judges or prescribes.
- [ ] Every interface row names its callers — found by search, not recall.
- [ ] Every observed-behavior row carries evidence (test, `file:line`, or output).
- [ ] Unknowns section is honestly populated — an empty one usually means you didn't look.
- [ ] Scope says what's excluded, not just included.

## Next

The inventory feeds the change plan — Baseline cites it, preservation guarantees grow from its
Observed behavior rows (`advanced/write-change-plan/SKILL.md`). If
mapping surfaced real violations worth recording in their own right, write the audit too
(`advanced/write-audit/SKILL.md`).
