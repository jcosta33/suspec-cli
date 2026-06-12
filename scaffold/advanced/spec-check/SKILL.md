---
name: spec-check
type: agent-guide
description: >-
  Check a spec by hand against the core checks and the writing-rules watchlist, and
  report hard errors and warnings — without changing a character of the spec. Use
  before a spec goes to status ready, before tasks are cut from it, or when asked
  "is this spec sound?". Never fix what you find while checking — report it; editing
  is a separate step with the author. Skip when asked to write or improve the spec
  itself.
---

# Checking a spec

A defect in a spec is cheapest to catch before any task is cut from it — after that, every
agent run inherits it. This guide runs the check by hand and produces a short report. A future
`swarm spec check` (swarm-cli) automates exactly this; until then, you are the checker, and the
result is a review checklist, not a gate.

## The one rule: check, don't edit

You read the spec and write a **report**. You change nothing — not a typo, not a "quick fix".
Mixing checking with editing destroys the report's value: the author can no longer see what was
found versus what was silently changed, and a one-word "fix" can change what gets built. Hand
the report to the author (or switch hats explicitly and edit _after_ the report exists).

## The core checks

Run each against the spec (full catalogue with IDs and severities:
`advanced/checks-reference.md`):

| ID   | Check                                                                                  | Severity   |
| ---- | -------------------------------------------------------------------------------------- | ---------- |
| C001 | Every requirement ID (`AC-NNN`) appears exactly once in the file                       | hard error |
| C002 | No other file claims the same frontmatter `id:`; no requirement ID reused across specs | hard error |
| C003 | Every requirement carries a `Verify with:` line                                        | hard error |
| C004 | Each requirement states exactly one strength word (must / must not / should / should not / may) | warning |
| C005 | Non-goals section present and non-empty                                                | warning    |
| C006 | Open questions section present (even if "none")                                        | warning    |
| C007 | No `TBD`, `TODO`, `???`, or unresolved open question at `status: ready`                | hard error |
| C008 | Frontmatter `sources:` names at least one origin                                       | warning    |
| C009 | Every path or ID in `sources:` and cross-references resolves to something that exists  | hard error |

Two notes. C003 asks that the `Verify with:` line _be there_ — a target that doesn't exist yet
is not a spec defect; the requirement simply reviews as Unverified until it does. C004's usual
finding: two strength words in one requirement means two requirements — report it as a split
candidate, don't split it yourself.

## The writing-rules watchlist

Then re-read each requirement for the word families that predict an agent interpreting it
differently than meant: subjective words (robust, clean, seamless) · non-verifiable qualities
(fast, secure, scalable) · vague verbs (handle, support, manage) · loopholes (where feasible,
if practical) · vague qualifiers (significant, as needed) · comparatives with no baseline
(better, faster) · ambiguous quantifiers (all, any, some) · bundling connectives joining
separable behaviors · ambiguous exceptions (unless, except where) · vague references (it,
this, the above).

Apply the **same-line rule**: a risky word is fine when the same line makes it checkable — it
names who does what to what, gives a number with units, or points at a named test. If the line
can't say how you'd check it, report the line. These are warnings by convention, never hard
errors: word-detection is known to be imprecise, so the watchlist advises — a human decides.

Two habits to check alongside: a bare "must not" with no paired affirmative behavior (what
_should_ happen instead?), and uncertainty buried in requirement prose ("probably", "we
think") that belongs in Open questions.

If the spec opts into structured requirements (`format: sol` in the frontmatter), also walk
the SOL check catalogue — same discipline, finer grain. It lives in the Swarm repo at
`docs/reference/checks.md`; the kit does not carry it. The notation itself is in
`advanced/sol-reference.md`.

## The report

Short and sorted — hard errors first, warnings second, watchlist hits third:

```markdown
# Spec check: SPEC-payment-retry (2026-06-11)

Hard errors (fix before status: ready)

- C003 — AC-004 has no `Verify with:` line.
- C007 — "TBD: retry ceiling" in AC-002, but status is `ready`.

Warnings

- C004 — AC-001 says "must … and should …": two requirements bundled.
- C005 — Non-goals section is empty.

Watchlist

- AC-003 "handles errors gracefully" — no same-line criterion; what does the
  caller observe?

Result: 2 hard errors, 2 warnings, 1 watchlist hit. Not ready.
```

Every line points at a requirement ID or section, so the author's fix is unambiguous. "Not
ready" here is your recommendation — whether it blocks anything is the team's policy, not
Swarm's.

## Before you finish

- [ ] The spec file is byte-for-byte unchanged — a diff proves it.
- [ ] Every core check was run, not just the ones that looked likely to fire.
- [ ] Every finding names its check ID (or "watchlist") and the requirement it's on.
- [ ] Hard errors and warnings are separated; the one-line result states both counts.
- [ ] Nothing in the report claims enforcement — it recommends; the team decides.
