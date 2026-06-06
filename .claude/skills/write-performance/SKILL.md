---
type: pass-guide
name: write-performance
pass: implement
activates_for_task_kind:
  - performance
description: >-
  `implement` pass for a `task_kind: performance` packet: optimise a measured
  bottleneck to a numeric target under one measurement protocol. ALWAYS apply
  when a `task.md` carries `pass: implement` + `task_kind: performance`, or the
  user asks to optimise, profile, speed up, or cut latency / memory / CPU /
  allocations against a metric. Never change code pre-baseline, compare numbers
  across conditions, batch unattributable optimisations, or skip the suite. Skip
  for correctness fixes, refactors, behaviour-changing rewrites, API/version
  migrations, net-new features.
---

# Pass guide: implement — performance

> **SOFT control (Invariant 2).** This guide tells you *how* to run a
> `performance` implement pass. It does **not** define modality, authority
> order, verification semantics, verdict values, or proof taxonomy — those are
> owned only by SOL and the typed IR. Every load-bearing term below (a
> `REQ`/`CONSTRAINT`/`INVARIANT`/`INTERFACE` obligation, a `TRACE` block,
> `IMPLEMENTS`/`PRESERVES`/`CHANGED`/`PROOF`, the 7-value verdict, a lint code
> like `SOL-O005`) is **cited, not redefined**. Where this guide and the language
> reference disagree, the reference governs.

## Purpose

Performance work fails two ways, both producing a diff that looks like a win.
First, **a number that moved on the benchmark but not in production** — measured
under conditions that do not match where the system is actually slow, or against
a baseline taken under a different protocol, so the comparison is meaningless.
Second, **a speedup that quietly broke correctness** — a faster wrong answer is
still a defect. The discipline against both: a baseline measured *before*
touching code, a target stated as a number under named conditions, the *same*
protocol on both sides, one benchmarked change at a time, the full suite green
after every change.

The defining test: performance work optimises a *measured* bottleneck under a
*stated* target. Restructuring internals without a behaviour change is a
`refactor`; changing what the code does is a `rewrite`; no number and no protocol
is tinkering, not optimising — surface that and get the target before you start.

## Stance: Performance-Surgeon

Adopt the Performance-Surgeon stance: numbers over vibes, correctness over
speed. The Surgeon does not believe a thing is faster until a baseline and a
final figure — under the identical protocol — say so, and treats every
optimisation as guilty of breaking correctness until the suite proves otherwise.
The standing questions bite here: *what number am I moving, under what
conditions, and what measurement would falsify my hypothesis?* The red flags
fire on sight — "it feels faster", a benchmark with no pasted output, a baseline
and a final measured under different load, a green benchmark with a skipped
suite. A stance sharpens *what you look for and refuse*; it never changes the
procedure below and never decides a verdict.

## Consumes

- One `task.md` — the lowered work packet for this single pass. `implement`
  works against the packet `decompose` handed it, **not** the surface spec or
  the IR. Read in particular: `assigned_obligations`, `constraints`,
  `invariants`, `interfaces` (the SOL blocks pasted verbatim that fix scope —
  including any performance `REQ` stating the target as a number, and the
  `CONSTRAINT`/`INVARIANT` pinning the correctness the speedup must not break);
  `write_surfaces` (your owned paths, the only files you may touch);
  `verification_bindings` (the proofs each obligation demands); and the
  `task_kind` enum, which must read `performance` for this guide to apply.
- The driving audit or perf spec, when one exists — performance work is
  typically seeded by a profiling audit or a spec naming the metric and target.
  Read it in full before measuring.
- Project command slots resolved through the consuming repo's `AGENTS.md >
  Commands`: `cmdTest` (the full suite proving correctness held), `cmdValidate`,
  and the **benchmark command** the perf proof is measured with. The benchmark
  slot is `cmdBenchmark` where the repo defines one; **if `AGENTS.md` is missing,
  or `cmdBenchmark` (or any needed slot) is undefined, ask the user which command
  to run before the baseline — never invent or guess one.** A guessed benchmark
  invocation produces a baseline the final figure cannot honestly be compared
  against.

## Produces

- Code changes within the declared write surfaces, and only there, that move the
  named metric toward its target.
- A `trace.md` recording one `TRACE` block per assigned obligation —
  `IMPLEMENTS` the performance `REQ` ids satisfied, `PRESERVES` the
  `CONSTRAINT`/`INVARIANT` ids the speedup held, `CHANGED` the modified surfaces,
  and at least one `PROOF` line with pasted, re-runnable output (the benchmark
  figure *and* the suite result, since a perf claim that does not also prove
  correctness is incomplete). Its `## Provenance` section carries the per-binding
  drift fields the staleness join depends on. Externalising the run's
  intermediate work — baseline, protocol, hypothesis, per-change measurements —
  into this durable artifact rather than leaving it in context is what lets
  downstream `verify` and `review` judge it.

