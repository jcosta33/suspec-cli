# APS — Agent Prose Semantics

> Swarm's reference for Agent Prose Semantics: the doctrine, binding-clause vs commentary boundary, high-risk word catalogue, same-line observable rule, `SOL-P` code mapping, and rationale anchors that govern every word of prose around a SOL block.

APS (Agent Prose Semantics) is the controlled-prose standard for every word of natural-language prose that surrounds, introduces, or accompanies SOL blocks in a Swarm spec or working artifact. SOL is the obligation language; **APS is the standard for everything that is *not* a SOL block**.

Swarm is markdown-only and has no runtime. Every "linter," "parser," or "checker" named here is a **contract** that a future tool builds against — not shipped code. APS defines what such a tool must accept, flag, or reject; it never executes anything itself. The lint pass (`../passes/lint.md`) is where these prose checks are run against an artifact.

## 1. Doctrine: prose is a non-authoritative delivery layer

### 1.1 The authority rule

All **load-bearing meaning** in a Swarm repo MUST live in SOL blocks and the typed IR. The load-bearing facts are:

- modality
- actor
- trigger / state
- verification binding
- authority order
- conflict resolution
- trace schema

Prose, skills, personas, and `AGENTS.md` are **non-authoritative delivery layers**: they carry context and guidance, never binding force.

A Swarm tool, author, or downstream agent MUST NOT treat any prose span as a source of an obligation, a verdict, a verification requirement, an authority ranking, or any other load-bearing fact. **If a fact is load-bearing, it MUST be expressed as (or promoted into) a typed SOL block; until it is, it has no force.**

### 1.2 The word-economy rule

Every word of Swarm prose SHOULD do at least one of eight jobs. A word that does none is **prose noise** and SHOULD be removed (advisory `SOL-P054`).

| Job | Meaning |
|---|---|
| constrain behavior | states or qualifies what something must do |
| clarify context | supplies the situation an obligation answers |
| define scope | bounds what is and is not in play |
| identify evidence | names how a claim is checked |
| bind traceability | links to a stable id (`AC-001`, `T-001`, a finding) |
| aid retrieval | a keyword a future agent will search for |
| mark uncertainty | flags a gap to be lifted to a `QUESTION` |
| explain rationale | records *why*, durably |

### 1.3 Properties of conformant prose

Good Swarm prose is **concrete, observable, atomic, scoped, verifiable, traceable, non-decorative, and low-entropy**. An author MUST prefer observable verbs over vague action verbs:

- **Observable:** `return`, `show`, `reject`, `record`, `persist`, `redirect`, `retry`, `deny`, `notify`, `log`, …
- **Vague (high-risk):** `handle`, `support`, `manage`, `improve`, `optimize`, `streamline`, `enhance`, `modernize`, `clean up`, `make robust`.

A vague action verb in prose is governed by the high-risk word rules (sections 3 and 4 below).

```text
Bad (decorative, vague verb, no observable behavior):
  Improve checkout so it handles failures gracefully.

Good (every clause observable; the load-bearing meaning is in SOL):
  REQ AC-001:
  IF the payment provider times out
  THEN THE server MUST NOT create an order
  AND THE server MUST record a retryable payment attempt
  AND THE client MUST show "Payment temporarily unavailable"
  VERIFY BY test:cmdTest:payment-timeout.test#no-order
```

## 2. The binding-clause vs commentary boundary

The force of every APS rule depends on **where** a prose span sits. The boundary is **mechanical and parser-decidable** — a future linter needs no heuristic to apply it:

- A span is **BINDING** if and only if it is inside a typed obligation block: `REQ`, `CONSTRAINT`, or `INVARIANT` — the three obligation block types that carry binding force.
- A span is **COMMENTARY** in every other position: ordinary Markdown prose; headings; `INTERFACE`, `QUESTION`, `TRACE`, and `VERDICT` block bodies; the `BECAUSE` rationale of an obligation; and any `## Context` section.

APS prose rules apply **with full force** (BLOCKING where the rule is blocking) inside BINDING spans, and **as advisories only** inside COMMENTARY spans. One consequence is pinned explicitly: a comparative or superlative without a baseline is **BLOCKING** (`SOL-P056` promoted) inside a binding clause and **ADVISORY** (`SOL-P056` default) in commentary.

```text
COMMENTARY (advisory only — "messy" is tolerated, it explains):
  ## Context
  The existing auth flow is messy and users see repeated failed refresh calls.

BINDING (full force — an unobservable word here is blocking SOL-P005):
  REQ AC-001:
  WHEN the session is expired
  THE client MUST redirect to `/login`
  VERIFY BY test:cmdTest:expired-session-redirect.test
```

