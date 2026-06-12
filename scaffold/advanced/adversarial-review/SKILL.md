---
name: adversarial-review
description: Review another agent's work hostile-to-plausible-explanations. ALWAYS apply this skill when reviewing a branch, a follow-up revision after a previous review, an existing audit you are deepening, a bug you are root-causing, or a codebase area you are auditing — even if the work looks correct on the surface. Do not approve, merge, or sign off on a worker's pasted output alone — run the project's validation and tests yourself in your own worktree first. Skip this skill for original authoring work — apply it only when something already exists to be reviewed.
---

# Skill: adversarial-review

## Purpose

Reviews fail when the reviewer accepts the worker's framing. The discipline of *adversarial review* is to set the worker's claims aside, read the code with fresh eyes, and run the validators yourself. Apply this discipline whenever you are reviewing a branch, deepening an audit, or hunting a bug — the same hostility-to-plausible-explanations applies in all three.

## Project context (the AGENTS.md contract)

Resolves project commands via the consuming repo's `AGENTS.md > Commands` table — the `cmdTest` / `cmdLint` / `cmdBuild` / `cmdTypecheck` slots, plus any project-specific validation row; ask the user if the project keeps an architectural-rules check outside the table. If `AGENTS.md` is missing or a slot is undefined, ask the user which command to run before pasting any verification output — do not guess.

## Core rules

### 1. Run validation yourself

The reviewer runs the project's install, validate, and test commands themselves, in their own worktree, with the branch checked out. The worker's pasted output is *evidence the worker ran the command at some past moment*; it is not evidence the command passes *now in your worktree*.

### 2. The six adversarial questions

For every diff, walk these six questions in order:

1. **What was the intent?** State, in your own words, what the change is supposed to do. If you can't, the diff is unclear or you haven't read enough.
2. **Does the code do it?** For each requirement ID in the task's Scope (and each preservation guarantee, when a change plan is in play), point at the lines that address it.
3. **What didn't change that should have?** Renamed types, callers, tests, docs, dependency-graph rules. Often the bug is in *unchanged* code that needed updating.
4. **What edge cases are unhandled?** Empty input, max-size input, concurrent calls, partial state, unicode, time-zone boundaries — pick the ones relevant to the change and check.
5. **What production failure modes are possible?** Network errors, race conditions, resource exhaustion, retry storms, rate-limit collisions.
6. **What was claimed but not verified?** Comb the worker's task file for "should never", "harmless", "by happy accident" — these are confessions of unverified assumptions.

Each question gets answered explicitly. If a question doesn't apply to this change, state that — don't skip silently.

### 3. Cross-module caller search

For every changed public surface, grep the codebase for callers. Read the calling code, not just the changed module. Lifecycle bugs, id-collision hazards, and contract mismatches live in the calling code as often as in the modified module.

```bash
git grep -n '<changed-symbol>' src/ tests/
```

Paste the output (or summarise the call-site count and read each).

### 4. Findings cite file and line

Every finding has:

- **Severity** (BLOCKER / MAJOR / MINOR)
- **File:line**
- **Specific issue** (what is wrong, not just "looks rough")
- **Fix sketch** (what would close it)

Vague concerns are not findings. Either sharpen them to file-line-specific findings, or remove them.

### 5. Mistrust confident-sounding language

Worker task files often contain:

- "Should never happen…"
- "Harmless edge case…"
- "By happy accident, this still works…"
- "Edge case unlikely to fire…"

These are *confessions of unverified assumptions*, not assurances. Investigate each one.

### 6. Do not trust the diff to be the work

Verify that the worker's small diff is actually the work that was asked for. A diff that touches 3 files when the spec called for 8 is *evidence* something was missed (or the scope is misunderstood).

## What does not belong

- **Style preferences as findings.** Style consistency is a finding when it violates project convention; "I'd write it differently" is not.
- **Soft-language findings.** "Maybe consider possibly looking at…" — sharpen or remove.
- **Findings without fix sketches.** "X is wrong; figure it out" wastes the worker's time.
- **Approving without running validation yourself.**

## Anti-patterns

- Approving a branch because the worker's Self-review claims everything passed
- Reviewing only the diff and missing the unchanged callers
- Soft-language findings
- Inheriting the worker's framing instead of reading the code with fresh eyes
- Demoting findings to "MINOR" to avoid blocking the worker
- Approving a small diff without confirming the small diff is the right work

## Bundled resources

- `references/task-template.md` — a fillable task template for a review session: diff overview, findings table, suggested decision, and a self-review hard gate. Copy it into your project's task file, substitute the project-specific commands and slugs (`{{...}}` placeholders), and fill it in as you work.
