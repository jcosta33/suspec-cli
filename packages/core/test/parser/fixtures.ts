// A minimal but complete spec exercising all 7 closed block types, for the parser proof tests.

export const ALL_BLOCKS_SPEC = `---
type: spec
id: fixture-all-blocks
swarm_language: SOL/0.1
spec_version: 0.1.0
---

# Spec: fixture — one of each block type

## Interfaces

INTERFACE IF-001:
\`doThing\` RETURNS \`Result\`
OWNED BY fixture
VERIFY BY contract:cmdTest:t.spec.ts#x

## Obligations

REQ AC-001:
WHEN something happens
THE system MUST respond
VERIFY BY test:cmdTest:t.spec.ts#y

## Constraints

CONSTRAINT C-001:
THE system MUST NOT leak
BECAUSE leaking is unsafe
VERIFY BY static:cmdTest:t.spec.ts#z

## Invariants

INVARIANT I-001:
the balance MUST never go negative
VERIFY BY property:cmdTest:t.spec.ts#h

## Questions

QUESTION Q-001 [non-blocking]:
Should we cache the result?
AFFECTS AC-001

## Trace

TRACE T-001:
IMPLEMENTS AC-001
PROOF test:cmdTest:t.spec.ts#y PASS

## Review

VERDICT AC-001: PASS
REASON the bound proof ran and satisfies
EVIDENCE t.spec.ts#y
`;

export const FIXTURE_PATH = 'fixture-all-blocks.swarm.md';
