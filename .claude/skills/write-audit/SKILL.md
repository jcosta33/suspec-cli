---
type: pass-guide
name: write-audit
pass: author
activates_for_task_kind:
  - audit-writing
  - deepen-audit
description: >-
  Author an `audit.md`: present-state risk/debt/drift, observation-only, each evidence-grounded
  (file:line, output) and severity-calibrated by blast radius. ALWAYS apply on `pass: author` with
  an audit deliverable, or for a code audit, tech-debt survey, cleanup/benchmark report, or
  quality assessment of existing code — incl. deepening one. Never assert intended behaviour,
  prescribe an inline fix, author obligation blocks, leave an observation ungrounded, or leave a
  risk without its firing condition. Skip authoring a forward-looking spec, reproducing a defect,
  or surveying open options.
---

# Pass guide: write-audit (`author` · audit deliverable)

> **This guide is SOFT control.** It tells you *how* to author an audit; it never defines
> the artifact's stance, obligation-block semantics, severity meaning, source-authority order, or
> what gates the spec boundary — the language and the artifact and pass contracts fix those, and
> this guide only *applies* them. Where guide and contract or spec disagree, they govern. It carries
> the **Auditor** stance: read the system as if it hides its flaws, record only what *is*, and assert
> nothing the evidence does not show.

## Purpose

An audit makes a codebase area *legible* so downstream work can be planned — it records what is
true **today**, grounds each claim in evidence, names the risk that state carries, and stops there.
Audits fail in two directions: they drift into prescription (telling the reader what to build, which
is intent and belongs in a spec), or they stay vague (impressions and TODO-scrapes with no anchor, on
which a downstream author cannot act). This guide pins the audit to its **observation-only** stance:
specific, severity-calibrated, evidence-anchored.

`author` is the entry pass of the nine (`author → lint → improve → lower → decompose → implement →
verify → review → promote`) — the boundary where unstructured intent becomes a compiler-visible
spec. An audit is *not* that spec: it is one of `author`'s recognized **parents**, a working `.md`
artifact whose observed risk acquires obligation force only when a later `author` pass promotes its
recommendations *into* a `spec.swarm.md`. This guide produces that parent.

## Project context (the `cmd*` slots)

To verify a dynamic invariant — running validation, exercising lifecycle code, or checking that a
claimed property holds at runtime — resolve project commands through the consuming repo's `AGENTS.md
> Commands` slots: the aggregate validation command (`cmdValidate`) and the test command (`cmdTest`).
If `AGENTS.md` is missing or a needed slot is undefined, **ask the user** which command to run — never
guess; a guessed command produces a false observation, and an audit's whole value is grounded claims.

## Consumes

- The code, artifacts, or surfaces under audit, plus any triggering ask and any prior audit you are
  deepening. Read the prior audit with its framing **closed** — re-derive every finding from the
  code, never inherit a conclusion.
- The Auditor stance the task names. A stance sharpens *what you look for and refuse to assert*; it
  never changes the procedure or the artifact's stance rules.

## Produces

- One `audit.md` working artifact (plain `.md`, never `*.swarm.md` — the `.swarm.` infix marks the
  one human-authored compiler-visible spec, so naming an audit that way mislabels an observation as
  an approved contract). Required sections, **in order**: `## Scope` (In/Out), `## Observations`,
  `## Risks`, `## Recommended obligations`, under a title and the observation-only stance note. A
  document missing a required section or ordering them wrong is the required-section defect `SOL-S012`.
  This guide fills that shape; it does not redefine it.
- The two named specializations — a **benchmark report** (observation-only performance measurement)
  and a **cleanup report** (observation-only debt/risk inventory) — reuse this exact shape and
  stance; they add no new sections or block types.

## Preserves

- **The observation-only stance.** Everything the audit asserts is *what is true now* and the risk
  that state carries; it asserts no new intended behaviour. This stance is normative and MUST be
  preserved when the audit is later promoted into a spec.
- **The evidence anchor.** Every observation cites the observable that grounds it. An ungrounded,
  fact-shaped claim is a defect, not a finding.

## Rejects

These MUST NOT appear in a finalised audit:

- **An obligation block.** An audit MUST NOT author `REQ` / `CONSTRAINT` / `INVARIANT` / `INTERFACE`
  blocks. Observed risk carries no binding force here; it acquires force only when a downstream
  `author` pass promotes it into a `spec.swarm.md`. An obligation block in an audit lets an
  observation be read as an approved contract and bypass authoring — the exact failure the
  observation-only stance exists to prevent.
