# Memory INDEX — Tier-1 recall map (seed)

This is the **Tier-1 recall map**: the compact index an agent reads *first* and
*cheaply*. It is a **load-*when* map, not the territory** — it says *when* to load each durable
entry, and it links into the Tier-2 evidence store (findings, patterns); it MUST NOT
inline their bodies. The always-loaded bootloader (AGENTS.md) *points here* but never inlines
this map; this map in turn points at Tier-2 but never copies it. Markdown-only, no runtime: this
is the contract a future recall tool reads, not a retrieval engine.

**This file ships as a seed.** It starts almost empty; a consumer grows it one row at a time as
the `promote` pass writes durable discoveries. Keep it tiny.

## The load-when discipline (normative)

Every entry MUST carry a `Load when` condition — the trigger that tells a future agent the entry
is relevant to its current task. The entry format is:

```text
- [Title](path) — Load when: <condition>
```

If an entry cannot name *when it matters*, remove it: an entry with no usable `Load when` is dead
weight against the loss budget and the bootloader density cap (see the `promote` pass).

## Durable findings

<!-- One row per promoted/accepted finding.md in the Tier-2 store. Link the file; never restate
     its claim. The Load when mirrors the finding's applies_when scope envelope.
     Illustrative seed entry (commented out — a consumer activates real rows like it):

- [Refresh storm on a shared 401](../sources/findings/refresh-storm-on-shared-401.md) — Load when: touching auth token rotation, refresh endpoints, or concurrent-request handling
-->

_(empty — the consumer adds the first durable finding here.)_

## Topic files

<!-- One row per patterns/*.md or other Tier-2 topic artifact; a pattern distils ≥2
     corroborating findings and cites them. Same entry format and load-when discipline. -->

_(empty — the consumer adds topic/pattern files here.)_
