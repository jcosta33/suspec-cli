---
type: adr
id: 0001
title: Adopt Swarm for this workspace
status: accepted
date: {{YYYY-MM-DD}}
---

# 0001 — Adopt Swarm for this workspace

## Context

{{team}} uses coding agents for a growing share of its changes. The code
arrives faster than we can specify and review it: requirements live in ticket
threads, agents get prompted from memory, and "done" claims reach review
without evidence.

## Decision

This repository is our Swarm workspace:

- Durable intent lives in `specs/<feature>/spec.md`; supporting docs sit
  beside it.
- Work flows through committed artifacts: `intake/`, `tasks/`, `reviews/`,
  `findings/`; `status.md` is the board.
- Every agent task starts from a task packet; every result is judged through
  a review packet — a Pass needs pasted output, a CI link, or, for a manual
  check, a named human's recorded observation.
- Decisions land here in `decisions/`, numbered and immutable.
- Code repositories stay pristine: they hold code; this workspace holds
  intent and evidence.

## Consequences

- Reviews read coverage tables and routed exceptions instead of raw diffs.
- The workspace grows with every task — that record is the point, not clutter.
- These rules are conventions; the team holds them in review, not a tool.
