---
type: status
---

# Workboard

| Item | Type | State | Link |
|---|---|---|---|
| SPEC-{{slug}} | spec | {{draft / ready / in-progress / blocked / done / stale}} | `specs/{{feature}}/spec.md` |
| TASK-{{slug}} | task | {{ready / running / review-ready / blocked / closed}} | `tasks/{{slug}}.md` |
| REVIEW-{{slug}} | review | {{draft / pass / waived / blocked / needs-human}} | `reviews/{{slug}}.md` |

<!-- in-progress / done / stale are board states for specs, and blocked is a
     board state for tasks — frontmatter stays draft / ready (spec) and
     ready / running / review-ready / closed (task). Replace the example rows
     above when you copy this. The sessions maintain the board (the finishing
     agent flips its task's row; the reviewing session closes it) — you read
     it. One honest rule: a "verified" or "done" claim in this board links
     its review packet. -->

## Human attention

- {{blocking questions on draft specs}}
- {{tasks with no review packet}}
- {{findings pending acceptance}}
