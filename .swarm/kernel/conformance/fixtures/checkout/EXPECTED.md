# checkout — expected outcome (golden-corpus fixture)

This manifest pins the expected outcome of the `checkout` fixture, the inert oracle a
conformant tool is checked against. It is the authority for this directory: the per-stage files
reproduce the full `intent → promotion` pipeline, and this manifest records the verdict a
correct run must produce at each gate.

**Expected verdict: PASS (clean, no reconcile).**

## What this fixture is

- **Domain:** checkout (cart submission, charge, order/inventory writes, receipt).
- **Polarity:** the authored source carries the domain's canonical defect class and must be
  rejected at `lint`; the improved source repairs it and reaches a mergeable PASS.
- **Canonical defect class exercised (on the *authored* source, stage 1):**
  - obligation-bundling — one `REQ` bundling three separable obligations (`SOL-P004`);
  - write-surface conflict marked parallel — two obligations sharing a write surface in one
    parallel group (`SOL-O001`).
  The positive obligation the negative variant violates — single-charge idempotency — is the
  `INVARIANT I-010` carried with a bound `property` proof.

## Stage files

| Stage | Pass | File | Asserts |
| ----- | ---- | ---- | ------- |
| 1 | author | `spec.swarm.md` | authored source; parses; carries the seeded `SOL-P004` + `SOL-O001` defects |
| 2 | lint | (this manifest) | the two BLOCKING diagnostics |
| 3 | improve | `spec.improved.swarm.md` | both diagnostics clear; `AC-010` atomized; the shared write surface deconflicted |
| 4 | lower | `checkout.swarm.ir.json` | typed IR over the improved source; `edges[]` the sole relationship source |
| 5 | decompose, implement | `task.md` | two work packets with disjoint write surfaces; write surfaces ⊆ assigned `WRITES` |
| 6 | verify | `trace.md` | `TRACE T-010`/`T-011` + the 7-field provenance table |
| 7 | review | `review.md` | per-obligation `VERDICT`s; unauthorized-change check; merge-gate outcome |
| 8 | promote | `finding.md` | the durable finding promoted with full provenance |

> The `task.md` here shows the **pipeline-relevant work-packet frame**, not a full task-file. The task-file-schema `required_sections` rule ([`../../conformance.yaml`](../../conformance.yaml)) is exercised by [`../conformant-task.md`](../conformant-task.md) (positive) and [`../violations.md`](../violations.md) (negatives).

## Expected lint diagnostics (stage 2, on the authored `spec.swarm.md`)

Two BLOCKING diagnostics fire, each in the unified `SOL-<LAYER><NNN>` namespace. Each is
BLOCKING because it changes *what* gets built. Each names the closed `improve` op that repairs
it.

| Code | Layer | Severity | Span | Defect | Repair |
| ---- | ----- | -------- | ---- | ------ | ------ |
| `SOL-P004` | P | BLOCKING | `AC-010` | bundled/overloaded obligation: one `REQ` clause bundles three separable obligations (validate the cart AND charge the card AND email the receipt) | improve op `ATOMIZE` — split into one obligation per block |
| `SOL-O001` | O | BLOCKING | `AC-011` / `AC-012` | conflicting-tasks-parallel: `AC-011` and `AC-012` share the write surface `db/orders` in one parallel group, violating the safe-parallelism predicate | improve op `SCOPE` — serialize, or split write surfaces |

`Q-010` is a non-blocking `QUESTION` (no `[blocking]` tag), so it raises no `SOL-O003` risk;
it is resolved at the `improve` stage in favour of serializing `AC-012` behind `AC-011`. No
`SOL-S012` fires: this is a focused fixture and its sections (`## Intent`, `## Interfaces`,
`## Obligations`, `## Invariants`, `## Questions`) appear in canonical order.

## Expected after `improve` (stage 3)

Both BLOCKING diagnostics clear and no `QUESTION` remains:

- `ATOMIZE` split the bundled `AC-010` into three single-obligation REQs — `AC-010`
  (validate the cart), `AC-013` (charge the card), `AC-014` (email the receipt) — each one
  obligation per block, sharing the trigger, each with its own `VERIFY BY` selector; the charge
  REQ keeps `AC-010`'s high `RISK`. Clears `SOL-P004`. No obligation, modality, or binding is
  dropped (no distillation loss).
- `SCOPE` deconflicted `AC-011` / `AC-012`: `AC-012` now writes the disjoint surface
  `db/inventory` (was `db/orders`), and a serializing `DEPENDS ON AC-011` edge was added. With
  disjoint write surfaces the pair satisfies the safe-parallelism predicate. Clears `SOL-O001`.
- `Q-010` resolved out-of-band (decision: serialize `AC-012` behind `AC-011`) and removed.

The `ATOMIZE` and `SCOPE` edits are intent-preserving: the actor, trigger, modality, and the
union of responses are unchanged; the bundle is split, not reworded, and the inventory write is
moved to its own surface, not redefined. `ATOMIZE` did set a per-child `RISK` appropriate to
each split obligation (`AC-010` validate → medium, `AC-014` email → low; `AC-013` charge keeps
high) — `RISK` is metadata, not one of the twelve semantic-diff categories, so re-grading it
per child leaves the obligation content intent-preserving.

## Expected merge-gate outcome (stage 7) → final

Seven required obligations — the `IF-010` interface contract, the five REQs (`AC-010`, `AC-013`,
`AC-014`, `AC-011`, `AC-012`), and the invariant `I-010` — are clean `PASS`. The unauthorized-change check confirms each packet wrote
only inside its declared `WRITES`, and the two packets' write surfaces (`api/src/checkout/submit.ts`
+ `db/orders`, and `db/inventory`) are pairwise disjoint with `AC-012` ordered behind `AC-011`.

```text
Gate (single evaluation): PASS — every required obligation PASS; no parallel write conflict.
Final outcome:            PASS.
```

**Final gate: PASS.** No `STALE`/`CONTRADICTED`/`FAIL`/`BLOCKED`/`UNVERIFIED` verdict arises;
no reconcile is needed (unlike auth-refresh, this chain is clean on first evaluation).

## Stable identifiers and hashes (consistent across all stages)

- Obligations: `IF-010`; the bundled `AC-010` atomizes into `AC-010` (validate), `AC-013`
  (charge), `AC-014` (email); `AC-011` (order record), `AC-012` (inventory ledger); invariant
  `I-010`; question `Q-010` (resolved at improve); traces `T-010`, `T-011`.
- Content hashes carried unchanged stage to stage: `IF-010` source `sha256:2a7c…d0`,
  `AC-010` `sha256:4b1f…12`, `AC-013` `sha256:5c2a…34`, `AC-014` `sha256:6d3b…56`,
  `AC-011` `sha256:7e4c…78`, `AC-012` `sha256:8f5d…9a`, `I-010` `sha256:3b90…ee`; the promoted
  finding pins `content_hash: sha256:5c2a…34` (the `AC-013` charge source span).
- Adopted-project paths use `.swarm/` throughout (e.g. `.swarm/sources/specs/checkout.swarm.md`).

## How this is validated (no runtime)

Inert data (NO RUNTIME): the verdicts above are known independent of any tool and validated by hand; this manifest is the expected-outcome contract a future checker would validate against, not a tool Swarm provides.
