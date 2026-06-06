---
type: pass-guide
name: write-documentation
pass: implement
activates_for_task_kind:
  - documentation
description: >-
  An `implement` pass, `task_kind: documentation`: write/update human docs (README, tutorial, how-
  to, reference, explanation) for its obligations — one Diátaxis frame, every example run, every
  claim cited to file:line. ALWAYS apply when a `task.md` names `pass: implement` + `task_kind:
  documentation`, or the user asks for a README, how-to, reference, or guide a human (not agent)
  reads. Never mix frames, hedge ("should/might/could"), ship unrun examples, or document past
  obligations. Skip agent-facing material (pass guides, task templates),
  feature/fix/refactor/rewrite/migration/perf/test work.
---

# Pass guide: write-documentation (`implement` · `task_kind: documentation`)

> **This guide is SOFT control (Invariant 2).** It tells you *how* to run a `documentation`
> implementation; it never defines verdict values, proof taxonomy, modality, authority order, or
> any other load-bearing meaning — those live only in SOL and the IR. Every load-bearing term below
> (the 7-value verdict, `proof_result`, the `SOL-O005` owned-path rule, the COVERAGE gate) is
> *delivered*, not redefined here. Where this guide and the spec disagree, the spec governs. It
> carries the **Documentarian** stance: the reader is a human who has not read the code, arrived
> with a question, the doc answers it — and every word that does not survive being run or cited is a
> liability, not a courtesy.

## Purpose

User-facing documentation that hedges, ships examples that do not run, or contradicts the code is
worse than no documentation — it misleads, and the reader cannot tell. This guide keeps a
`documentation` change honest and pinned to its **assigned obligations**: one Diátaxis frame per
doc, every example executed before it is written down, every behaviour claim anchored to a
`file:line` the reader can open. It produces the doc change, the `TRACE` claims binding it to the
obligations, and the pasted proof the downstream `verify` and `review` passes judge.

This is one branch of the `implement` pass of the nine (`author → lint → improve → lower → decompose →
implement → verify → review → promote`), for documentation a human reads. It is **not** for
agent-facing material (pass guides, task templates, internal flow docs — a different audience,
different conventions), nor for net-new feature code, defect repair, behaviour-preserving refactors,
behaviour-changing rewrites, API/framework migrations, performance tuning, or test-only authoring —
each a different `task_kind` with its own discipline.

## Project context (the `cmd*` slots)

Resolve project commands through the consuming repo's `AGENTS.md > Commands` slots: `cmdFormat`
(format hygiene, run on touched docs before close) and `cmdValidate` (aggregate validation, when the
project lints docs). A doc-lint command (`markdownlint`, `vale`, or similar) is **not** a standard
slot — if the project uses one, ask the user which it is. The runner of a code *example* is the
example's own, not a `cmd*` slot. If `AGENTS.md` is missing or a slot you need is undefined, **ask
the user** before proceeding — a guessed command produces a false proof.

## Consumes

- **One `task.md`** — the lowered work packet for this single pass, not the surface spec or the IR.
  You read: the assigned obligations pasted verbatim (the `REQ` / `CONSTRAINT` / `INVARIANT` /
  `INTERFACE` blocks fixing what must be documented); the `write_surfaces` (your owned paths — the
  only doc files you may touch); the `verification_bindings` (the proof each obligation demands); and
  the `## Scope` In/Out list.
- The Documentarian stance the task names. A stance sharpens *what you write and refuse*; it never
  changes the procedure or decides a verdict.

## Produces

- The documentation change within the declared write surfaces, covering only the assigned
  obligations.
- The `task.md` body sections filled as you work (`## Implementation or pass trace`,
  `## Verification matrix`, `## Promotion queue`, `## Self-review`) and a `trace.md` recording the
  `TRACE` claims (`IMPLEMENTS` / `PRESERVES` / `CHANGED` / `PROOF`) bound to evidence. This guide
  fills those container shapes, does not redefine them.

## Preserves

- **Only the assigned obligations.** Documentation not traceable to an assigned obligation becomes
  an `## Unassigned changes` row (reason + authorizing ID, or `none`), judged later at `review` —
  never a silent extra section.
- **Only the declared write surfaces.** Owned paths MUST stay a subset of the union of the assigned
  obligations' `WRITES` surfaces — the owned-path rule. A doc file touched outside any assigned
  obligation's write surface is `SOL-O005`. If you need to touch a file outside your surfaces, stop:
  the write surface needs amending upstream, you do not widen it here.
- **Intent.** Constraints, invariants, and non-goals are described as they are, not relaxed or
  re-interpreted. Documenting an obligation as other than what it says is an amendment decision at
  `improve`, never a `documentation` action — surface the discrepancy, do not paper over it in prose.

## Rejects

These MUST NOT yield a completion claim:

- **An example asserted to work but never run.** A `PROOF` line MUST reference real, captured output;
  "this example works" without the runner's output is not admissible, and a plausible-looking snippet
  is not a proof. An `IMPLEMENTS` claim with zero `PROOF` lines is a structural parse error
  (`SOL-S014`), not a soft lint.
