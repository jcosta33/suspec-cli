# The `author` pass

`author` is the first of the **nine passes** of the Swarm compiler pipeline (`author -> lint -> improve -> lower -> decompose -> implement -> verify -> review -> promote`). This file is the working contract for that single pass.

Like every Swarm pass, `author` has **no runtime**: it is a contract a human, an agent following a pass guide, or a future tool performs. Nothing here is shipped code.

## What the pass does

The `author` pass **captures human intent as SOL obligations and APS prose**, producing the first compiler-visible artifact of the pipeline.

| Aspect | Value |
|---|---|
| Phase(s) | **entry** — pre-`PARSE` |
| Input artifacts | chat, `research.md`, `audit.md`, `bug-report.md`, prior `spec.swarm.md` |
| Output artifact | `spec.swarm.md` (draft: prose + SOL blocks) |
| Typical carrier profile | Architect (spec), Surveyor/Researcher (research), Auditor (audit), Bug Hunter (bug-report) |
| Lint layer | — (produces the input to `lint`; emits no lint codes itself) |

## Where it sits in the pipeline

The seven **phases** are `PARSE -> NORMALIZE -> LOWER -> EXECUTE -> VERIFY -> REVIEW -> PROMOTE`. `author` is deliberately **outside** that phase taxonomy: it is the *entry pass* that runs **before `PARSE`**, because its output (`spec.swarm.md`) is the first artifact the compiler can see.

Two contract notes follow from this position:

- **`author` is not itself analyzable.** Everything *downstream* of `author` is analyzable; the author pass is the boundary at which un-structured intent (chat, working documents) becomes the structured, compiler-visible spec. Analysis begins at `lint` (the `PARSE` + `NORMALIZE` pass), not at `author`.
- **`author` feeds `lint`.** The next pass, `lint`, is non-mutating and decides well-formedness; the only pass permitted to rewrite the spec is `improve`, and only semantics-preservingly. So `author` is where new intent legitimately *enters*; passes after it normalize and lower that intent rather than re-invent it.

## `author` ships author guides, not a pass guide

The shipped stdlib guide set (ADR-0042) is: a dedicated pass guide for each of `lint`, `decompose`, `review[profile: skeptic]`, and `promote`; nine per-`task_kind` `implement` guides (`write-feature`/`fix`/`refactor`/`rewrite`/`migration`/`performance`/`testing`/`documentation` + `fix-flaky-test`); six author guides (`write-spec`/`audit`/`research`/`bug-report`/`prd`/`rfc`); and two cross-cutting fragments (`empirical-proof`, `distillation-discipline`). Each ships as a standalone `SKILL.md` carrier under `../skills/`.

`author` is **not** served by a single pass guide: it is served by the **six author guides** — `../skills/write-spec/SKILL.md`, `../skills/write-audit/SKILL.md`, `../skills/write-research/SKILL.md`, `../skills/write-bug-report/SKILL.md`, `../skills/write-prd/SKILL.md`, and `../skills/write-rfc/SKILL.md` — one per recognized parent that normalizes into a spec. Across the nine passes, `lint`, `decompose`, `review`, and `promote` each ship a dedicated pass guide; `implement` is served by the nine per-`task_kind` implement guides; `author` by these six author guides; and `verify` is served by the `empirical-proof` cross-cutting fragment. Only `improve` and `lower` ship **no** guide — they are *fully specified by their pass contract and the language references* and MAY gain a guide in a later framework release without any language-version bump; a guide-less pass is not a conformance gap. A pass guide, when it exists, is SOFT control (Invariant 2): it MUST NOT define SOL/APS semantics, modality, authority order, or verification meaning.

## Authoring is parent-normalization: epistemic stances are preserved

`author` is the pass through which a spec's recognized **parents** normalize into `spec.swarm.md`. The recognized parents are PRD, research, RFC, ADR, audit, bug-report, finding, use-case/examples, NFR/SLO, and interface sources (OpenAPI / GraphQL / DB schema).

Each parent carries an **epistemic stance** — what kind of knowledge it is allowed to assert — and that stance is **normative**: it MUST be preserved when the parent is promoted into a spec (or, for a bug-report, into a fix task). The `author` pass is where most of this normalization happens (the rows below marked "via `author`"):

