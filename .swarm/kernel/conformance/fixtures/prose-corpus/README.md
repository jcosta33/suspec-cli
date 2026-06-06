# prose-corpus — the labeled SOL-P prose fixture set

This directory is the **labeled good/bad APS-prose corpus** the `SOL-P` (prose-layer)
lint family is measured against. It is **inert oracle data**: a hand-checkable set of
short APS prose fragments, each paired with its ground-truth label — `clean`, or a
specific blocking/advisory `SOL-Pxxx` code with the reason it fires. Nothing here runs.
Swarm ships no parser, linter, or grader; this corpus is the regression set a future
checker (or a human reviewer) is scored *against*, never a tool Swarm provides.

## Why this corpus exists

The `SOL-S` (syntax) family is deterministic — a dangling trigger either has an actor
clause or it does not. The `SOL-P` family is **heuristic**: it judges prose for vague
quality, missing rationale, high-risk words, and bundling, where a rule can mis-fire on
clean prose (a false positive) or miss a real defect (a false negative). That risk is
only measurable against ground truth. This corpus *is* that ground truth: a curated set
of spans whose correct label is known independent of any detector, so a detector's
precision and recall can be computed by hand or by a future harness.

## The accuracy baseline

These are **design targets** for this curated, labeled set — chosen acceptance bars, not
a measurement claimed of any deployed detector. They are deliberately above the
field-measured ceiling for lightweight requirement-smell detection (~0.59 precision /
~0.82 recall, with wide variation), because a curated gold corpus is a far more
controlled setting than production prose.

| Metric | Target | Meaning on this corpus |
| --- | --- | --- |
| precision | ≥ 0.90 | of the spans a `SOL-P` rule flags, ≥ 90% are true defects (few false positives) |
| recall | ≥ 0.85 | of the true prose defects present here, ≥ 85% are flagged (few misses) |

Two definitions make the count well-formed:

- A **true positive** is a labeled-defect span (`label` ≠ `clean`) on which the detector
  fires the **same `SOL-Pxxx` code** the label records.
- A **false positive** is any `SOL-P` code fired on a `clean`-labeled span, or the wrong
  code fired on a defect span.

The `clean` items are not filler: they are the precision anchor. A detector that flags a
`clean` item is wrong even if it catches every defect, and only the `clean` items can
expose that. The set therefore mixes defect and clean spans deliberately, including
near-miss pairs where a single same-line criterion is the only difference between a
blocking span and its clean twin.

## Annotator-agreement floor (this is an LLM-judge corpus)

The `SOL-P` grader is an LLM judge today, not a deterministic detector. Single-judge
scores are not internally reliable, so the precision/recall targets are measured against
this gold set, **never asserted of an LLM grader at runtime**. The labels here are written
to a Cohen's κ ≥ 0.6 inter-annotator-agreement floor: each label is meant to be one a
second independent reviewer would assign from the reason alone. The deterministic `SOL-S`
family carries no such caveat — only the heuristic `SOL-P` family does.

## How a checker or a human uses it

1. Take each item's `text` (the binding-clause span) plus its `context` (binding vs
   commentary — the force of every `SOL-P` rule depends on it).
2. Run the `SOL-P` rules (or a human reviewer's judgment) over the span.
3. Compare the fired codes against the item's `label`:
   - `clean` → nothing should fire (any fire is a false positive).
   - `SOL-Pxxx` → that exact code should fire (a different code, or silence, is a miss).
4. Tally true/false positives and false negatives across the set; compute precision and
   recall; check them against the baseline above.

Because the label is recorded in data — not computed by the checker — this corpus catches
a detector that flags everything (it tanks precision on the `clean` items) and one that
flags nothing (it tanks recall on the defect items) just as readily as one with a subtle
per-code bug.

## What is in this directory

| File | Holds |
| --- | --- |
| `README.md` | this contract — what the corpus is, the baseline, and how it is used |
| `labeled.yaml` | the labeled prose items: span, context, label, expected code, reason |

## Files used by the corpus

The corpus is self-contained: every label is decidable from the item's own `text`,
`context`, and `reason`. The high-risk-word families and the same-line-observable rule
the labels invoke are the APS prose standard the `SOL-P` codes encode; this corpus pins
the expected outcome, not the rule mechanics.