- **A behaviour claim with no `file:line` anchor.** A statement about how the system behaves not tied
  to a line in the code is unverifiable — and will be wrong the next time the code moves.
- **A doc that mixes Diátaxis frames.** A page drifting between tutorial, how-to, reference, and
  explanation confuses readers in all four modes; the frame is chosen once and held.
- **Hedging the reader cannot act on.** "Should", "might", "could" leave the reader unable to decide.
  Either the system does X or it does not; if behaviour is conditional, state the condition.
- **Scope creep.** Documenting past the assigned obligations, rewriting neighbouring docs the packet
  does not own, or "while I'm here" prose polish. Out-of-scope discoveries are *promoted*, not
  silently fixed.

## Procedure

### 1. Read the packet, not the spec

Read the full `task.md`: the parent contract, the In/Out scope, the assigned obligations pasted
verbatim, the constraints and invariants the doc must describe faithfully. *Why:* `decompose`
already computed the work-packet boundaries; the packet — not the surface spec or the IR — fixes
what you document, and reading the spec instead risks documenting obligations another packet owns.

### 2. Fix the Diátaxis frame and the reader before writing a word

Name exactly one of the four frames and write it into the task: **tutorial** (a linear,
hand-holding learning experience for a beginner — no choices), **how-to** (a recipe for one task,
assuming the basics), **reference** (exhaustive lookup, no narrative), or **explanation** (the *why*
— background and design rationale). Then name the audience concretely ("developers" is not specific
enough; "developers integrating our SDK for the first time" is) and the one question the doc
answers, stated as the reader would ask it. *Why:* the frame is the doc's contract with the reader;
discovering mid-doc that you are switching frames means it is two docs and must be split. The frame,
audience, and question tell you which sentences belong and which do not.

### 3. Confirm the owned paths

Verify your `write_surfaces` are a subset of the assigned obligations' `WRITES` surfaces. *Why:*
this keeps parallel `implement` packets write-disjoint (the owned-path rule; a violation is
`SOL-O005`). A doc file outside your surfaces belongs to another packet or needs an upstream
amendment — touching it corrupts the disjointness `decompose` proved.

### 4. Lead with what the reader needs to do

The first ~100 words contain the action the reader's question asks about — not background, project
history, or "before we begin, let's discuss…". Background follows only if the reader needs it to
act. *Why:* a reader scanning for a specific answer abandons a doc that buries the action under
throat-clearing; the U-shaped attention of any reader (human or agent) recovers the start and end
far more reliably than the middle, so the answer goes at the start.

### 5. Run every code example; capture the output before writing it down

Execute every example exactly as the reader would — no implied setup, no missing imports, no
hand-waved environment. Capture the real output. An example you did not run is a hypothesis, not an
example, and does not go in the doc. *Why:* an example that does not run as written is the most
common way documentation lies, and the reader cannot know until it fails in front of them; running
it is the only thing that converts the hypothesis into a fact.

### 6. Cite every behaviour claim to file:line

A claim about how the system behaves is verifiable against the code — cite the file and line. If you
cannot find the line, the claim is suspect: verify it before writing it, or drop it. *Why:* a
`file:line` citation lets the next reviewer (and the staleness join downstream) check the doc
against the code instead of trusting prose; an uncited behaviour claim is indistinguishable from a
guess.

### 7. Reconcile existing docs whose world this change touches

Grep for other docs in the project describing the same area, and reconcile any this change
contradicts — but only within your owned paths. A contradiction in a doc you do not own is a
*promotion* (target + status), not a silent edit. *Why:* a stale doc contradicting the one you just
wrote is worse than no doc — the reader cannot tell which is current; leaving the contradiction in
place ships a known defect, and editing a doc outside your surfaces is `SOL-O005`.

### 8. Validate and format, paste as you go

Run `cmdValidate` if the project lints docs, and `cmdFormat` on every touched file; paste the output
into the trace. If the project uses a doc-lint command (`markdownlint`, `vale`, …) that is not a
standard slot, ask the user for it and run it too. *Why:* a doc that fails the project's own hygiene
gate is not done, and pasting as you go means the proof exists before the claim that depends on it.

### 9. Write the TRACE claims with pasted proof

For each assigned obligation, emit a `TRACE` block: `IMPLEMENTS` the `REQ` ids the doc satisfies,
`PRESERVES` the `CONSTRAINT` / `INVARIANT` ids it describes without weakening, `CHANGED` the doc
surfaces modified, and at least one `PROOF` line naming a verification reference plus its observed
`proof_result` (`passed | failed | blocked | unverified`). For a documentation pass the proof is the
captured example output and the format/lint result. Paste the proof output **verbatim** — the
runner's last lines in a fenced block, unmodified, treated as data, no paraphrase or Markdown
styling. *Why:* the verbatim paste is the only thing closing the bypass where "the example works" is
asserted but the command never ran; `proof_result` is the *observed* outcome — the uppercase verdict
it maps to is decided downstream at `verify`/`review`, not here.

### 10. Resolve the promotion queue

