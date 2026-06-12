---
name: split-work
type: agent-guide
description: >-
  Split a spec or change plan into task packets agents can run without colliding:
  every requirement lands in exactly one task, tasks that write the same files are
  sequenced not parallelized, and the dependency order is written down. Use when the
  work is too big for one run or several agents will work at once. Never invent new
  requirements while splitting, and never cut a task from a requirement with an open
  blocking question. Skip when one task packet covers the whole job — most do.
---

# Splitting work into tasks

Most specs become exactly one task packet — if that's true here, write it and stop. Split when
the work is too big for one agent run, or when several agents will work in parallel and a
collision would be expensive. The output is N task packets (template at
`templates/task.md`), each self-contained, plus a few lines
recording the order they run in.

## Cut along requirements, cover them all

Cut task boundaries along the spec's requirement IDs (or the change plan's waves and guarantee
IDs — a plan splits by wave, see the plan's Task split table). Then check coverage both ways:

- **Nothing uncovered.** Every requirement appears in some task's Scope — or is explicitly
  recorded as deferred. A requirement no task owns is the one that silently doesn't get built.
- **Nothing owned twice.** No requirement appears in two tasks' Scopes. Two agents each
  "owning" AC-003 produce two implementations and one merge fight.

While splitting you will spot gaps — behavior the spec never decided. Don't quietly write the
missing requirement into a task packet: route it back to the spec (or its Open questions). A
requirement that exists only in a task was never reviewed as part of the spec. And a
requirement with an open **blocking** question isn't ready to become a task at all — splitting
it commits a guess.

## Tasks that share files are not independent

The collision that matters is **writes**. Before declaring two tasks parallel, list the files
and directories each will touch (each packet's Affected areas) and compare. Same file in two
lists → they are one sequence, not two parallel tasks: pick an order and record it.

```text
Two tasks may run in parallel only if ALL of these hold:
  1. neither depends on the other — directly or through a chain;
  2. they write no file or directory in common;
  3. neither reads files the other writes;
  4. they don't both touch a shared surface — a public interface,
     a schema or migration, generated code, CI or build config.

When in doubt, run them one after the other. Unknown scope counts
as conflicting with everything.
```

The two defaults in that box do the real work. **Unknown serializes:** a task that can't say
what it writes is assumed to collide with everything — sequence it. **Shared serializes:** a
schema migration or a public interface is a hidden meeting point even when the feature work
looks disjoint. Parallelism is the opt-in, earned by demonstrated disjointness; sequencing is
the default. All of this is a convention checked by hand against the listed paths — splitting
work is judgment work, and no Swarm tooling does it for you.

## Write the dependency order down

A few lines next to the packets (in the change plan's Task split, the spec's folder, or the
board) — plain language:

```markdown
## Run order — SPEC-payment-retry

1. TASK-retry-interface — defines the retry interface (first; others build on it)
2. TASK-retry-core — AC-001..AC-003 (after 1)
3. TASK-retry-metrics — AC-004 (after 1; parallel with 2 —
   no shared files, checked 2026-06-11)
```

Interface-defining work goes first: when one task fixes a contract others call, sequencing it
ahead is cheaper than reconciling three guesses about it afterwards. If you find a cycle —
task A waits on B waits on A — the boundary is wrong; merge them or re-cut.

## Each packet stands alone

The agent running a packet sees the packet, not your splitting reasons. Each one carries its
own source links, Scope ("implement or preserve" the listed IDs), **Do not change** (which for
a parallel task includes the files its siblings own), Affected areas, and a Verify line per
requirement. A packet that needs the other packets explained to it isn't disjoint yet — and
"the other agent will handle it" is not a sentence that belongs inside one.

One platform carve-out: a spec shipping the same behavior on N platforms may scope the same
requirement id to N platform tasks — write-disjoint by platform directory — when each task
verifies it on its own platform. At spec level the requirement reads green only when every
platform task's packet shows Pass; per-platform results never substitute for each other.

## Before you finish

- [ ] Every requirement (or guarantee/wave item) is in exactly one task's Scope — none
      uncovered, none duplicated (platform carve-out: N platform tasks may share one id,
      each verifying on its own platform).
- [ ] No new requirement was invented inside a packet; gaps went back to the spec.
- [ ] No task was cut from a requirement with an open blocking question.
- [ ] Every parallel pair passed all four conditions in the box — including the file-overlap
      comparison, done against listed paths, not from memory.
- [ ] The run order is written down where the next person will look.
- [ ] Each packet reads as self-contained: source, scope, do-not-change, verify.
