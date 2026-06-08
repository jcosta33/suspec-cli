---
type: finding
id: merge-coordination
status: accepted
created: 2026-06-08
updated: 2026-06-08
origin_obligations:
origin_traces:
pass: promote
profile:
reviewer_or_tool: migrated from pre-pivot research (.agents/research/multi-agent-consensus.md @ pre-cleanup; full original in git history)
content_hash: pending:tool
confidence: medium
---

# Finding: rerere fits Swarm's batch-worktree merge model; CRDTs do not

*Lives in: `.agents/memory/findings/` — durable recall, indexed by `memory/INDEX.md` (the load-when map).*

## Claim

For Swarm's **batch-style** model (concurrent agents on isolated worktrees, merged at the end — not
real-time co-editing), the appropriate conflict-automation primitive is **git `rerere`** (reuse recorded
resolutions): it preserves a human's conflict resolution and replays it on later agent runs. **CRDTs were
evaluated and rejected** — they solve a *real-time collaborative-editing* problem Swarm does not have, at a
complexity cost that buys nothing for batch merges. An automated **review-agent** that resolves conflicts
MUST be gated behind a validation step (typecheck + tests) before its branch is trusted — a conflict
resolver can introduce defects, and `rerere` can replay a *stale* resolution when surrounding context moved.

## Evidence

- Source: `.agents/research/multi-agent-consensus.md` (pre-pivot research; full survey + tradeoff table recoverable in git history).
- Recorded risks: rerere can apply stale resolutions (needs a re-check / human review of auto-resolutions); file "locks" are a coordination *convention*, not OS-enforced; review agents add token/latency cost (need a conflict threshold or budget).

## Applies when

- Designing swarm-core's merge / worktree-lease / ledger behaviour, the `merge` and `review` operator commands, or any conflict-resolution automation; deciding whether real-time co-editing (CRDT) machinery is warranted.

## Does not apply when

- Swarm ever moves to true real-time multi-agent co-editing of the same files — that would reopen the CRDT evaluation.

## Related obligations

- (none yet — attaches to the future `specs/003-swarm-core-worktree/` spec; see its research.md.)

## Promotion target

- [x] Keep as scoped finding
- [ ] Promote into spec (the swarm-core worktree/merge spec)

## Status history

- 2026-06-08 — accepted — migrated from pre-pivot `.agents/research/multi-agent-consensus.md` during the type-folder cleanup.
