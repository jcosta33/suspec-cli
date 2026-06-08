---
type: research
id: swarm-core-worktree-coordination
status: draft
created: 2026-06-08
updated: 2026-06-08
title: Worktree state & inter-agent coordination — options for swarm-core's lease manager + ledger
---

# Research: worktree state & inter-agent coordination

> **Stance: inquiry.** Surveys mechanisms; commits to no obligation. Seeds a future
> `specs/003-swarm-core-worktree/spec.swarm.md` (not yet authored). **Migrated** and reframed from two
> pre-pivot docs — `.agents/specs/agent-communication-protocol.md` + `.agents/research/agent-to-agent-communication.md`
> (full originals recoverable in git history). The legacy framing assumed the single-package `src/modules`
> terminal-launch architecture + `proper-lockfile`; under the pivot, **swarm-core** owns the
> worktree-lease manager and the ledger, so this is recorded as input to *that* component, not a `src/modules` change.

## Research question

What is the most robust, cross-platform mechanism for **safe shared state and coordination across concurrent
agents in isolated git worktrees** — such that swarm-core can hand out leases, broadcast context, collect
partial results, and record the ledger **without filesystem race conditions** — given that agents are launched
through detached terminal emulators (the IPC boundary problem)?

## The atomic-state problem (live, owned by swarm-core)

The legacy `read_state`/`write_state` over a single JSON registry has a **read-then-write race** under
concurrent processes. Atomic *rename* fixes write atomicity but not the read-modify-write race. swarm-core's
lease manager + ledger must make concurrent state access safe by construction.

## Options surveyed

| Mechanism | Zero-dep | Cross-platform | Works through detached shell | Real-time push | Crash cleanup | Complexity |
| --- | --- | --- | --- | --- | --- | --- |
| Node `child_process` IPC | ✅ | ✅ | ❌ (dies at the terminal-emulator boundary) | ✅ | ✅ | low |
| Unix domain socket / named pipe | ✅ | ⚠️ (path differs; macOS 104-byte limit) | ✅ | ✅ | ❌ (unlink on crash) | medium |
| File mailbox (append NDJSON) | ✅ | ✅ | ✅ | ❌ (poll) | ✅ | low |
| Advisory file lock (`flock` / `proper-lockfile`) | ⚠️ (npm dep; may node-gyp) | ✅ | ✅ | ❌ | ✅ | low |
| Message broker (ZeroMQ / Redis) | ❌ | ✅ | ✅ | ✅ | ✅ | high |

Key constraint: **Node IPC does not survive the terminal-emulator launch boundary** (the immediate child is
the emulator, not the agent), so any push channel needs an IPC *shim* process spawned with `ipc` that then
launches the emulator — or an OS-level transport (UDS/named pipe) that survives the shell.

## Recommendation (for the future spec to weigh)

1. **State safety first.** Make swarm-core's state access atomic under concurrency (advisory lock, or a
   single-writer ledger with append-only event log). This is the high-payoff, low-risk core.
2. **Observation via file mailbox.** Agents append NDJSON events; swarm-core tails them. Pull-based latency is
   fine for a batch worktree model; robust against crashes (no socket cleanup). (Needs a rotation/compaction
   strategy — files grow unbounded.)
3. **Push (medium-term, opt-in).** An IPC-shim launcher or a UDS/named-pipe transport for real-time
   orchestrator↔agent messaging, validated by a proof-of-concept before becoming default.
4. **Defer brokers.** ZeroMQ/Redis only if sub-100ms inter-agent latency or cross-machine swarms become real.

## Open questions for the spec

- Does the ledger subsume the "mailbox," or are they distinct (durable ledger vs ephemeral event stream)?
- Lease granularity: per-worktree, per-file (`WRITES`-surface disjointness), or per-spec?
- Cross-platform push: is a UDS/named-pipe transport worth the crash-cleanup cost, or is poll-based mailbox enough for v1?

## Related

- `.agents/memory/findings/merge-coordination.md` — rerere vs CRDT for merging the concurrent branches this coordination produces.
- Swarm's `decompose` step + coordination-record (`WRITES`-disjointness proof for safe parallelism) — the upstream discipline this implements.
