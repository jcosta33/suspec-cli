---
type: finding
id: {{slug}}
status: candidate
created: {{createdAt}}
updated: {{createdAt}}
origin_obligations:
origin_traces:
pass:
profile:
reviewer_or_tool:
content_hash:
confidence: high | medium | low
---

# Finding: {{title}}

<!--
A finding is one durable, provenance-anchored project fact discovered during work
(see the `promote` pass). It is the Tier-2 evidence store the
memory index ([`../memory/INDEX.md`](../memory/INDEX.md)) links into.
This is a source-doc: it records a fact, it does NOT declare obligations.
No REQ / CONSTRAINT / INVARIANT / INTERFACE blocks belong here — those appear
only after a finding is promoted into a spec/audit by the author pass.

Frontmatter provenance fields (all required for a promoted finding):
  status            candidate | accepted | promoted | rejected | stale | superseded
                    Goes `stale` when content_hash no longer matches the cited
                    source/surfaces (see the `promote` pass).
  created / updated provenance timestamp.
  origin_obligations[]  obligation IDs this fact was discovered against.
  origin_traces[]       trace IDs that produced it.
  pass + profile        which pass/profile surfaced it.
  reviewer_or_tool      who or what recorded it.
  content_hash          hash of the cited source/surfaces, for staleness.
  confidence            high | medium | low.
-->

## Claim

{{one durable project fact — a single, falsifiable statement}}

## Evidence

- File: {{path[:line] the fact was observed in}}
- Command: {{command run to observe it, if any}}
- Output: {{relevant output excerpt}}
- Source: {{external reference / link, if any}}

## Applies when

<!-- Mandatory scope. If this finding cannot name when it applies, it MUST NOT be promoted (see the `promote` pass). -->

- {{condition under which this fact holds}}

## Does not apply when

- {{condition under which this fact does NOT hold}}

## Related obligations

<!-- Obligation IDs the fact bears on, beyond its origin_obligations[] provenance. -->

- {{AC/C/I/IF ID}}

## Promotion target

<!-- The promotion route for this finding. -->

- [ ] Keep as scoped finding
- [ ] Promote into spec
- [ ] Promote into audit
- [ ] Promote into ADR
- [ ] Promote into memory pattern
- [ ] Mark stale / superseded

## Status history

<!-- Append-only status transitions. One line per transition; never edit prior lines. -->

- {{createdAt}} — candidate — created during {{pass}} pass
