---
name: write-prd
type: agent-guide
description: >-
  Write a PRD — the durable record of product intent a spec is later written from:
  the problem, who it affects, the outcomes that define success, and what is
  deliberately out of scope. Use when new product behavior needs its "why" written
  down before anyone drafts requirements. Never write requirements, strength words,
  or solution mechanisms into a PRD. Skip when the intent is already clear enough
  to spec directly — then write the spec.
---

# Writing a PRD

A PRD records **what outcome is wanted and why**. The spec written from it records what the
system must do. Keeping the two apart gives every future requirement a single, citable origin:
six months on, "why does this requirement exist?" has a file to point at instead of a memory.

Copy the template at `advanced/prd.md` and fill it — this guide is how to fill it well.

## The one boundary

Every sentence in a PRD sits on the **intent** side of one line:

- **Intent** — a problem, an affected group, a desired outcome, a delivery limit. Belongs here.
- **Requirement or mechanism** — what a component must do, or how it does it. Belongs in the
  spec (or an RFC, if the approach is still being argued).

A PRD that says "users need a Redis cache for sessions" has crossed the line twice: it named a
mechanism (Redis) and implied a requirement. The PRD's version is "session lookups stay fast
under load" — the spec decides what "fast" means and the design decides how.

## Section by section

- **Problem.** What is wrong or missing, and for whom it hurts — in plain prose, naming no fix,
  feature, or API. A problem statement that smuggles in a solution pre-commits every reader to a
  mechanism nobody ever weighed against alternatives.
- **Users.** Who is affected and which group the outcome serves. A population, not an actor —
  "checkout abandoners on mobile", never "the cart service must…".
- **Goals.** Outcome statements: the results that define success. No strength words (must /
  must not / should / may) — a goal worded as a requirement reads as an approved contract that
  nobody approved. Goals seed requirements; they are not requirements.
- **Non-goals.** Mandatory and non-empty: the outcomes you are deliberately not pursuing.
  Without this boundary, the spec author can't tell a dropped outcome from an overlooked one,
  and scope expands silently.
- **Success metrics.** A table — metric, target, how observed. Each row names _how you'd see
  it_: a number, a dashboard, a query. "The feature feels faster" strands its goal with no path
  to evidence; "p95 checkout time under 2 s, from the existing latency dashboard" doesn't.
- **Release constraints.** Limits on _shipping_ — dates, rollout staging, compliance windows,
  dependency freezes. Not limits on what the solution may do; those are the spec's constraints.
- **Linked evidence.** Point at the research, findings, or data that ground the intent — by
  file and ID, never pasted in. Duplicated evidence drifts; linked evidence stays authoritative
  where it lives.

## Where it lives

In the workspace, a PRD sits in the feature's folder — `specs/<feature>/prd.md` — beside the
spec it will feed. Its frontmatter `type: prd` is what distinguishes it; the spec that follows
names the PRD in its `sources:`.

## Common mistakes

- A goal written as "the system must…" — restate it as the outcome; let the spec author mint
  the requirement.
- An empty or missing Non-goals section — name at least one outcome you are not pursuing, or
  the boundary of intent doesn't exist.
- A metric with no observation method — if you can't say how you'd see it, you can't later
  claim you hit it.
- A delivery constraint that actually constrains the design ("must use the existing queue") —
  that belongs in the spec, decided there with everything else.
- Treating the PRD as the spec — agents don't build from PRDs. A PRD acquires force only when
  someone writes the spec from it.

## Before you finish

- [ ] No requirement language anywhere: search the file for "must", "must not", "should",
      "shall" — every hit is either rewritten as an outcome or moved out.
- [ ] Problem and Goals name no mechanism, fix, or API.
- [ ] Non-goals present and non-empty.
- [ ] Every success-metric row says how it is observed.
- [ ] Release constraints limit shipping, not the solution space.
- [ ] Evidence is linked by file/ID, not pasted.

These checks are a convention — nothing in this repository enforces them; the reviewer of the
eventual spec is who benefits.

## Next

When the intent is settled, write the spec from it (the `write-spec` guide in `.agents/skills/`,
template at `templates/spec.md`) and list this PRD in the
spec's `sources:`. If the _approach_ is still contested, an RFC comes between the two — see
`advanced/write-rfc/SKILL.md`.
