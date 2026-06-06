---
type: skill
name: implement-and-verify
description: >-
  Use in a CODE repo to implement a Swarm spec's obligation and prove it. ALWAYS apply when implementing
  against a `*.swarm.md` obligation (a `REQ`/`CONSTRAINT`/`INVARIANT`/`INTERFACE` acceptance criterion) that
  a spec hands you — especially when running agents in parallel worktrees and trusting the result. Implement
  ONLY the assigned obligation(s), prove each with its `VERIFY BY` (real run output, not "looks done"), stay
  in scope, and push any durable learning/decision/drift back to the spec repo as a linked PR. Never leave
  Swarm scratch files in the code repo. Skip authoring/linting/improving specs — that happens in the spec repo.
---

# Implement & verify against a Swarm spec

The one skill a **code repo** needs. It is the trust backbone: it's what lets you hand a spec to parallel
agents in worktrees and believe the green. **SOFT control** — discipline, not a runtime; nothing here is
enforced, so the trust comes from doing it.

You do **not** need to know the SOL grammar. A good spec is self-legible: read the obligation's English-shaped
clauses (`WHEN … THE <actor> MUST <response> VERIFY BY <type>:<adapter>:<artifact>`) and act on them.

## What you're given
- One or more **obligations** (by id, e.g. `AC-001`, `C-002`) from a `*.swarm.md` spec — the *desired truth*.
  The spec may live in this repo (co-located) or in a separate **spec repo** (referenced by id).
- The repo's `AGENTS.md > Commands` table, which resolves a `VERIFY BY` clause's `<adapter>` (a `cmd*` slot)
  to a real command.

## Procedure
1. **Scope to the assigned obligations only.** Implement what their clauses require — no more. Behaviour
   outside the assigned ids is out of scope; if you discover it's needed, surface it (step 6), don't sneak it in.
2. **Implement** in the code.
3. **Prove each obligation with its `VERIFY BY`.** Resolve the `<adapter>` through `AGENTS.md > Commands`,
   **run it, and paste the real output** (command + exit + the relevant lines). A claim with no run output is
   **not** proof; "looks done", a structurally-valid result, and a stale pre-edit run are non-proofs. For an
   obligation marked `RISK high|critical`, a single happy-path test is inadequate — exercise the surfaces that
   can break it (edge/error/concurrency), and say what you covered.
4. **The PR is the trace and the verdict.** In the PR, **name the obligation ids** it satisfies and attach the
   proof (the run output / CI link). The PR + CI + review *are* the trace and verdict — you do **not** write a
   `trace.md`/`review.md` into the code repo (that's opt-in, audit-only).
5. **Keep the repo pristine.** Any working files an agent generates (task frames, scratch) are gitignored or
   not written at all. Swarm leaves no litter in a code repo.
6. **Push durable outcomes back to the spec repo.** A reusable learning, a decision, or discovered **drift**
   (the code can't satisfy the obligation as written, or the spec is now stale) goes to the **spec repo** as
   its own PR, linked to this code PR — never as a file in the code repo, and never by editing intent locally.

## Parallel worktrees
Each agent takes a **write-disjoint** obligation (or packet) so they don't collide, and verifies its own
obligations independently. Trust the parallel run only to the degree each obligation's proof is real (step 3) —
unproven green is not done.

## Anti-patterns
- ❌ Implementing beyond the assigned obligation ("while I'm here…") → out of scope; surface it instead.
- ❌ Reporting PASS with no command output, or from a pre-edit run → a non-proof; re-run and paste it.
- ❌ Writing `trace.md`/`review.md`/task files into the code repo → the PR is the trace; keep the repo clean.
- ❌ Editing the spec from the code repo → intent lives in the spec; propose the change back as a linked PR.
- ❌ Treating a `RISK high|critical` obligation as proven by one happy-path test.

## Related
- The proof discipline in depth — `empirical-proof` (if installed): proof types, what is NOT a proof, oracle
  adequacy. This skill carries the operative subset inline.
- The full authoring/verification model lives in the **spec repo** and the Swarm docs — a code repo doesn't
  need it.
