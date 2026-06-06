# `lint` code catalogue and worked example

Lookup tables for the `pass-lint-spec` guide. The guide names each defect family in prose; this file carries the per-code defect text and the code→`improve`-op map so the body stays short. **This file restates the language's lint section (the SOL error catalogue) and APS prose families (the APS prose standard) for convenience — it does not redefine them.** When a code's exact meaning matters, the SOL lint section is authoritative; if this table and the language reference ever disagree, the language reference wins.

## Principal BLOCKING codes

A code is BLOCKING iff its defect changes **what gets built** — the obligation is incomplete, non-binding, untestable, ambiguous, contradictory, or unsafe to parallelize.

### S layer — well-formedness (`PARSE`)

| Code | Defect |
| --- | --- |
| `SOL-S001` | Precondition (`WHEN`/`IF`/`WHILE`) with no actor clause / no modal consequence (dangling condition). |
| `SOL-S003` | Actor clause (`THE <actor> …`) with no modal verb. |
| `SOL-S005` | ID prefix does not match block type (e.g. `REQ C-001:`). |
| `SOL-S006` | `SHOULD` / `SHOULD NOT` used without an accompanying `BECAUSE` or `EXCEPT`. |
| `SOL-S012` | A `spec.swarm.md` missing a required top-level section, or sections out of mandated order (document-level companion of `SOL-O004`). |

### P layer — controlled prose, the blocking set `SOL-P001`–`SOL-P008` (`NORMALIZE`)

| Code | Defect |
| --- | --- |
| `SOL-P001` | Dangling condition: trigger present, no modal consequence (prose companion of `SOL-S001`). |
| `SOL-P002` | Missing actor: an action with no `THE <actor>` subject. |
| `SOL-P003` | Missing / informal modality (e.g. lowercase `should` where a binding modal is intended). |
| `SOL-P004` | Bundled / overloaded obligation: separable obligations joined by `and`/`or`/`and/or` in one clause. |
| `SOL-P005` | Vague-quality / high-risk word in a binding clause with no same-line observable criterion (see the APS prose standard). |
| `SOL-P006` | Undefined term used in a binding clause (no `TERM` / `memory/glossary.md` definition). |
| `SOL-P007` | Negation ambiguity: bare `MUST NOT` not paired with the affirmative behaviour that should happen instead. |
| `SOL-P008` | Uncaptured behavioural uncertainty: an ambiguity stated in prose that should be lifted to a `QUESTION` block. |

### M layer — semantic (`NORMALIZE`)

| Code | Defect |
| --- | --- |
| `SOL-M001` | Actor / object incompleteness: the obligation names a modal but not a resolvable actor *and* object. |
| `SOL-M002` | Contradiction: two obligations share a contradiction key (normalized actor + trigger/state + the `affects[]`/`writes[]` surface set) with opposed modalities — **exact-key match only in v0.1**. |

### V / O layers — surfaced only when already determinable from the surface spec

| Code | Defect | Owner pass |
| --- | --- | --- |
| `SOL-V001` | Missing verification path: a binding obligation (`REQ`/`CONSTRAINT`/`INVARIANT`) or `INTERFACE` with no `VERIFY BY`. | `verify` |
| `SOL-O001` | Write-conflict marked parallel: two work packets sharing a write surface scheduled in parallel. | `decompose` |
| `SOL-O003` | A `[blocking]` `QUESTION` reaching `lower` (the CLARIFY-gate trip code for an unresolved blocking question). | `decompose` |
| `SOL-O005` | Owned path outside declared write surface. | `decompose` |

Record V/O codes only when the surface spec already determines them; otherwise leave them to `verify`/`decompose`.

## Principal ADVISORY codes (prose set `SOL-P050`–`SOL-P058`)

ADVISORY iff the defect affects only **how it reads** — style, length, voice, redundancy — without changing built behaviour. Emit `warning`; never block on their own unless promoted by strict mode (see the SOL error catalogue).

| Code | Defect (style only) |
| --- | --- |
| `SOL-P050` | Pronoun / vague reference without a unique antecedent. |
| `SOL-P051` | Passive voice where an active actor+action is clearer. |
| `SOL-P052` | Sentence length exceeds ~20 words. |
| `SOL-P053` | Non-present or non-active tense. |
| `SOL-P054` | Prose noise: a decorative phrase that adds no constraint, context, or evidence. |
| `SOL-P055` | Redundancy: repeated context that adds no new constraint. |
| `SOL-P056` | Comparative / superlative without a baseline — **ADVISORY in commentary, BLOCKING in a binding clause** (see the APS prose standard). |
| `SOL-P057` | Terminology drift: a term used inconsistently with its `memory/glossary.md` definition (still resolves, so not the blocking `SOL-P006`). |
| `SOL-P058` | Deprecated modal alias: `SHALL`/`SHALL NOT` used as a modal (a recognized alias of `MUST`/`MUST NOT`, see the SOL reference). |

## Code → `improve` op map (the `suggest` field)

`lint` only *names* the repair in `suggest`; applying it is the `improve` pass, which MUST be strictly semantics-preserving. The full map is in the `improve` pass; the common rows:

| Lint code(s) | `improve` op | What the op does |
| --- | --- | --- |
| `SOL-P003` (+ `SOL-V###`) | `NORMALIZE` | Make the modality explicit / binding. |
| `SOL-P004` | `ATOMIZE` | Split a bundled obligation into separate ones. |
| `SOL-P005` | `CONCRETIZE` or `QUANTIFY` | Substitute observable behaviour, or a measurable threshold. |
| `SOL-V001` (+ `SOL-V###`) | `BIND` | Attach a `VERIFY BY` proof path. |
| `SOL-O###` | `SCOPE` | Re-scope the write surface / packet. |
| `SOL-P008` | `CLARIFY` (the *op*) | Create the explicit interpretation or `QUESTION` from one buried ambiguity. |
| `SOL-M002` | `DECONFLICT` | Resolve a contradiction between two obligations. |
| `SOL-P054`, `SOL-P055` | `COMPRESS` | Drop noise / redundancy without losing a constraint. |

`null` is a valid `suggest` value when no named op applies.

## Worked diagnostic record

A single conformant `{ code, severity, layer, span, message, suggest }` record (shape fixed by the SOL error catalogue):

```json
{
  "code": "SOL-P005",
  "severity": "BLOCKING",
  "layer": "P",
  "span": { "file": "auth-refresh.swarm.md", "block": "AC-001", "line": 22, "col": 9 },
  "message": "Vague-quality word 'gracefully' in a binding clause with no same-line observable criterion.",
  "suggest": "CONCRETIZE: replace with actor+action+object, or bind a VERIFY BY target."
}
```

The IR lowers the same data SARIF-shaped into `diagnostics[]`: `severity`→`level` (`BLOCKING`→`error`, `ADVISORY`→`warning`), `span`→`source { file, line_start, line_end }`, `code` identical across both, and `to: off` waivers suppressed from the array entirely (a waiver is not an IR `level`).

## Waiver record (required fields)

A BLOCKING code may be demoted only through one config surface (root `swarm.config.json`/`.yaml`, or the `lint:` section of `.swarm/config.yaml`) and only with a complete waiver. All fields are required (see the SOL error catalogue); an incomplete record does not take effect and the blocker stands:

`code`, `scope`, `to` (`warning` | `off`), `authority`, `reason`, `expiry`, `recorded_at`.

A waiver auto-expires at its `expiry` date *and* on the next change to the waived obligation's source content-hash, whichever comes first (prevents zombie waivers). Promotion of an ADVISORY code to `error` (strict mode) is always permitted and needs no record beyond the config entry.