- **A prescribed fix.** An audit names what *is* and the risk it carries, not the remedy inline. The
  remedy is a downstream decision owned by an author pass (for a spec change) or a fix task (for a
  defect). Nominating *candidate obligations a future spec should carry*, in plain prose, is expected
  — that is the `## Recommended obligations` section. Writing them as remedies-to-apply is not.
- **An assertion of intended behaviour.** What the system *should* do is intent; it belongs to a
  spec, not to an observation of the current state.
- **A vague or ungrounded finding.** An observation with no `file:line` / command-output / grep
  anchor, or a "could be better" impression, gets sharpened until it cites evidence, or removed.

## Procedure

### 1. State the goal and bound the scope first

Without a goal, "current state" has no meaning. Write a measurable goal ("make the billing module's
invariants explicit and surface anything blocking a Q3 change to the pricing engine"), not a vague
intention ("improve billing"). Then write `## Scope` with both **In scope** and **Out of scope**.
*Why:* an unstated boundary makes the audit unfalsifiable, and the scope silently expands under a
downstream author who tries to act on it.

### 2. Read adversarially, with any prior audit closed

Approach the code assuming it hides its flaws. If deepening a prior audit, set its framing aside and
re-read with fresh eyes; verify its cited `file:line` references still resolve. *Why:* findings are
observation, not narrative validation of a previous pass; inheriting a prior conclusion is how a real
defect stays hidden across two audits.

### 3. Ground every observation in evidence

Each item in `## Observations` cites the observable that grounds it: `<path>:<line>`, command
output, a grep result, or another verifiable artefact. State the fact, never the fix. *Why:* the
citation makes the observation falsifiable and lets the next reader navigate straight to it; an
ungrounded claim is an opinion wearing a fact's clothes.

### 4. Verify dynamic invariants, do not trust static text

Concurrency, lifecycle, resource cleanup — static reading does not prove these. Check whether a
claimed thread-safety holds, whether resources release, whether the lifecycle the code assumes
matches the runtime. Run the validation command (`cmdValidate`) where it surfaces the property; paste
the output. *Why:* the highest-value findings are those a careful read misses — the property that
*looks* held in the source but is not held at runtime.

### 5. Search for "no callers anywhere"

For every public surface you observe, grep for callers across the whole codebase, not just the
audited module. Zero-caller code is itself an observation (a cleanup candidate), not a tacit pass.
*Why:* dead code labelled as working is a standing risk; the cross-module grep is the only thing
distinguishing a live surface from a fossil.

### 6. Name each risk with its firing condition

`## Risks` holds things that *could* go wrong but were **not** observed firing yet. Each risk names
the failure mode and the condition under which it would fire — not the remedy. *Why:* a risk without
a trigger is unactionable noise; the condition lets a downstream author decide whether it is in scope
for the work the audit feeds.

### 7. Calibrate severity by blast radius, not discovery order

Tag each observation and risk BLOCKER / MAJOR / MINOR by *what breaks if the observation is wrong* —
how far the damage spreads and how unsafe it leaves downstream work — never by how hard the finding
was to surface or how loud it feels. A subtle defect found by exhaustive grep is still MINOR if its
blast radius is one cosmetic edge case; an obvious gap is a BLOCKER if it lets unsafe work proceed.
When a call is contestable, record the reasoning inline so a reviewer can re-derive it. *Why:* blast
radius keeps severity falsifiable instead of a vibe, and is what a downstream author triages against.

### 8. Nominate candidate obligations in prose, never as blocks

`## Recommended obligations` describes, in plain prose, what a future spec SHOULD require — the
candidate obligations a downstream `author` pass would promote into a `spec.swarm.md`'s SOL blocks.
Write what the spec should carry, not how to change the code. *Why:* this is the audit's one
permitted forward-looking gesture; keeping it prose-only preserves the observation-only stance and
stops the audit from smuggling intent across the boundary the author pass guards.

### 9. Pre-deliver visibility gate (forced visible output)

Do not finalise the audit until every observation row carries a non-empty evidence anchor and a
severity, and every risk carries a firing condition. Before declaring done, output the completeness
table into the task file:

| Item ID | `<path>:<line>` or evidence present? | Severity | Firing condition (risks) / Needed-target (obs)? |
| --- | --- | --- | --- |
| O1 | ✅ / ❌ | BLOCKER / MAJOR / MINOR | ✅ / ❌ |

Any ❌ means the audit is not finalisable — halt, fix the row, output the table again. *Why:* a
finding's compliance is otherwise invisible; the pasted table converts "I checked" into a marker the
next reader can see, and closes the bypass where an ungrounded finding ships as fact.

## Output contract

The artifact contract and the language fix the audit's stance and section shape; this guide does not
redefine them. Two facts bound what this pass records:

- An `audit.md` carries **no obligations of its own**. It is non-authoritative evidence under the
  source-authority order (an approved spec or ADR outranks the task, which outranks chat): an
  observation MUST NOT silently override a higher-authority
  artifact such as an approved spec or ADR; a lower-authority block that weakens a higher-authority
  obligation is the authority-conflict defect `SOL-M004`. The audit promotes *into* a `spec.swarm.md`
  via a later `author` pass, where its recommendations become SOL obligations; it never becomes code
  or an obligation directly.
- The boundary forbidding a file from being both spec and audit is **not** policed by this guide or
  any gatekeeper skill — the the `lower` pass and source authority
  hold it. Re-introducing a composition-policing skill is forbidden: such a skill would be a semantic
  owner and soft control presented as enforcement. Your job is to hold the stance, not
  enforce it on others.

## What does not belong

- **In an audit:** prescriptions ("we should refactor X"), assertions of intended behaviour ("the
  new behaviour will be Y"), the implementation of fixes, or any `REQ`/`CONSTRAINT`/`INVARIANT`/
  `INTERFACE` block.
- **In `## Observations`:** TODO-comment scrapes, surface impressions, vague concerns with no
  `file:line` or other evidence anchor.
- **In `## Risks`:** an empty section — look harder; a system worth auditing always carries risk
  worth naming, each with its firing condition.

## Anti-patterns

- ❌ Listing observations without a `file:line` or evidence anchor → sharpen until each cites an
  observable, or demote it.
- ❌ Presenting a fix as a finding → record what *is* and the risk; the remedy is a downstream
  decision, nominated only as prose in `## Recommended obligations`.
- ❌ Writing a `REQ`/`CONSTRAINT`/`INVARIANT` block in the audit → that asserts intent an audit may
  not carry; describe the candidate obligation in prose instead.
- ❌ Trusting a structural or thread-safety claim without grepping or running it → verify dynamic
  invariants and cross-module callers; paste the output.
- ❌ Leaving `## Risks` or `## Recommended obligations` empty → an audit naming no risk and seeding
  no future spec has not finished looking.
- ❌ Severity sorted by discovery order or how scary it feels → calibrate by blast radius and record
  the reasoning for any contestable call.
- ❌ Inheriting a prior audit's framing → read it closed and re-derive every finding from the code.
- ❌ Naming the audit `*.swarm.md` → that marks an observation as a compiler-visible spec; an audit
  is plain `.md`.

## Self-review delta

Before closing, confirm — and where a check applies, paste the evidence into the task file:

- **Is the goal a measurable target and the scope tight enough** that a downstream author can act on
  the audit without the scope expanding under them?
- **Does every observation cite `file:line` or other evidence**, and is every vague concern either
  sharpened or removed?
- **Is severity calibrated by blast radius**, with the reasoning recorded for any contestable
  promotion or demotion?
- **Did I read adversarially** — prior audit (if any) closed, cross-module callers grepped, dynamic
  invariants verified rather than assumed from static text?
- **Did I hold the stance** — no obligation blocks, no inline fix, no assertion of intended
  behaviour, recommendations in prose only?
- **Is the completeness table in the task file with all ✅** before delivery?

When the Auditor stance carries its own self-review checks, run those too — they add to these, they
do not replace them.

## Bundled resources

- `references/task-template.md` — a fillable audit-authoring frame combining the workflow scaffold
  (metadata, `cmd*` slots, constraints, progress checklist, decisions, self-review hard gate) with
  the deliverable structure inlined as a `## Deliverable` block (title + stance note, scope,
  observations with severity + evidence, risks with firing conditions, recommended obligations in
  prose). It scores on the multi-stage-plan, state-separate-from-deliverable, and paste-output-gate
  criteria. Instantiate it into your local task file, resolve the `cmd*` slots from `AGENTS.md >
  Commands` (asking the user for any undefined slot), fill it in as you work, and copy the
  `## Deliverable` block to its final home at close.
