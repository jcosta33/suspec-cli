---
type: threat-model
id: {{slug}}
---

# Threat model: {{title}}

*Lives in: `specs/<feature>/` — beside the spec it hardens.*

<!--
  CONDITIONAL source-doc (security extension). Stance: threat OBSERVATION, not intent.
  This file holds NO obligation blocks (no REQ/CONSTRAINT/INVARIANT/INTERFACE). A modelled
  threat becomes binding only after an `author` pass restates it as a CONSTRAINT/INVARIANT
  with its own id, modality, and a (typically `security`) VERIFY BY. Plain `.md`, no `.swarm.` infix.
-->

## Scope

<the surface, asset, or trust boundary being modelled — and what is explicitly out of scope>

## Threats

| Threat | Category | Evidence |
| ------ | -------- | -------- |
| T-001: {{threat}} | {{STRIDE / OWASP-LLM category}} | {{advisory, CVE, attacker model, or observed weakness}} |

## Threats to promote

<for each threat, the obligation it SHOULD become on promotion — stated as a proposal
(actor + the required/forbidden limit), NOT as an authored CONSTRAINT/INVARIANT block.>

- T-001 → proposed: THE {{actor}} MUST {{limit}} — to be authored as a `CONSTRAINT`/`INVARIANT`
  with a `security` `VERIFY BY` binding; corroborate before it becomes binding (untrusted-source rule).