## Preserves

- **Correctness, end to end.** The obligation a performance change must not trade
  away — see rule 6. Constraints, invariants, and non-goals are held, not
  relaxed; making the benchmark fast by weakening a `CONSTRAINT` or skipping an
  `INVARIANT` is a defect, not an optimisation. Changing an obligation's intent is
  an amendment decision at `improve`, never an `implement` action.
- **Only the assigned obligations.** Any change not traceable to an assigned
  obligation is an `## Unassigned changes` row in the trace (reason + authorizing
  ID, or `none`), judged at `review`. A second bottleneck spotted while here is a
  promotion item, not a second optimisation in this packet (rule 5).
- **Only the declared write surfaces.** Owned paths MUST stay a subset of the
  union of the assigned obligations' `WRITES` surfaces. A path touching a file
  outside any assigned obligation's declared write surface is the owned-path
  defect `SOL-O005` ("owned path outside declared write surface") — the property
  keeping parallel `implement` packets write-disjoint. If the optimisation needs
  a file outside your owned paths, stop: it belongs to another packet, or the
  write surface needs amending upstream — not an `implement` decision.

## Core rules

### 1. Measure the baseline before you change any code

Run the benchmark in your worktree and paste the output *before* touching the
implementation. The baseline is real numbers from a real run, not "we know it is
slow". *Rationale:* "improvement" is meaningless without a fixed reference point;
a baseline measured after the change has already lost the comparison, and one
reconstructed from memory is unfalsifiable.

### 2. State the target as a number, under named conditions

The target is a specific value of a specific metric under specific conditions —
e.g. "p95 latency of `getQuote()` under 1k RPS sustained drops from 240 ms to
≤ 80 ms". This usually comes from the performance `REQ` in the packet; a goal
stated only as "make X faster" is not a target — surface it as a blocker and get
the number before you start. *Rationale:* an unquantified goal can be declared
met by any change in the right direction, which is how a perf task ships a
rounding-error improvement and calls it done.

### 3. State the hypothesis as a falsifiable claim

Write down what you believe the bottleneck is and the measurement that would
*disprove* it — "allocations in the hot loop dominate; cutting them 50% should
drop latency ≥ 30%" is falsifiable; "I think this is slow" is not. Profile to
confirm the bottleneck before optimising it. *Rationale:* a non-falsifiable
hypothesis cannot be wrong, so it never teaches you that you optimised the wrong
thing — and optimising a path that is not the bottleneck is the most common way
perf effort produces no production gain.

### 4. Identical protocol before and after — or the comparison is meaningless

The measurement protocol — warmup runs, sample count, statistical aggregate
(mean / median / p95 / p99), hardware, environment, input shape, warm/cold cache
state — MUST be identical for the baseline and the final figure. Record it once
in the task frame and re-use it verbatim. *Rationale:* different conditions give
different numbers; a baseline measured cold against a final measured warm
"proves" a speedup that does not exist, the mechanism behind the
benchmark-improved-but-production-did-not failure mode.

### 5. One benchmarked change at a time — never batch optimisations

Each iteration is: change → re-run the benchmark under the protocol → compare to
baseline → run the suite. Do not bundle several optimisations into one change, or
skip the benchmark because "I am sure this helps". *Rationale:* batched changes
are unattributable — you cannot tell which one moved the number, which one
regressed it, or which is dead weight you now maintain for no gain. A second
bottleneck found mid-task is a `## Promotion queue` row, not a silent second edit
(it would land as an `## Unassigned changes` row at review).

### 6. Run the full suite after every change — a faster wrong answer is a defect

Run the project's full test command (`cmdTest`) and `cmdValidate` after every
change, and paste the output. Performance work does not get to skip the suite.
*Rationale:* a speedup that broke correctness is a worse defect than the slowness
it cured — a known cost traded for an unknown bug. The benchmark proves the
number moved; only the suite proves you did not break what it was measuring.

### 7. Document the conditions and define a hard ceiling

The speedup holds *under specific conditions* — record which input shape, load
profile, hardware, and cache state, so whoever inherits the code knows when the
optimisation stops helping. Define a **hard ceiling**: the regression threshold
on any other metric beyond which the change is rolled back regardless of the
primary gain. *Rationale:* without documented conditions the next reader assumes
the gain is universal and is surprised when it inverts on a different input;
without a ceiling, "a small regression on memory for a big latency win" creeps
into shipping with no one having agreed the trade.

### 8. Readability is on probation; justify and annotate the trade

If the optimisation made the code harder to read, the cost is real and must be
paid down explicitly: document *why* the readability trade is justified by the
measured gain, and add a comment at the call site explaining what the unusual
structure is for. *Rationale:* an undocumented clever optimisation is unwound by
the next refactor that does not know why it exists, and the gain is lost
silently. The comment is what makes the gain survive the next person.

### 9. Forced visible output: paste it, don't assert it

Any verification step that is otherwise invisible MUST produce pasted, verbatim
output — the baseline benchmark, the final benchmark, and the suite result, each
fenced and treated as data, last lines minimum, no paraphrase. A `PROOF` line
referencing real run output is admissible; an unqualified "tests passed" or
"benchmark improved" is not — a no-`PROOF` `TRACE` claiming `IMPLEMENTS` is a
structural parse error (`SOL-S014`), and an `IMPLEMENTS`/`PRESERVES` naming an
unknown obligation is the unbound cross-reference `SOL-M003`. The observed
`proof_result` (`passed | failed | blocked | unverified`) is only the core run
observation; the `PASS` decision is made downstream by the profile-independent
`verify` pass, and the lifecycle decorators (the 7-value verdict's `WAIVED` /
`STALE` / `CONTRADICTED`) are applied later at `review` — never here. *Rationale:*
the observed `proof_result` is the only thing `verify` can turn into a verdict;
a perf claim with no pasted before/after figure is one the pipeline cannot judge,
and an implementer scoring their own speedup favours it.

## Procedure

1. **Read the packet and the audit/spec, not the surface spec.** Read the full
   `task.md` (parent contract, In/Out scope, obligations verbatim,
   constraints/invariants) and the driving perf audit or spec. Resolve project
   commands from `AGENTS.md > Commands`; **ask the user for any undefined slot,
   especially the benchmark command — never guess it.**
2. **Confirm the owned paths.** Verify `write_surfaces` is a subset of the
   assigned obligations' `WRITES` surfaces. Needing a file outside it is
   `SOL-O005` — stop.
3. **Fix the protocol, then measure the baseline** (rules 1, 4). Record the
   protocol in the task frame, run the benchmark under it, and paste the baseline
   output *before* changing code.
4. **State the target and the falsifiable hypothesis** (rules 2, 3). Pull the
   target from the performance `REQ`; if it is not a number, surface a blocker.
   Profile to confirm the bottleneck the hypothesis names.
5. **Halt on ambiguity.** If an assigned obligation, the target, or the
   correctness contract is unclear or contradictory, surface it — do not invent
   the requirement. Resolving it silently is an amendment you are not authorized
   to make at `implement`.
6. **Optimise one change at a time** (rule 5). Per change: re-run the benchmark
   under the same protocol and compare to baseline; run `cmdTest` and
   `cmdValidate`; paste both as you go (rules 6, 9). Roll back anything breaching
   the hard ceiling (rule 7). Annotate any readability cost (rule 8).
7. **Write the TRACE claims.** Per obligation: `IMPLEMENTS` / `PRESERVES` /
   `CHANGED` + at least one pasted `PROOF` line carrying both the final benchmark
   figure and the suite result (rule 9). Record the `## Provenance` drift fields
   per binding.
8. **Resolve the promotion queue** (rule 5) — every out-of-scope bottleneck or
   architectural smell has a target + status; none left unresolved.
9. **Self-review** — see below; the task is not done until every check is
   answered in writing with the baseline and final outputs pasted.

## What does not belong

- **In a performance task:** "feels faster" with no measurement; optimisations
  bundled across unrelated bottlenecks in one change; a baseline and a final
  figure taken under different conditions; a green benchmark with the suite
  skipped; behaviour changes smuggled in under a perf label (that is a `rewrite`).
- **In the task's `## Decisions`:** "the optimisation worked" — a verification
  output to be pasted in the self-review, not a design decision.
- **In the task's `## Findings`:** a second bottleneck or architectural smell not
  promoted to an audit before close (rule 5).

## Anti-patterns

- ❌ "It feels faster" / "this should be faster" with no pasted number → measure
  it under the protocol (rules 1, 4, 9).
- ❌ Optimising before a baseline exists → the baseline is taken first, before any
  code change (rule 1).
- ❌ Baseline measured cold, final measured warm (or different sample count, host,
  input) → identical protocol on both sides or the comparison is void (rule 4).
- ❌ Bundling several optimisations so you cannot attribute the gain → one
  benchmarked change at a time (rule 5).
- ❌ Skipping the suite because "it is just a perf change" → full suite after every
  change; a faster wrong answer is a defect (rule 6).
- ❌ "Make X faster" accepted as the target → get a number under named conditions,
  or surface a blocker (rule 2).
- ❌ Optimising a path you never profiled → confirm the bottleneck against a
  falsifiable hypothesis first (rule 3).
- ❌ A clever, unreadable optimisation with no comment → annotate it at the call
  site with the justified trade, or it is unwound next refactor (rule 8).
- ❌ Shipping a big primary gain that quietly regressed another metric past the
  ceiling → roll back; the ceiling is the agreed trade boundary (rule 7).
- ❌ "Benchmark improved" / "tests passed" with no command, exit code, or pasted
  output → paste the real, re-runnable output; a claim is not proof (rule 9).

## Output contract

The `trace.md` and the filled `task.md` together satisfy the SOL contracts; this
guide does not redefine them.

- The `trace.md` MUST carry: frontmatter (`type: trace`, `id`, `source_task`,
  `source_spec`, `created`); `## Claimed implementation` (the `TRACE` blocks);
  `## Provenance` (the per-binding drift fields); `## Verification matrix`
  (ID → required proof → actual proof → status); `## Unassigned changes` (each
  with reason + authorizing ID, or `none`); `## Promotion items` (target +
  status).
- Each `TRACE` claiming `IMPLEMENTS` MUST carry at least one `PROOF` line
  (`SOL-S014` otherwise); an `IMPLEMENTS`/`PRESERVES` naming an unknown
  obligation is `SOL-M003`. The two pasted proofs making a perf claim admissible
  are the **before/after benchmark under one protocol** (the number moved) and
  the **post-change suite result** (correctness held) — both verbatim, fenced, as
  data.
- `proof_result` maps 1:1 to the downstream core verdict (`passed → PASS`,
  `failed → FAIL`, `blocked → BLOCKED`, `unverified → UNVERIFIED`); the gate
  decision and the lifecycle decorators are not made here (rule 9).

## Self-review

> **Hard gate.** The task is not complete until every question below has a
> written answer directly beneath it, and the **baseline benchmark**, the **final
> benchmark** (same protocol), and the **post-change suite result** all appear
> verbatim in the `## Self-review` block. Performance work fails two ways — a
> number that improved on the benchmark but not in production, and a speedup that
> quietly broke correctness. Review as a senior engineer hostile to both.

- **Verification outputs (paste actual command output — do not paraphrase):**
  `git status`; baseline benchmark output; final benchmark output (under the same
  protocol); `cmdTest` (last 2 lines); `cmdValidate` (last 2 lines).
- **Baseline and target:** Did I measure the baseline before changing code? Did
  the final figure hit the target under the *same* conditions as the baseline?
  Are both outputs pasted, not paraphrased?
- **Protocol identity:** Is the measurement protocol (warmup, samples, aggregate,
  host, input, cache state) provably identical on both sides?
- **Attribution:** Was each change benchmarked individually, or did I batch and
  lose attribution? Can I point at which change moved the number?
- **Correctness preservation:** Did `cmdTest` pass after *every* change? Are there
  paths the benchmark exercises that the suite does not cover (and did I add
  them)? Could the optimisation fail on inputs the benchmark does not include?
- **Conditions and ceiling:** Under what conditions does the speedup hold, and are
  they documented for whoever inherits the code? Did any other metric regress past
  the hard ceiling?
- **Readability:** If the code got less readable, is the cost justified by the
  measured gain, and is there a call-site comment explaining the structure?
- **Scope and verdict:** Every change traces to an assigned obligation (no
  `SOL-O005`, no silent second optimisation)? All promotion items resolved? I
  recorded only the observed `proof_result` and did not self-certify a PASS?
- **Final adversarial pass:** What might still be slow that I did not profile?
  Could the speedup be giving back downstream what it gained? Do not close
  without this.

## Bundled resources

- `references/task-template.md` — a fillable `performance` task frame with a
  baseline block (benchmark command, conditions, key metric, pasted measurement),
  a target block (target value + hard ceiling), a single `## Hypothesis` field,
  the measurement protocol, a progress checklist, and a self-review hard gate
  covering baseline-and-target proof, protocol identity, correctness
  preservation, conditions, and the readability trade. Copy it into your
  project's task-file location, substitute the `{{...}}` placeholders from the
  consuming repo's `AGENTS.md` command slots (`{{cmdTest}}`, `{{cmdValidate}}`,
  the benchmark command), and fill it in as you work.
