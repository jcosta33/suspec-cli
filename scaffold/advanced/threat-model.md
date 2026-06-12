---
type: threat-model
id: TM-{{slug}}
title: {{title}}
status: draft
owner: {{team-or-person}}
sources:
  - {{advisory / pentest report / attacker model}}
---

# Threat model: {{title}}

<!-- Lives in specs/<feature>/, beside the spec it hardens.

     Stance: threat observation, not intent. This document names threats; it
     writes no requirements. A threat becomes binding only when the spec
     restates it as a requirement — usually a constraint (C-NNN) or invariant
     (I-NNN) in SOL blocks — see sol-reference.md — with its own Verify-with
     line. Corroborate third-party threat claims before the spec commits to
     them. -->

## Scope

{{the surface, asset, or trust boundary being modelled — and what is explicitly
out of scope}}

## Threats

| Threat | Category | Evidence |
|---|---|---|
| T-001: {{threat}} | {{STRIDE / OWASP category}} | {{advisory, CVE, attacker model, or observed weakness}} |
| T-002: {{threat}} | {{..}} | {{..}} |

## Threats to carry into the spec

<!-- For each threat: the requirement it should become, stated as a proposal
     (actor + the required or forbidden behavior). The spec gives it an id and
     a verification method. -->

- T-001 → proposed: the {{component}} must {{required or forbidden behavior}} —
  verify with {{security test / scan / review check}}
