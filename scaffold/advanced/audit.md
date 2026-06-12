---
type: audit
id: AUDIT-{{slug}}
title: {{title}}
status: draft
owner: {{team-or-person}}
sources:
  - {{code-paths-or-areas-inspected}}
---

# Audit: {{title}}

<!-- Lives in specs/<feature>/, beside the spec it informs. A pre-spec audit
     starts the feature folder. Recommended first taste for brownfield teams:
     auditing one messy area is the fastest way to see what Swarm buys you.

     Stance: observation only. An audit records what *is* — present-state risk,
     debt, drift, duplication, unsafe patterns. It never prescribes a fix and
     never writes requirements; those appear when a spec is written from it.
     Until then this document is evidence, not intent. -->

## Scope

- In scope: {{what was examined}}
- Out of scope: {{what was deliberately excluded}}

## Observations

<!-- What is true today, each grounded in evidence the reader can re-check:
     file:line, command output, a grep result. State the present state only;
     do not state the fix. -->

- {{observation}} — evidence: `{{path}}:{{line}}` / {{command output}}
- {{observation}} — evidence: {{..}}

## Risks

<!-- Things that could go wrong but have not been observed firing yet, each
     with the condition under which it would fire. Still observation, not
     prescription. -->

- {{risk}} — fires when: {{condition}}
- {{risk}} — fires when: {{condition}}

## Open questions / unverified areas

<!-- What this audit could NOT check, and questions that would change its
     prioritization if answered. Every audit assumes some properties hold
     without verifying them — name those here so the reader knows where the
     evidence stops. -->

- {{property assumed but not verified / area not inspected}} — why not: {{access, time, tooling}}
- {{question that would reorder the risks if answered}}

## Candidate requirements

<!-- What a spec written from this audit should require, in plain prose.
     Leave AC numbering and Verify-with lines to the spec. -->

- {{what a future spec should require}}
- {{what a future spec should require}}
