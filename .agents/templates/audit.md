---
type: audit
id: {{slug}}
status: draft
created: {{createdAt}}
updated: {{createdAt}}
---

# Audit: {{title}}

> Stance: **observation-only**. An audit records what *is* —
> present-state risk, debt, drift, duplication, unsafe patterns. It MUST NOT
> prescribe a fix inline and MUST NOT author `REQ`/`CONSTRAINT`/`INVARIANT`/
> `INTERFACE` obligation blocks. Obligations come into existence only when this
> audit promotes to a `spec.swarm.md` via the the `author` pass. Until then this
> is non-authoritative evidence.

## Scope

<What was inspected and what was deliberately left out. Name the code paths,
artifacts, or surfaces under audit and the boundary of the observation.>

- In scope: {{what was examined}}
- Out of scope: {{what was deliberately excluded}}

## Observations

<What is true today, each citing the evidence that grounds it (file:line,
command output, grep result, or other observable). State present state only;
do not state the fix.>

- {{observation}} — evidence: `{{path}}:{{line}}` / {{command output or other evidence}}
- {{observation}} — evidence: {{...}}

## Risks

<Things that could go wrong but were not observed firing yet, each with the
conditions under which they would fire. Still observation, not prescription.>

- {{risk}} — fires when: {{condition}}
- {{risk}} — fires when: {{condition}}

## Recommended obligations

<Candidate obligations a downstream `author` pass would promote into a
`spec.swarm.md`. Describe what the spec SHOULD require, in plain prose — do NOT
write SOL obligation blocks here; the author pass emits them on promotion.>

- {{candidate obligation a future spec should carry}}
- {{candidate obligation a future spec should carry}}
