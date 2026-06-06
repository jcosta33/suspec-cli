# Versioning

> Swarm's reference for versioning: the two independent version axes, the one-way trigger between them, and the three version fields a reader sees in frontmatter and the IR.

Swarm carries **two independent version axes**. Conflating them is a category error: one tracks the *meaning of the language*, the other tracks *the package that delivers it*. A conformant repo MUST track both and MUST NOT merge them into a single number (§1).

This language is **version 0.1**. The framework package that delivers it carries its own semver, independent of that `0.1`.

A third version — the **spec content version** — is not a system-wide axis but a per-document fact: the semver of *one* spec's intent. It surfaces as its own field in the IR/plan (§3) and in frontmatter (§4), so a complete count of *fields a reader sees* is **three**, drawn from **two** axes.

## §1 — The two axes

This is the normative labelling convention for both axes — what each one versions, where it is carried, and how fast it moves:

| Axis | What it versions | Carried in | Cadence |
| ---- | ---------------- | ---------- | ------- |
| **Language version** | The SOL + APS feature set: grammar, the 7 block types, the 5 modals, the clause keywords, the `SOL-<LAYER>NNN` lint codes | `*.swarm.md` frontmatter as the discriminator `swarm_language: SOL/0.1` (plus `aps_version`); echoed in the IR as `meta.language` | Small, slow-moving: `0.1`, `0.2`, `1.0` |
| **Framework / package version** | The kernel payload, templates, pass guides, and profiles (the flow-graph and skills that ship with the package) | `kernel/.agents/.swarm-version` → an adopted project mirrors it as `.swarm/VERSION` (semver) | Ordinary, fast semver; may move many times between language bumps |

(The block-type, modal, and lint-layer counts above are the kernel's fixed vocabulary — 7 block types, 5 modals, 5 lint layers S/P/M/V/O. This page reproduces those counts as labels for the language axis; the vocabulary itself is defined in `./SOL.md` (blocks and modals) and `./errors.md` (lint layers).)

### §1.1 — Language version: "which grammar does this file speak?"

The language version answers **"which grammar, blocks, modals, and lint codes does this file speak?"** It is carried **per file**, so a single repo MAY hold `spec.swarm.md` files at different language versions during a migration. Two frontmatter fields carry it:

- `swarm_language` — the **SOL discriminator**, written `SOL/0.1`.
- `aps_version` — the **APS prose-standard version**, written `0.1`.

This document is language `0.1`; later language epochs are `0.2`, then `1.0`.

### §1.2 — Framework / package version: "which kernel payload shipped this repo?"

The framework version answers **"which kernel payload, templates, and pass guides shipped this repo?"** It is a single semver string in `kernel/.agents/.swarm-version`; an adopted project mirrors it as `.swarm/VERSION`. It is **never** written in per-file frontmatter (§4). The language axis sits *alongside* the package axis, not in place of it: the framework version file predates the per-file language fields, and both coexist — the version file tracks the package, the frontmatter tracks the grammar.

## §2 — The one-way trigger

The axes are independent, but coupled by exactly **one** directional rule:

> **Any change to the SOL/APS language version MUST force at least a framework MINOR release** — additive language change → framework MINOR; breaking language change → framework MAJOR. The framework MAY release any number of versions (PATCH / MINOR / MAJOR) **without** changing the language version.

```text
language change ──(MUST)──▶ framework MINOR (additive) or MAJOR (breaking)
framework change ──(MAY)──▶ no language change required
```

The rationale: a new keyword or lint code changes what the templates and pass guides must teach, so the package that ships them MUST move; but fixing a template typo or adding a skill never touches the grammar, so the language MUST stay pinned. The trigger runs **one way only** — language ⇒ framework, never framework ⇒ language.

**0.y.z caveat (do not over-read the trigger).** While both axes sit at major-version-zero, semantic versioning holds that *anything MAY change at any time* below `1.0`, so the trigger is **advisory until each axis reaches 1.0**. Even after 1.0 it is a one-directional *floor* — a language change forces at least a framework MINOR — not a promise that every framework release re-issues the language.

## §2.1 — Editions / MSRV analogues

The two-axis split mirrors mature language ecosystems that version the *language* separately from the *toolchain* delivering it — Rust's editions / `rust-version` MSRV / cargo release, and C#'s `LangVersion` (bounded by the installed compiler) — each joined by a one-way constraint, the same shape as Swarm's language ⇒ framework trigger. The takeaway: the *language API* (grammar + lint codes) and the *package API* (template sections + skills + flow-graph) are versioned as **separately-named public APIs**.

## §3 — Three distinct fields in the IR / plan

The emitted IR and plan MUST echo **three distinct fields**, and a conformant tool MUST NOT merge any two of them:

| Field | Axis / meaning | Example |
| ----- | -------------- | ------- |
| `meta.language` | The SOL **discriminator** — which grammar this IR was parsed under | `"SOL/0.1"` |
| `meta.version` | The **spec content version** — the semver of *this spec's intent*, independent of language and framework | `"0.1.0"` |
| `provenance.compiler_version` | The **tool version** that emitted the IR, when a tool exists | `null` / unset today (no runtime) |

```json
{
  "meta": {
    "language": "SOL/0.1",
    "version": "0.1.0",
    "title": "auth-refresh"
  },
  "provenance": {
    "compiler_version": null
  }
}
```

These answer three different questions — *which grammar* (`meta.language`), *which revision of this spec's intent* (`meta.version`), and *which tool produced this* (`provenance.compiler_version`) — and a single number cannot answer all three. `provenance.compiler_version` is `null` today because Swarm has no runtime: the parser, linter, and checker are contracts a future tool builds against, never shipped code.

## §4 — G10: canonical frontmatter

To make the three-field mapping unambiguous, the kernel pins **one** frontmatter vocabulary across all `.swarm.md` and template files (rule G10):

```text
---
swarm_language: SOL/0.1   # SOL discriminator (= meta.language in the IR)
aps_version: 0.1          # APS prose-standard version
spec_version: 0.1.0       # spec content version (= meta.version in the IR)
---
```

| Frontmatter field | Maps to IR field | Axis |
| ----------------- | ---------------- | ---- |
| `swarm_language: SOL/0.1` | `meta.language` | Language (discriminator) |
| `aps_version: 0.1` | (not echoed in IR; governs the `SOL-P…` prose lint layer) | Language |
| `spec_version: 0.1.0` | `meta.version` | Spec content |

**Conformance note.** The canonical form is `swarm_language: SOL/0.1` (with the `SOL/` discriminator) plus a separate `spec_version`. A conformant repo MUST use this form; a bare `swarm_language: 0.1` (a number with no discriminator) is a `SOL-S…`-class frontmatter diagnostic (the `SOL-S` structural lint layer; see `./errors.md`). The framework version is **never** written in per-file frontmatter — it lives only in the framework version file (`kernel/.agents/.swarm-version`; `.swarm/VERSION` in an adopted project).

## Related

- `./SOL.md` — the grammar, 7 block types, and 5 modals that the language axis versions.
- `./APS.md` — the prose standard carried by `aps_version`.
- `./errors.md` — the `SOL-<LAYER>NNN` lint catalogue, including the `SOL-S` frontmatter diagnostics referenced above.
- `../passes/lint.md` — the lint pass that flags a bare-number `swarm_language` as a `SOL-S` diagnostic.