*Design rationale:* commentary explains and may be loose; a binding clause *is* the obligation, so an unobservable word inside it directly changes what gets built. Because the boundary is decidable from block type alone, the rule needs no judgement call.

## 3. The high-risk word catalogue

A **high-risk word** is a word or phrase that, used in a binding clause without a same-line observable criterion, leaves *what gets built* underdetermined. The catalogue draws on established requirement-smell vocabularies, extended with companion quantifier, connective, and pronoun lists.

It is **closed for v0.1**: these families are the lint-checked set. A project MAY extend its own list via configuration, but MUST NOT shrink the kernel set.

| Family | Examples (non-exhaustive within family) | Default lint |
|---|---|---|
| Subjective / promotional | `robust`, `clean`, `simple`, `intuitive`, `user-friendly`, `easy to use`, `modern`, `seamless`, `flexible`, `elegant`, `beautiful`, `polished`, `nice`, `flamboyant`, `innovative`, `world-class`, `correct`, `appropriate`, `proper`, `reasonable` | `SOL-P005` |
| Non-verifiable quality | `fast`, `performant`, `scalable`, `secure`, `safe`, `reliable`, `consistent`, `graceful`, `sufficient`, `adequate` | `SOL-P005` |
| Vague action verbs | `handle`, `support`, `manage`, `improve`, `optimize`, `enhance`, `streamline`, `modernize`, `clean up`, `make robust` | `SOL-P005` |
| Loopholes | `as far as possible`, `if practical`, `where feasible`, `if possible`, `to the extent practicable` | `SOL-P005` |
| Ambiguous qualifiers | `significant`, `minimal`, `almost always`, `as needed`, `where appropriate` | `SOL-P005` |
| Comparatives / superlatives | `better`, `faster`, `more efficient`, `higher`, `best`, `highest`, `most`, `optimal` | `SOL-P056` (blocking in binding clause) |
| Quantifiers (ambiguous scope) | `all`, `any`, `every`, `some`, `each`, plural nouns used as the actor | `SOL-P005` (scope) |
| Connectives (ambiguous bundling) | `and`, `or`, `and/or`, `but`, `also` joining separable obligations | `SOL-P004` (bundling) |
| Ambiguous exceptions | `unless`, `except where` (without a positive reformulation) | `SOL-P005` / prefer `IF`/`WHEN` |
| Vague references | `it`, `they`, `this`, `that`, `the above`, `the previous one`, `this thing` (no unique antecedent) | `SOL-P050` (advisory) / `SOL-P002` (if it hides the actor) |

A bare `MUST NOT` prohibition with no paired affirmative behavior is a related **negation hazard** (`SOL-P007`): the author MUST state what the actor does instead, because a bare prohibition leaves the affirmative behavior under-determined (design rationale).

## 4. The "same line makes it observable" rule

A high-risk word appearing in a **binding** clause is permitted **if and only if** the same sentence, the same bullet, or the immediately-following line converts it into observable behavior by supplying at least one of:

1. an **actor + action + object** triple (who does what to what), or
2. a **measurable threshold** (a number, bound, rate, or comparison with units), or
3. a **named verification target** (a `VERIFY BY` binding, or a named test / contract / metric).

If none is present on the same line, the word is a **blocking `SOL-P005`** (or `SOL-P056` for an unbaselined comparative, or `SOL-P004` for a bundling connective).

The repair MUST be a **named improve operation** — `CONCRETIZE` (replace the vague word with observable behavior) or `QUANTIFY` (replace an unbounded quality with a threshold) — with an explicit exit condition. An author or tool MUST NOT resolve `SOL-P005` by open-ended stylistic rewriting; the defect is a missing observable criterion, and only `CONCRETIZE` / `QUANTIFY` close it.

```text
Blocking (high-risk "fast" in a binding clause, no same-line criterion):
  REQ AC-002:
  THE search endpoint MUST be fast        -> SOL-P005 (blocking)

Permitted via QUANTIFY (same-line measurable threshold):
  REQ AC-002:
  WHEN the index holds <= 1,000,000 rows
  THE search endpoint MUST return results within a 200 ms p95 latency
  VERIFY BY perf:cmdBenchmark:search-latency.bench#p95
```

## 5. APS rule families mapped to `SOL-P` codes

Every APS rule family resolves to **exactly one** prose-layer lint code in the unified taxonomy: APS violations surface as `SOL-P` codes. The earlier `APS-*` code prefix is retired; this `SOL-P` mapping is canonical and supersedes it. Full code definitions and the lint taxonomy (the S/P/M/V/O layers) live in [errors](errors.md).