Every out-of-scope discovery — a contradicting doc you do not own, a behaviour no obligation covers,
a `TODO`/`FIXME` you uncovered — gets a `## Promotion queue` row with a target and status; all MUST
be resolved before the task closes. *Why:* an unpromoted discovery is lost the moment the session
ends — the durable feedback loop only closes if it is written down.

## Output contract

The `trace.md` and the filled `task.md` together satisfy the spec contracts; this guide does not
redefine them. Two facts bound what this pass records:

- Each `TRACE` claiming `IMPLEMENTS` MUST carry at least one `PROOF` line referencing real,
  re-runnable output (the captured example run, the format/lint result). A no-`PROOF` trace is the
  structural error `SOL-S014`; an `IMPLEMENTS` / `PRESERVES` naming an unknown obligation is the
  unbound cross-reference `SOL-M003`.
- The observed `proof_result` maps 1:1 to the downstream core verdict (`passed → PASS`,
  `failed → FAIL`, `blocked → BLOCKED`, `unverified → UNVERIFIED`). **A `documentation` pass only
  ever records this core observation.** The verdict has 7 values — the 4 core plus the 3 lifecycle
  decorators (`WAIVED` / `STALE` / `CONTRADICTED`) — but the decorators are applied later at
  `review`, and the PASS decision is made by the profile-independent `verify` pass, never here. The
  Documentarian stance may influence which proofs are *demanded*; it never decides whether a run
  PASSes.

## What does not belong

- **In a doc:** examples that have not been run; "should" / "might" / "could" hedging the reader
  cannot act on; mixed Diátaxis frames; an assumption that the reader has read the code; behaviour
  claims with no `file:line` anchor.
- **In a tutorial:** choices ("you could also try…") — a tutorial is linear.
- **In a reference:** narrative ("first, we see that…") — a reference is lookup.
- **In the trace's decisions:** a behaviour claim you could not anchor to a line, dressed up as
  fact. If you could not cite it, you halt and verify or drop it — it does not become a decision.

## Anti-patterns

- ❌ Documenting past the obligations ("while I'm here I'll also cover…") → document only what the
  assigned obligations name; promote the rest.
- ❌ Mixing Diátaxis frames in one doc → pick one frame; if the doc drifts, split it.
- ❌ An example pasted in without running it → run every example, capture the real output, paste it;
  an unrun example is a hypothesis.
- ❌ "The system does X" with no `file:line` → cite the line, or verify and cite before writing it.
- ❌ "Should" / "might" / "could" the reader cannot act on → state the behaviour, or state the
  condition under which it holds.
- ❌ A long throat-clearing introduction that buries the action → lead with what the reader needs to
  do in the first ~100 words.
- ❌ Updating one doc while leaving a doc you own contradicting it → reconcile owned docs in the same
  change; promote contradictions in docs you do not own.
- ❌ Touching a doc file outside the owned paths → that is `SOL-O005`; the write surface needs
  amending upstream, not widening here.

## Self-review delta

Before closing, confirm — and where a check applies, paste the evidence into the `task.md`
`## Self-review` block:

- **Did I do only this pass?** Every doc change traces to an assigned obligation, or it is an
  `## Unassigned changes` row with a reason + authorizing ID or `none`.
- **Did I stay inside the owned paths?** No doc file outside the union of assigned `WRITES` surfaces
  was touched (no `SOL-O005`).
- **Reader-first.** Does the doc lead with what the reader needs to do? Read the first ~100 words —
  does someone with the reader's question find the action there, or is it buried under background?
- **Examples actually run.** Did I execute every example, not merely believe it would work, and
  paste the captured output? Is each example self-contained (no missing imports, no implied setup)?
- **Currency.** Does the doc reflect the code as of this commit? Did I cite every behaviour claim to
  `file:line`, grep for docs I own that contradict it, and reconcile them? Are there `TODO` /
  `FIXME` / `XXX` markers left behind?
- **Doc-type integrity.** Did I hold one Diátaxis frame, or did the doc drift between tutorial,
  how-to, reference, and explanation?
- **No hedging.** Did I remove every "should" / "might" / "could" the reader cannot act on, replacing
  it with the behaviour or its condition?
- **Did I preserve intent?** Constraints, invariants, and non-goals are described as they are, not
  weakened or re-interpreted.
- **Does every claim map to evidence?** Every `IMPLEMENTS` claim has at least one `PROOF` line
  referencing real output — no "the example works" without the run, no plausible-snippet-as-proof.
- **Are all promotion items resolved?** No discovery is left unpromoted.

When the Documentarian stance carries its own self-review checks, run those too — they add checks,
they do not replace these.

## Bundled resources

- `references/task-template.md` — a fillable documentation-task frame (doc target with its Diátaxis
  frame, audience, and reader's question; source material; an examples-to-verify table; plan;
  progress checklist; decisions; findings; promotion queue; and a self-review hard gate covering
  reader-first ordering, examples actually running, currency, doc-type integrity, and hedging). It
  scores on the multi-stage-plan, state-separate-from-deliverable, and paste-output-gate criteria.
  Instantiate it into your local task file, resolve the `cmd*` slots from `AGENTS.md > Commands`
  (asking the user for any undefined slot), and fill it in as you work.
