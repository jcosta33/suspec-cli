# Conformance contract

Machine-readable conformance data for Swarm-adopting repos. A checker (the Swarm CLI, or any tool) reads this to answer *"is this repo / task file Swarm-conformant?"* without re-deriving the rules from prose.

**Swarm itself runs nothing** — this directory is inert contract data, not an executor. The checker is a separate-tool concern; what ships here is the contract it validates against and a fixture suite that pins the expected verdicts.

## What's here

- **`conformance.yaml`** — the manifest: the sections a well-formed task file must have, the required `AGENTS.md > Commands` rows, the legal placeholder namespaces, and the per-task-kind required verification suite.
- **`fixtures/conformant-task.md`** — a task file that passes every rule.
- **`fixtures/violations.md`** — one minimal example per violation class, each with the rule it breaks and the expected verdict. This is the checker's regression suite and the guard against the manifest drifting from the prose rules.

## Provenance

The manifest is the machine-readable shadow of the framework's directory-layout, `AGENTS.md`, template-placeholder, flow-graph, and verification-gate rules. The framework definition is canonical; this manifest restates it as testable data, and the fixtures fail if the two disagree.

> A future checker is what makes this enforceable. Until one runs, the contract still serves: it is the precise, testable definition a runtime must honour, and a human can validate a repo against it by hand.