| Parent artifact | Epistemic stance | Promotes to |
|---|---|---|
| `spec.swarm.md` | **intent** — declares required behavior as SOL obligations | (is the authority; lowers to tasks) |
| `audit.md` | **observation-only** — describes present state and risk; asserts no new intended behavior | a `spec.swarm.md` (via `author`) |
| `bug-report.md` | **diagnosis-only** — reproduces and root-causes a defect; prescribes no fix | a **fix task** (`implement`) |
| `research.md` | **inquiry** — surveys options and evidence; commits to no decision | a `spec.swarm.md` (via `author`) |
| `prd.md` | **intent** — states desired product outcomes; non-authoritative until authored | a `spec.swarm.md` (via `author`) |
| `rfc.md` | **proposal** — proposes a design/approach; commits nothing until accepted | a `spec.swarm.md` (via `author`) or an `adr.md` |
| `use-case.md` / examples | **scenario** — illustrates desired behavior by example | `REQ`/`INTERFACE` blocks in a `spec.swarm.md` (via `author`) |
| `nfr.md` / SLOs | **quality attribute** — states non-functional targets | `CONSTRAINT`/`INVARIANT` blocks + verification rows (via `author`) |
| interface source (OpenAPI/GraphQL/DB schema) | **boundary shape** — declares an interface contract | `INTERFACE` blocks (via `author`) |
| `finding.md` | **evidence** — one durable, evidenced project fact | governs as Axis-A rank 3 once accepted |
| `adr.md` | **decision** — an immutable architecture decision (Nygard) | governs as Axis-A rank 1 |

### The stance invariants `author` must honor

- An `audit.md` MUST NOT contain `REQ`/`CONSTRAINT`/`INVARIANT` obligation blocks of its own intent. Observed risk has obligation force only **after** it is promoted *into* a spec — and that promotion is the `author` pass.
- A `bug-report.md` MUST NOT prescribe an implementation. Its diagnosis promotes *into* a **fix task** (an `implement`-pass input), not into a fix it dictates.
- More generally, `author` must not let a lower-stance parent smuggle higher-stance content across the boundary: an observation, an inquiry, or a proposal becomes binding **intent** only when authored into a `spec.swarm.md`, where SOL obligations carry that force.

Authoring writes the one human-authored compiler-visible artifact, `spec.swarm.md`: the `.swarm.` infix marks it as such. Every other parent in the table above is plain `.md` (a working artifact); `author` MUST NOT introduce per-parent `.swarm.*` names for audit / research / bug-report / finding / adr.

## What gates the boundary — but not via `author`

`author` itself emits no lint codes and runs no gate; it produces the draft that the rest of the pipeline analyzes. The disciplines that *guard* the content `author` produces live downstream and are referenced here only for orientation: forbidden compositions (e.g. a file that is both a spec and an audit) are enforced not by `author` and not by a gatekeeper skill, but by the **distillation loss budget** and **source authority**. Re-introducing a composition-policing skill is forbidden, because such a skill would be a semantic owner and soft control presented as enforcement (Invariant 2).

## Related

- `../passes/lint.md` — the next pass; non-mutating well-formedness analysis that consumes the `author` draft.
- `../passes/improve.md` — the only pass permitted to rewrite the spec, and only semantics-preservingly.
- `../passes/lower.md`, `../passes/decompose.md`, `../passes/verify.md` — the rest of the downstream pipeline that normalizes and lowers authored intent rather than re-inventing it. `verify` is served by the `empirical-proof` cross-cutting fragment rather than a dedicated pass guide.
- `../language/SOL.md` — the obligation language `author` writes into `spec.swarm.md`.
- `../templates/spec.swarm.md` — the one human-authored compiler-visible artifact `author` produces.
- `../templates/audit.md`, `../templates/research.md`, `../templates/prd.md`, `../templates/rfc.md`, `../templates/bug-report.md`, `../templates/finding.md`, `../templates/adr.md` — the recognized parents `author` normalizes (each carries the epistemic stance the table above pins).
- `../skills/write-spec/SKILL.md`, `../skills/write-audit/SKILL.md`, `../skills/write-research/SKILL.md`, `../skills/write-bug-report/SKILL.md`, `../skills/write-prd/SKILL.md`, `../skills/write-rfc/SKILL.md` — the six author-guide carriers that serve this pass, one per recognized parent.
- `../skills/persona-architect/SKILL.md`, `../skills/persona-surveyor/SKILL.md`, `../skills/persona-researcher/SKILL.md` — typical carrier profiles for the `author` pass.
