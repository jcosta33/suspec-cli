# Glossary — repo term store

The repo-level lexicon that enforces **one word, one meaning**. Each entry binds exactly one term
to exactly one canonical definition. A term whose meaning is contested MUST be _split_ into
distinct terms, never overloaded. This glossary is the repo-level fallback for term resolution; an
in-file `TERM` definition in a spec takes precedence over the glossary for that spec.

It starts with a few kernel terms; add a row whenever a term's meaning was ambiguous or drifted in
a run here. Keep entries to one line each. (Suspec working artifacts themselves live beside the
developer's own native artifacts, outside the repo — this file is committed because the terms
describe this repo's code.)

| Term       | Canonical meaning                                                                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| obligation | A typed, binding statement the system must satisfy — a `REQ`, `CONSTRAINT`, `INVARIANT`, or `INTERFACE`, identified by `AC-`/`C-`/`I-`/`IF-`.                                                 |
| verdict    | The recorded judgment on an obligation's proof: a core value (`PASS`/`FAIL`/`BLOCKED`/`UNVERIFIED`), optionally carrying a lifecycle decorator (`WAIVED`/`STALE`/`CONTRADICTED`).             |
| drift      | A divergence between an obligation and the code/proof traced to it — detected when a recorded source or surface hash no longer matches; routes to reconcile, never a silent re-bless.         |
| trace      | The record of _what an implementation claimed_ against its obligations: which it implements/preserves, what it changed, and the proofs it ran, with the provenance the drift join depends on. |

Add a new row whenever a review or run surfaces a terminology clarification worth keeping.
