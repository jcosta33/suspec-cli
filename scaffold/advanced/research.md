---
type: research
id: RESEARCH-{{slug}}
title: {{title}}
status: open
owner: {{team-or-person}}
sources:
  - {{originating-question-or-ticket}}
---

# Research: {{title}}

<!-- Lives in specs/<feature>/, beside the spec it informs. Research that feeds
     several features can start its own folder.

     Stance: inquiry. This document surveys options and evidence and commits to
     NO decision. Findings get stable R-NNN ids so other documents can cite
     them (e.g. RESEARCH-auth-survey#R-002); the durable ones are saved as
     findings at Close. The decision happens downstream — in an ADR or a spec. -->

## Question

{{the single, decision-informing question this inquiry answers — one or two
sentences; if it cannot be stated concisely, the scope is unclear}}

## Findings

### R-001 — {{finding title}}

- **Claim:** {{the one durable fact this finding asserts}}
- **Evidence:** {{file / command output / external source — enough to re-verify}}
- **Confidence:** {{high | medium | low}}
- **Bears on:** {{which downstream question or requirement-to-be this informs}}

### R-002 — {{finding title}}

- **Claim:** {{..}}
- **Evidence:** {{..}}
- **Confidence:** {{..}}
- **Bears on:** {{..}}

## Open questions

<!-- Unresolved points the inquiry surfaced but did not settle. Carry them into
     the spec's open questions rather than dropping them. Never resolve one
     here by asserting a decision — that breaks the inquiry stance. -->

- [ ] Q-001 — {{unresolved point; what answering it would unblock}}
- [ ] Q-002 — {{..}}

## Recommendation

<!-- Advisory, not a decision: the direction a spec author could lift, and the
     R-NNN findings that ground it. If no recommendation is possible, say why
     and what would unblock one (usually an open question above). -->

{{recommendation, citing R-NNN}}
