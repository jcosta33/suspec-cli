# {{title}}

## Metadata

- Slug: {{slug}}
- Pass: author (audit deliverable)
- Stance: Auditor
- Created: {{createdAt}}
- Status: active
- Deliverable: `audit.md` (plain `.md`, never `*.swarm.md`) at `<your-audits-dir>/{{slug}}.md`

---

> 🔒 **AUDIT SESSION** — produces an observation-only `audit.md`, not code, not a spec.
> No source/config/dependency changes. Copy the `## Deliverable` block to the path above at close.
>
> **Commands:** `cmdValidate` / `cmdTest` resolve from `AGENTS.md > Commands`. If `AGENTS.md` is
> missing or a slot you need is undefined, ask the user before substituting — never guess, because a
> guessed command produces a false observation.

---

## Objective

What area, goal, or initiative this audit covers and why it is being audited now. One paragraph.

---

## Linked inputs

- Triggering ask: <path or one-line description of the human's prompt>
- Prior audit (if deepening): `<your-audits-dir>/<prior-slug>.md` — read with its framing CLOSED

---

## Constraints

- **Observation-only.** Record what *is* and the risk it carries. Assert no intended behaviour,
  prescribe no fix inline, author no `REQ`/`CONSTRAINT`/`INVARIANT`/`INTERFACE` obligation block.
- **No source file changes — audit document only.** Do not switch branches, merge, rebase, or push
  unless instructed.
- Cite `file:line` or other evidence for every observation; vague impressions get demoted or removed.
- Verify dynamic invariants, not just static text — concurrency, lifecycle, resource cleanup.
- Search for "no callers anywhere" across the whole codebase — dead code labelled as working is an observation.
- Proactively read related artifacts under `<your-audits-dir>/`, `<your-specs-dir>/`, `AGENTS.md`,
  and the project skills directory.

---

## Progress checklist

- [ ] Define the measurable goal and the In/Out scope inside the deliverable below
- [ ] List the code paths / artifacts / surfaces inspected
- [ ] If deepening: re-read with the prior audit closed; verify its cited `file:line` references resolve
- [ ] Read each path adversarially
- [ ] Run cross-module caller searches for every public surface
- [ ] Verify dynamic invariants (run `cmdValidate` / `cmdTest` where they surface the property)
- [ ] Draft observations, each grounded in evidence; keep them present-state, never the fix
- [ ] Name risks with their firing conditions
- [ ] Calibrate severity by blast radius; record reasoning for any contestable call
- [ ] Nominate candidate obligations in prose under `## Recommended obligations`
- [ ] Run the pre-deliver visibility gate (completeness table, all ✅)
- [ ] Copy the `## Deliverable` block to its final home

---

## Deliverable

> Copy everything between this line and `--- END DELIVERABLE ---` into `<your-audits-dir>/{{slug}}.md`
> at session close. The file is a plain `.md` working artifact — never name it `*.swarm.md`.
>
> ⚠️ **ADVERSARIAL READING — ALWAYS.** Do not trust that existing code works as intended. Assume the
> codebase is hiding its flaws. The audit is honest observation, not narrative validation.

```
---
type: audit            # or: benchmark | cleanup (same shape and stance)
id: {{slug}}
status: draft
created: {{createdAt}}
updated: {{createdAt}}
---
```

### # Audit: {{title}}

> Stance: **observation-only**. This audit records what *is* — present-state risk, debt, drift,
> duplication, unsafe patterns. It does NOT prescribe a fix inline and authors NO
> `REQ`/`CONSTRAINT`/`INVARIANT`/`INTERFACE` obligation blocks. Obligations come into existence only
> when this audit promotes to a `spec.swarm.md` via the author pass. Until then this is
> non-authoritative evidence.

### Goal

What "good" looks like for this area, as a measurable target. Without a goal, "current state" has no
meaning.

### ## Scope

- **In scope:** (specific code paths / artifacts / surfaces under audit)
- **Out of scope:** (related areas explicitly excluded)

### Code paths / surfaces inspected

- `<path>` — <one-line description of what's there>

### ## Observations

Each observation states what is true *today*, cites the evidence that grounds it, and carries a
severity. State the fact, never the fix.

#### O1 — <name> [BLOCKER | MAJOR | MINOR]

- **Evidence:** `<path>:<line>` / command output / grep result
- **Observation:** <what is true today>
- **Severity reasoning (if contestable):** <blast-radius rationale>

#### O2 — ...

### ## Risks

Things that could go wrong but were NOT observed firing yet. Each names the failure mode and its
trigger — not the remedy.

- **R1** [SEVERITY] — <failure mode> — **fires when:** <condition>
- **R2** ...

### ## Recommended obligations

Candidate obligations a downstream `author` pass would promote into a `spec.swarm.md`, in **plain
prose** — what the spec SHOULD require. Do NOT write SOL obligation blocks here.

- <candidate obligation a future spec should carry>

### Distillation Loss Statement

(If distilled from a long investigation or a prior audit.) **Dropped:** <what>. **Why downstream
doesn't need it:** <why>.

--- END DELIVERABLE ---

---

## Decisions

(Session-level choices — distinct from the deliverable's content.)

- ***

## Assumptions

- [pending]

---

## Blockers

- ***

## Next steps

- *** (concrete starting points if this session ends incomplete)

---

## Self-review

> **Hard gate.** The task is not complete until every question below has a written answer directly
> beneath it, and the completeness table is filled with all ✅. Review as a senior engineer about to
> greenlight this audit as input to spec or refactor work — look for what the audit does *not* say.

### Verification outputs (paste actual command output — do not paraphrase)

- `git status` → (must show only the audit doc; revert anything else — audit sessions are read-only)
- `cmdValidate` (last 2 lines):
- Cross-module caller greps for each public surface (paste results):

### Completeness gate

| Item ID | Evidence present? | Severity | Firing condition (risks) / present-state (obs)? |
| --- | --- | --- | --- |
| O1 | ✅ / ❌ | BLOCKER / MAJOR / MINOR | ✅ / ❌ |

(Any ❌ → halt, fix the row, regenerate the table.)

### Goal and scope

- Is the goal a measurable target, and the scope tight enough that a downstream author can act on
  the audit without it expanding under them?
  Answer:

### Observation specificity

- Does every observation cite `file:line` or other evidence? Are vague concerns sharpened or removed?
  Is every claim present-state — none assert intended behaviour or a fix?
  Answer:

### Stance held

- No obligation blocks? No inline fix? Recommendations in prose only? File named plain `.md`?
  Answer:

### Severity calibration

- Calibrated by blast radius, not discovery order? Reasoning recorded for any contestable call?
  Answer:

### Adversarial completeness

- Prior audit (if any) read with its framing closed? Cross-module callers grepped? Dynamic
  invariants verified rather than assumed from static text? What is the audit NOT saying — which
  invariants did you assume held without checking?
  Answer:
