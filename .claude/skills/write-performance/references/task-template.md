# {{title}}

## Metadata

- Slug: {{slug}}
- task_kind: performance
- pass: implement
- Stance: Performance-Surgeon
- Source `task.md`: {{taskFile}}
- Owned paths (write_surfaces): {{writeSurfaces}}
- Created: {{createdAt}}
- Status: active

---

> **PERFORMANCE IMPLEMENT PASS** — Numbers, not vibes. Measure the baseline before you
> touch code. Same protocol before and after, one benchmarked change at a time. Never
> regress correctness for speed — the full suite passes after every change.
>
> **Commands:** `{{cmdTest}}` / `{{cmdValidate}}` resolve from `AGENTS.md > Commands`. The
> **benchmark command** (`{{cmdBenchmark}}`) is what the perf proof is measured with — if it
> is undefined, **ask the user** which command to run before establishing the baseline. If
> `AGENTS.md` is missing, ask before substituting any command. Do not guess a benchmark
> invocation: a guessed baseline cannot be honestly compared against.

---

## Parent contract

(The inherited hand-off, pasted from the `task.md`: objective + deliverable + acceptance bar +
boundaries — owned vs forbidden paths. The objective states what is being optimised, on what
input, under what conditions. "Make X faster" is not an objective; "reduce p95 latency of X
under load Y from N ms to M ms" is.)

---

## Scope

**In:** (the assigned obligations this packet owns — the performance `REQ` and the
`CONSTRAINT`/`INVARIANT` whose correctness the speedup must hold; nothing wider)

-

**Out:** Do not implement unassigned obligations. Do not optimise a second bottleneck in this
packet — promote it. Do not change behaviour outside the assigned write surfaces. Do not weaken
constraints, invariants, or non-goals. A behaviour change under a perf label is a `rewrite`, not
this task.

---

## Assigned obligations

(The exact SOL blocks, pasted verbatim — the performance `REQ` id(s) this packet implements,
with the target stated as a number.)

-

## Constraints and invariants

(The `CONSTRAINT` / `INVARIANT` SOL blocks this task MUST preserve, pasted verbatim — the
correctness the speedup may not trade away.)

-

---

## Baseline

The measured starting point. **Do not optimise until this is filled in with real numbers from
your worktree.**

**Benchmark command:** `{{cmdBenchmark}}` _(or the specific invocation)_

**Conditions:** environment, input shape, load profile, warm/cold cache state the benchmark exercises.

**Measurement:**

```
[paste actual benchmark output here — before any code change]
```

**Key metric:** _(the one number that matters — p95 latency, throughput, allocation count, …)_

---

## Target

The number you must hit and the conditions under which it must hold. Pull it from the
performance `REQ`; if the obligation states only "make X faster", that is not a target — surface
it as a blocker and get the number before starting.

**Target metric:** _(same metric as baseline)_

**Target value:**

**Hard ceiling:** the regression threshold on any other metric below which the change is rolled
back regardless of the primary gain.

---

## Hypothesis

What you believe the bottleneck is and why. Frame as a falsifiable claim — name the measurement
that would *disprove* it. Profile to confirm the bottleneck before optimising it.

- [pending]

---

## Measurement protocol

How you measure. The protocol MUST be identical before and after — different conditions give
different numbers and the comparison is meaningless. Record it once and re-use it verbatim.

- Warmup runs:
- Sample count:
- Statistical aggregate (mean / median / p95 / p99):
- Hardware / environment notes:
- Input shape / load profile / cache state:

---

## Progress checklist

- [ ] Packet read in full (parent contract, scope, assigned obligations, constraints/invariants)
- [ ] Owned paths confirmed ⊆ assigned obligations' `WRITES` surfaces (no `SOL-O005`)
- [ ] Measurement protocol fixed and recorded above
- [ ] Baseline benchmark run; output pasted above (before any code change)
- [ ] Target defined above (value + hard ceiling)
- [ ] Hypothesis stated (the falsifiable claim about the bottleneck)
- [ ] Profiled to confirm the bottleneck; profile data pasted (if applicable)
- [ ] Implement first change
- [ ] Re-run benchmark under the same protocol; compare to baseline (paste output)
- [ ] `{{cmdTest}}` passes after the change (no correctness regression) — paste output
- [ ] `{{cmdValidate}}` passes — paste output
- [ ] _… iterate per change: one benchmarked change at a time …_
- [ ] Final benchmark meets target under the same protocol as baseline
- [ ] Final full suite passes
- [ ] TRACE claims written (`IMPLEMENTS` / `PRESERVES` / `CHANGED` / `PROOF` per obligation)
- [ ] Promotion queue resolved (no out-of-scope bottleneck left unpromoted)
- [ ] Self-review hard gate fully answered

---

## Implementation or pass trace

(What changed, per assigned obligation, and the per-change benchmark delta. One short paragraph
each.)

-

## Decisions

(Implementation choices the obligations did not constrain — and why a readability trade was
accepted, if applicable. Do **not** write "the optimisation worked" here; that is a verification
output, pasted in the self-review.)

-

## Findings

(Performance investigation often surfaces architectural smells — allocations on hot paths, cache
pollution, N+1 patterns. Note them here. Move durable findings beyond this optimisation into an
audit via the promotion queue before close.)

-

## Promotion queue

(Every out-of-scope discovery — a second bottleneck, architectural debt — with a target + status.
ALL must be resolved before this task closes.)

| Discovery | Target | Status |
| --------- | ------ | ------ |
|           |        |        |

---

## Blockers

(Ambiguous or contradictory obligations, or a target stated only as "make it faster", surfaced
for upstream clarification. Do not invent the number — wait for the obligation to be clarified.)

-

## Next steps

(Concrete starting points if this session ends incomplete.)

-

---

## Verification matrix

(Per obligation: the check the spec named, the required proof, the actual pasted proof, the
status. `implement` records only the observed `proof_result`; the verdict is decided downstream.)

| Obligation / criterion | Check binding (`test`/`command`/`manual`) | Required proof | proof_result |
| ---------------------- | ----------------------------------------- | -------------- | ------------ |
|                        |                                           |                |              |

---

## Self-review

> **Hard gate.** Every question below has a written answer directly beneath it, and the
> **baseline benchmark**, the **final benchmark** (same protocol), and the **post-change suite
> result** all appear pasted verbatim. Performance work fails two ways — a number that improved
> on the benchmark but not in production, and a speedup that quietly broke correctness. Review as
> a senior engineer hostile to both.

### Verification outputs (paste actual command output — do not paraphrase)

- `git status` →
- Baseline benchmark output:
- Final benchmark output (same protocol):
- Final `{{cmdTest}}` (last 2 lines):
- Final `{{cmdValidate}}` (last 2 lines):

### Baseline and target

- Did you measure the baseline before changing code? Did the final figure hit the target under
  the same conditions as the baseline? Are both outputs pasted, not paraphrased?
  Answer:

### Protocol identity

- Is the measurement protocol (warmup, samples, aggregate, host, input, cache state) provably
  identical on both sides?
  Answer:

### Attribution

- Was each change benchmarked individually, or did batching lose attribution? Can you point at
  which change moved the number?
  Answer:

### Correctness preservation

- Did `{{cmdTest}}` pass after *every* change? Are there paths the benchmark exercises that the
  suite does not cover (and did you add them)? Could the optimisation fail on inputs the benchmark
  does not include?
  Answer:

### Conditions and ceiling

- Under what conditions does the speedup hold, and are they documented for whoever inherits the
  code? Did any other metric regress past the hard ceiling?
  Answer:

### Readability tradeoff

- If the optimisation made the code less readable, is the cost justified by the measured gain? Is
  there a call-site comment explaining what the unusual structure is for?
  Answer:

### Scope and verdict

- Every change traces to an assigned obligation (no `SOL-O005`, no silent second optimisation)?
  All promotion items resolved? Did you record only the observed `proof_result` and not
  self-certify a PASS?
  Answer:

### Final adversarial pass

- What might still be slow that you did not profile? Could the speedup be giving back downstream
  what it gained? Do not close without this.
  Answer:

Only when every answer above is written, and the baseline, final benchmark, and suite outputs are
the real pasted results, is this task complete.
