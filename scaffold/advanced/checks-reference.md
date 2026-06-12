# Checks reference card

<!-- The review checklist for specs, tasks, and review packets. Levels:
     convention = expected practice · checklist = review inspects it ·
     toolable = a future `swarm spec check` can flag it. Nothing in this kit is
     machine-enforced; teams may treat any item as blocking by policy. -->

## Spec checks (both forms)

| # | Check | Severity | Level |
|---|---|---|---|
| C001 | `unique-ids` — every requirement ID appears exactly once in the file | hard error | toolable |
| C002 | `duplicate-id` — no other file claims the same `id:`; no requirement ID reused across specs | hard error | toolable |
| C003 | `verify-with` — every requirement carries a `Verify with:` (SOL: `VERIFY BY`) line | hard error | toolable |
| C004 | `one-strength-word` — exactly one of must / must not / should / should not / may per requirement | warning | toolable |
| C005 | `non-goals-present` — a non-empty Non-goals section exists | warning | toolable |
| C006 | `open-questions-present` — an Open questions section exists (even "none") | warning | toolable |
| C007 | `no-tbd-at-ready` — no `TBD`/`TODO`/unresolved question at `status: ready` | hard error | toolable |
| C008 | `sources-named` — frontmatter `sources:` names at least one origin | warning | toolable |
| C009 | `broken-source-link` — every named source or cross-reference resolves | hard error | toolable |

Beyond the numbered checks, review also inspects (checklist level): an `owner:` is named;
no two requirements contradict each other on the same trigger; watchlist words carry a
same-line observable criterion.

Watchlist (advisory): robust, fast, graceful, handle, support, improve, optimize,
seamless, appropriate, significant, as needed, where possible — a vague word is fine
*if the same line* gives a number, an actor+action, or a named test.

## Task checks

- Scope ids all exist in the named spec/change plan (hard error, checklist).
- `Do not change` present (warning, checklist).
- Every Verify item maps to a scope id (warning, checklist).

## Review-packet checks

- Every scoped requirement has a coverage row (hard error, checklist).
- **A Pass row has pasted output, a CI link, or, for a manual Verify method,
  a named human's recorded observation; an empty Evidence cell reads
  Unverified, never Pass** (hard error, checklist).
- No merge recommendation with an open critical item (hard error, checklist).
- At least one green row spot-checked by the reviewer (convention).

## Findings / board

- A finding has evidence and a where-it-applies scope (warning, checklist).
- A board "done/verified" row links its review packet (convention).