| APS rule family | `SOL-P` code | Severity | Repair op |
|---|---|---|---|
| Dangling condition (trigger, no modal consequence) | `SOL-P001` | BLOCKING | author rewrite / `NORMALIZE` |
| Missing actor | `SOL-P002` | BLOCKING | `CONCRETIZE` |
| Missing / informal modality (`should`→`SHOULD`) | `SOL-P003` | BLOCKING | `NORMALIZE` |
| Bundled / overloaded obligation (connectives) | `SOL-P004` | BLOCKING | `ATOMIZE` |
| Vague-quality word, no same-line observable | `SOL-P005` | BLOCKING | `CONCRETIZE` / `QUANTIFY` |
| Undefined term in a binding clause | `SOL-P006` | BLOCKING | `CLARIFY` / `BIND` (glossary) |
| Negation ambiguity (bare `MUST NOT`) | `SOL-P007` | BLOCKING | `CLARIFY` (pair affirmative) |
| Uncaptured behavioral uncertainty not lifted to `QUESTION` | `SOL-P008` | BLOCKING | `CLARIFY` |
| Pronoun / vague reference | `SOL-P050` | ADVISORY | `CONCRETIZE` |
| Passive voice | `SOL-P051` | ADVISORY | `NORMALIZE` |
| Sentence length (> ~20 words) | `SOL-P052` | ADVISORY | `ATOMIZE` / `COMPRESS` |
| Non-present / non-active tense | `SOL-P053` | ADVISORY | `NORMALIZE` |
| Prose noise (decorative phrase) | `SOL-P054` | ADVISORY | `COMPRESS` |
| Redundancy (repeated context, no new constraint) | `SOL-P055` | ADVISORY | `COMPRESS` |
| Comparative / superlative without baseline | `SOL-P056` | ADVISORY in commentary, **BLOCKING in a binding clause** | `QUANTIFY` |
| Terminology drift (term inconsistent with `memory/glossary.md`) | `SOL-P057` | ADVISORY | `NORMALIZE` |

Cross-layer companions an APS reviewer commonly meets (defined in [errors](errors.md)): `SOL-M001` actor/object incompleteness, `SOL-M002` contradiction, `SOL-V001` no verification path.

## 6. Rationale anchor

APS exists because of a **durable mechanism**, not a transient capability ceiling. Specs, refs, and ADRs that justify APS MUST anchor on the following five properties, and MUST NOT anchor on any dated model-accuracy number.

1. **Format and order sensitivity** — meaning-preserving reformatting alone can swing few-shot accuracy substantially, and the same input shape that works well for one model need not transfer to another; example and prompt ordering can independently swing results between near-best and near-random. Controlled, predictable prose shape reduces this variance.
2. **Multi-turn decay** — reliability falls as work is spread across many conversational turns, because early loose assumptions compound; stable artifacts beat accumulating chat.
3. **Context rot / lost-in-the-middle** — relevant content buried in the middle of long inputs is used markedly less reliably than content at the beginning or end of the context; low-entropy prose keeps the load-bearing signal legible.
4. **Minimize always-on density to protect adherence and control cost** — every always-loaded normative line competes for adherence and is paid for on every turn; APS removes non-load-bearing words so the surviving instructions are followed and cheap.
5. **Requirement ambiguity degrades generated code** — ambiguous task descriptions measurably lower the share of generated code that passes its tests, and outright contradictory descriptions degrade it further; the defect originates in the requirement, not the model. APS lints buried ambiguity (`SOL-P008`) and lifts it into a `QUESTION` before lowering, removing the defect at its source.

### Superseded figure (MUST NOT cite as a ceiling)

No fixed "accuracy at N instructions" figure may be cited as a capability ceiling or as the justification for APS density limits. The durable finding is directional, not numeric: instruction-following accuracy *degrades* as instruction density rises, with a primacy bias toward earlier instructions — which *supports* a density cap rather than refuting it. Preliminary or vendor re-runs reporting much higher counts on keyword-inclusion proxy tasks MUST NOT be cited as an established ceiling either. Any surviving numeric capability claim MUST carry an "evidence as of <date>" caveat. The density discipline rests on adherence-and-cost economics (#4), not on a claim that models cannot follow many instructions.

## Related

- `./SOL.md` — the obligation language APS prose surrounds; the `REQ`/`CONSTRAINT`/`INVARIANT` blocks that make a span BINDING, plus the SOL block grammar and the typed IR that load-bearing meaning lowers into.
- `./errors.md` — the full S/P/M/V/O lint taxonomy and per-code definitions, including every `SOL-P` code mapped here.
- `./versioning.md` — how the high-risk catalogue's "closed for v0.1" set and its project extensions evolve.
- `../passes/lint.md` — the pass that runs these prose checks against an artifact and emits the `SOL-P` diagnostics.
