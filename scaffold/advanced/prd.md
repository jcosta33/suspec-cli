---
type: prd
id: PRD-{{slug}}
title: {{title}}
status: draft
owner: {{team-or-person}}
sources:
  - {{ticket / strategy doc / customer evidence}}
---

# PRD: {{title}}

<!-- Lives in specs/<feature>/ — a pre-spec PRD starts the feature folder.

     Stance: intent only. A PRD states WHAT outcome is wanted and WHY, never
     the mechanism. Requirements (AC-NNN with Verify-with lines) appear when a
     spec is written from it. Useful when a change introduces new product
     behavior or reshapes the scope of existing behavior. -->

## Problem

{{the user or business problem, in plain prose — what is wrong or missing, not
how to fix it}}

## Users

- {{who is affected, and which segment the outcome serves}}

## Goals

- {{outcomes that define success — intent, not mechanism}}

## Non-goals

- {{explicitly out of scope — never leave this empty; the boundary is the point}}

## Success metrics

<!-- Prefer metrics someone could actually observe — a metric nobody can
     measure cannot become a verifiable requirement later. -->

| Metric | Target | How observed |
|---|---|---|
| {{metric}} | {{target}} | {{dashboard / query / test}} |

## Release constraints

- {{date, rollout, compliance, or dependency limits on shipping}}

## Linked evidence

- research: {{RESEARCH-x#R-NNN}}
- finding: {{FINDING-x}}
