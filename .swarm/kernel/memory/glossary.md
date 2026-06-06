# Memory glossary — Tier-2 term store (seed)

This is the **Tier-2 one-word-one-meaning term store** (see the two-tier memory model in the
`promote` pass at `.swarm/kernel/passes/promote.md`): the project-level lexicon that
enforces **one word, one meaning**. Each entry binds exactly one term to exactly one canonical
definition. A term whose meaning is contested MUST be *split* into distinct terms, never
overloaded. This glossary is the project-level fallback for term resolution; an in-file `TERM`
definition in a `spec.swarm.md` takes precedence over the glossary for that spec.

**This file ships as a seed.** It starts with a few kernel terms; a consumer extends it whenever a
term's meaning was ambiguous or drifted (the terminology-clarification promotion target). Keep
entries to one line each.

| Term | Canonical meaning |
| ---- | ----------------- |
| obligation | A typed, binding statement the system must satisfy — a `REQ`, `CONSTRAINT`, `INVARIANT`, or `INTERFACE`, identified by `AC-`/`C-`/`I-`/`IF-`. |
| verdict | The recorded judgment on an obligation's proof: a core value (`PASS`/`FAIL`/`BLOCKED`/`UNVERIFIED`), optionally carrying a lifecycle decorator (`WAIVED`/`STALE`/`CONTRADICTED`). |
| drift | A divergence between an obligation and the code/proof traced to it — detected when a recorded source or surface hash no longer matches; routes to reconcile, never a silent re-bless. |
| trace | The record of *what an implementation claimed* against its obligations: which it implements/preserves, what it changed, and the proofs it ran, with the provenance the drift join depends on. |

A consumer adds a new row whenever the `promote` pass routes a terminology clarification here.
