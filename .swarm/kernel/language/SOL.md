# SOL — The Swarm Obligation Language (Surface Reference)

> Swarm's reference for the SOL surface language: the human-authored syntax, the seven block types, and the modal/verdict grammar you write inside `*.swarm.md` files.

SOL (Swarm Obligation Language) is the human-authored surface language that appears inside `*.swarm.md` files. It is **markdown-only and provider-neutral**: nothing here is shipped code. A "parser", a "linter", and a "lowering" step are described as *contracts* a future tool would build against, never as software this repository runs.

This page covers what you need to *write* SOL by hand. The snake_case IR/JSON layer is emitted from SOL, never authored — out of scope here.

---

## 0. Two layers of modal language (read this first)

SOL documents are written in two distinct languages, and the reader MUST keep them separate. The same words — `MUST`, `MUST NOT`, `SHOULD`, `SHOULD NOT`, `MAY` — appear in both, but they mean different things depending on which layer they sit in.

- **The meta-language** is ordinary prose *about* SOL: this reference page, your own design notes, an AGENTS.md, a pass guide. Its normative keywords — **MUST, MUST NOT, SHOULD, SHOULD NOT, MAY, REQUIRED, OPTIONAL** — are interpreted per RFC 2119 / RFC 8174 and carry force *only* when uppercase. They are **directives to the reader/author/tool**. Example: "An `INTERFACE` block MUST carry a `VERIFY BY contract:` binding" is a rule this page levies on whoever writes an INTERFACE.
- **The object-language** is SOL itself — the obligation text a human writes *inside* `*.swarm.md`. SOL's own modals (`MUST`/`MUST NOT`/`SHOULD`/`SHOULD NOT`/`MAY`; §2.4) decorate obligations and are **data being specified**, not directives to anyone reading this page. Example: in the SOL line `THE client MUST clear the local session`, the word `MUST` is an SOL token whose semantics §2.4 / §3 define — it is a fact recorded *about the client*, not a requirement levied on the reader.

The discriminator is the fence. **Every SOL fragment, grammar production, and template skeleton in this page sits inside a fenced code block tagged `sol` or `ebnf`; modal words inside such a fence are object-language (data).** Modal words in running prose are meta-language (directives). This is why, throughout this page, a sentence like "a binding REQ MUST carry a `VERIFY BY`" is a rule you must follow, while the `MUST` inside a `sol` example is just the obligation's recorded modality.

A practical consequence: when a tool reads a `*.swarm.md`, it must treat the modals inside SOL blocks as the obligation's *content* (what to lower, judge, and verify), never as instructions addressed to the tool itself.

---

## 1. The layering rule (surface vs IR)

There is one master layering of the language:

- **Surface** is English-shaped **UPPERCASE keywords** — what a human writes.
- **IR** is **snake_case fields** — what a tool *emits*, never authored.

Wherever the surface gives a keyword (`VERIFY BY`, `DEPENDS ON`, `OWNED BY`), the corresponding IR field (`verify_by`, `depends_on`, `owner`) is reserved for the IR layer and MUST NOT appear at the surface. A conformant SOL document is a Markdown document in which obligation content is expressed as SOL *blocks* interleaved with APS-controlled prose (the prose standard; see `./APS.md`).

---

## 2. Lexical and structural rules

### 2.1 The block header — the one normative delimiter

A SOL block is introduced by a **bare header line** of the exact form:

```ebnf
block_header = block_type, ws, id, ":", nl;
block_type   = "REQ" | "CONSTRAINT" | "INVARIANT" | "INTERFACE"
             | "QUESTION" | "TRACE" | "VERDICT";
```

The header is one line: the block-type keyword, one or more spaces, the block id, and a **mandatory trailing colon**.

```sol
REQ AC-001:
```

The trailing colon is REQUIRED. `REQ AC-001` (no colon) is not a header — it is prose, and any clauses that follow are unparsed. The colon is the delimiter that opens a block body. Only two block types decorate the header line:

- a `QUESTION` carries its `[blocking|non-blocking]` tag **before** the colon: `QUESTION Q-001 [blocking]:`
- a `VERDICT` carries its core value **after** the colon: `VERDICT AC-001: PASS`

For every other block the header is exactly keyword + id + colon, with the body on the following lines.

*Design rationale:* leading-keyword bare lines are a familiar requirement-grammar shape; the mandatory colon (a deliberate v0.1 choice) makes the header unambiguously machine-detectable inside free Markdown.

### 2.2 Body line-grouping

A block **body** is the maximal run of contiguous non-blank lines immediately after the header, terminated by the first of:

1. the next block header (`TYPE PREFIX-NNN:`);
2. a **blank line** (one or more newline-only lines);
3. a **Markdown heading** (a line beginning with `#` + space).

No other construct closes a body. There is **no closing delimiter and no significant indentation**. A body line that merely begins with a keyword *word* but lacks the `id:` tail (e.g. an INVARIANT predicate that mentions "INTERFACE contracts") is body content, not a header.

Consequence for authors: you **MUST NOT** place a blank line *inside* a block body — the blank line terminates it. Multi-item clauses (e.g. INTERFACE `ERRORS:`) therefore use **contiguous indented bullet continuation lines**, never blank-separated lists.

Leading indentation on body **clause** lines is non-semantic: it is stripped before matching. Block **headers** MUST remain flush-left.

### 2.3 Rejected surface forms

These three forms are **rejected** for v0.1:

| Rejected form | Why | Future status |
|---|---|---|
| Fenced delimiter `:::REQ … :::END` | A nested fence is fragile inside Markdown and redundant with the bare-header rule. | MAY become an OPTIONAL editor alias later; never normative in v0.1. |
| In-block YAML metadata (`verify:` as a YAML key inside a block) | Splits one obligation across two syntaxes; breaks line-grouping. Use inline keyword clauses instead. | Rejected; metadata is surface clauses (§3.8 below). |
| Significant indentation (Indent/Dedent nesting) | Markdown renderers reflow indentation, so it cannot carry meaning. | Rejected; structure comes from the line-grouping rule. |

### 2.4 Keywords, case, and modals

SOL keywords are **UPPERCASE and case-sensitive**, and the keyword set is **closed** (block types, modals, and per-block clause keywords). Lowercase `must`, `should`, `may`, `can`, `will` are **plain prose** and carry no normative force; only the uppercase modals bind. (These uppercase modals are SOL's *object-language* modals — data recorded about an actor — distinct from the RFC-2119 directives in this page's prose; see §0.)

**Conditions are opaque text in v0.1.** The text after `WHEN`/`WHILE`/`WHERE`/`IF` is captured verbatim as a string. SOL v0.1 defines no expression sublanguage, operators, or boolean structure over conditions — a tool MUST NOT attempt to evaluate them. The expression sublanguage and the timing keywords (`WITHIN`, `BEFORE`, `UNTIL`, `IMMEDIATELY`, `EVENTUALLY`) are deferred to v0.2.

#### The five modals (exactly five)

| Modal | Force |
|---|---|
| `MUST` | Required; non-satisfaction is non-compliance. |
| `MUST NOT` | Forbidden. |
| `SHOULD` | Strong default; non-satisfaction REQUIRES a same-block `BECAUSE` or `EXCEPT`. |
| `SHOULD NOT` | Strong prohibition; REQUIRES a same-block `BECAUSE` or `EXCEPT`. |
| `MAY` | Optional; carries no obligation. |

`SHALL` / `SHALL NOT` are **removed** (RFC 2119 makes `MUST` ≡ `REQUIRED` ≡ `SHALL`, so `SHALL` is redundant). They are recognized only as **deprecated aliases**: a parser accepts them, `lint` flags them advisory (`SOL-P058`), and `NORMALIZE` rewrites them to `MUST`/`MUST NOT`. No template emits them.

`CAN` and `WILL` are **non-modal** (capability / prediction) and are **forbidden in binding clauses**; their use where a modal is expected is `SOL-P003` (BLOCKING).

A `SHOULD`/`SHOULD NOT` with no `BECAUSE`/`EXCEPT` in the same block is `SOL-S006`.

### 2.5 The ID convention

Each block carries a **per-type short id** `PREFIX-NNN` (`NNN` = one or more decimal digits). The prefix is fixed by block type:

| Block type | Prefix | Example |
|---|---|---|
| `REQ` | `AC-` | `AC-001` |
| `CONSTRAINT` | `C-` | `C-001` |
| `INVARIANT` | `I-` | `I-001` |
| `INTERFACE` | `IF-` | `IF-001` |
| `QUESTION` | `Q-` | `Q-001` |
| `TRACE` | `T-` | `T-001` |
| `VERDICT` | — (reuses the judged obligation's id) | `VERDICT AC-001:` |

A prefix that does not match its block type is `SOL-S005`. IDs MUST be unique within one `*.swarm.md` (intra-spec duplicate = `SOL-S004`; cross-spec collision = `SOL-M001`).

A **cross-spec reference** qualifies the id with the source spec id using a **hash** separator: `auth-refresh#AC-001`. The hash (not a colon) is chosen because `:` is already the block-header delimiter and the `verify_ref` delimiter, so a colon-qualified form would be ambiguous to a single-pass tokenizer. Dotted/namespaced ids (`REQ.auth-refresh.AC-001`) are **IR-only** and MUST NOT appear at the surface.

### 2.6 Frontmatter

Every source spec MUST begin with a YAML frontmatter mapping (keys unordered). The **required set** is `{type, id, swarm_language, aps_version, spec_version, status}`:

| Field | Form | Meaning |
|---|---|---|
| `type` | `spec` | Artifact-type discriminator. |
| `id` | slug | Stable spec id (e.g. `auth-refresh`). |
| `swarm_language` | `SOL/0.1` | The SOL language discriminator (which grammar / blocks / modals / lint codes). |
| `aps_version` | `0.1` | The APS prose-standard version. |
| `spec_version` | `0.1.0` | The spec *content* version (semver of intent). |
| `status` | `draft \| review \| approved \| superseded` | Lifecycle status. |

Optional keys: `title`, `owners`, `imports` (spec ids referenced cross-spec), `domain` (default Axis-B governance domain; defaults to `product`), `created` / `updated`.

```sol
---
type: spec
id: auth-refresh
swarm_language: SOL/0.1
aps_version: 0.1
spec_version: 0.1.0
title: Auth refresh
status: draft
owners: [auth-team]
imports: [session-core]
---

# Spec: Auth refresh
```

*Design rationale:* the three version axes are never merged — `swarm_language` (language), `spec_version` (content), and (when a tool exists) `provenance.compiler_version` (tool). The frontmatter carries the first two; the version-axis model is detailed in `./versioning.md`.

### 2.7 Binding vs commentary

SOL blocks and APS prose coexist. Prose is **commentary**; a typed obligation block is **binding**. A span is *binding* iff it lies inside a `REQ`, `CONSTRAINT`, or `INVARIANT` block, and *commentary* otherwise. Load-bearing meaning (modality, actor, trigger, verification binding) MUST live in SOL blocks, never in surrounding prose.

---

## 3. The seven block types

SOL v0.1 defines **exactly seven block types**. Three carry **binding force** (the *obligation blocks*): `REQ`, `CONSTRAINT`, `INVARIANT`. The other four declare boundaries (`INTERFACE`), mark ambiguity (`QUESTION`), claim implementation (`TRACE`), or judge an obligation (`VERDICT`).

> `TASK-MAP`, `FINDING`, and `ADR` are **not** SOL block types — they are downstream artifacts, not language blocks.

| # | Block | Binds? | Role |
|---|---|---|---|
| 1 | `REQ` | yes | Required behavior |
| 2 | `CONSTRAINT` | yes | Restriction on the solution space |
| 3 | `INVARIANT` | yes | Always-held property |
| 4 | `INTERFACE` | no (but REQUIRES verification) | Declared boundary |
| 5 | `QUESTION` | no | Marked ambiguity |
| 6 | `TRACE` | no | Implementation claim |
| 7 | `VERDICT` | no | Judgment of an obligation |

Clause keywords are uppercase and case-sensitive. The trailing **metadata clauses** (`DEPENDS ON`, `TOUCHES`, `WRITES`, `READS`, `AFFECTS`, `RISK`, `DOMAIN`) are available on the obligation blocks (REQ/CONSTRAINT/INVARIANT) and feed orchestration; see §3.8 below.

### 3.1 REQ — required behavior (binding)

Under stated conditions, an actor must produce an observable response. Clauses MUST appear in canonical order; bracketed clauses are optional:

```ebnf
req_body = [ "WHERE", ws, cond, nl ]
           [ "WHILE", ws, cond, nl ]
           [ "WHEN",  ws, cond, nl ]
           [ "IF",    ws, cond, [ ws, "THEN" ], nl ]
           actor_clause, { and_actor_clause }
           [ "BECAUSE", ws, prose, nl ]
           [ "EXCEPT",  ws, prose, nl ]
           verify_line
           { metadata_clause };
actor_clause     = "THE", ws, actor, ws, modal, ws, response, nl;
and_actor_clause = "AND", ws, "THE", ws, actor, ws, modal, ws, response, nl;
```

- The four condition keywords are the **EARS** keywords, in order: `WHERE` (optional-feature inclusion) → `WHILE` (state/precondition) → `WHEN` (trigger/event) → `IF` (fault/error). A keyword-less requirement is *ubiquitous*. Their text is opaque (§2.4).
- **`THEN` is optional sugar after `IF` only** (the EARS unwanted-behavior pattern); it MUST NOT appear after `WHEN`/`WHILE`/`WHERE`. `IF … THEN …` and `IF … <newline> THE …` are equivalent.
- `THE <actor> <MODAL> <response>` is the mandatory consequence. A condition with no following actor clause is `SOL-S001`; an actor clause with no modal is `SOL-S003`.
- **Modal-scan rule (normative):** the `modal` is the *first* modal terminal at a token boundary (longest-match — `MUST NOT` before `MUST`); everything before it is the actor, everything after is the response. A modal word belonging to the actor/response MUST be quoted/backticked, or the obligation MUST be reworded (the parser MUST NOT guess).
- **`AND THE` chaining is permitted.** On lowering, each `THE …` / `AND THE …` becomes a **separate IR obligation**. More than two chained consequences is a non-blocking warning (`SOL-P004`-adjacent, atomize suggested), never a hard error.
- `BECAUSE` (rationale) / `EXCEPT` (exception) are optional, but one is REQUIRED whenever a consequence uses `SHOULD`/`SHOULD NOT`.
- `VERIFY BY` is REQUIRED for a binding REQ; its absence is `SOL-V001`.

```sol
REQ AC-001:
WHEN the user submits the signup form
AND the email field is empty
THE client MUST show "Email is required"
AND THE client MUST NOT send a signup request
VERIFY BY test:cmdTest:signup-empty-email
DEPENDS ON AC-000
WRITES src/signup/**
RISK medium
```

This lowers to two IR obligations (one per `THE` / `AND THE`), both carrying the same conditions and the same `verify_by`.

### 3.2 CONSTRAINT — restriction on the solution space (binding)

Bounds *how* obligations may be satisfied rather than requesting a behavior; it persists across tasks as a guard.

```ebnf
constraint_body = [ "WHERE", ws, cond, nl ]
                  actor_clause, { and_actor_clause }
                  [ "BECAUSE", ws, prose, nl ]
                  [ "EXCEPT",  ws, prose, nl ]
                  verify_line
                  { metadata_clause };
```

There is **no separate `POLICY` block**: a constraint's authority is recorded in the IR (`authority`), not as a distinct block type and not as a surface clause (`OWNED BY` is an INTERFACE-only clause, never CONSTRAINT metadata). A CONSTRAINT MUST carry a `VERIFY BY` (a static check, a contract, or `manual:` review); its absence is `SOL-V001`.

```sol
CONSTRAINT C-001:
THE auth client MUST NOT import from `server/*`
BECAUSE the client bundle must not embed server-only secrets
VERIFY BY static:cmdLint:dependency-boundary-check
AFFECTS src/auth/**
```

### 3.3 INVARIANT — always-held property (binding)

A property that MUST hold at all times, not a one-time behavior. Body shape is `<property> MUST|MUST NOT <hold>`.

```ebnf
invariant_body = property, ws, ( "MUST" | "MUST NOT" ), ws, predicate, nl,
                 [ "BECAUSE", ws, prose, nl ]
                 verify_line
                 { metadata_clause };
```

- `ALWAYS` and `NEVER` are **removed** (redundant with the block's always-held semantics; one-word-one-meaning). An author MUST NOT write them.
- An INVARIANT MUST NOT describe a one-time triggered behavior (that is a `REQ`).
- It **PREFERS** a `property`, `model`, or `static` proof (those can assert a property over all states). Binding an INVARIANT *only* to a non-observable unit `test` is a `SOL-V003` warning.

```sol
INVARIANT I-001:
A user MUST NOT have more than one active refresh token family
VERIFY BY property:cmdTest:token-family-invariant
```

### 3.4 INTERFACE — declared boundary (non-binding, requires a contract)

Names a boundary, API, function, schema, command, module, or contract that other obligations reference.

```ebnf
interface_body = signature, ws, "RETURNS", ws, return_type, nl,
                 [ "ACCEPTS", ":", nl, bullet_list ]
                 [ "ERRORS",  ":", nl, bullet_list ]
                 [ "OWNED BY", ws, owner, nl ]
                 verify_line;
```

`ACCEPTS:` and `ERRORS:` introduce **contiguous** bullet continuation lines (a blank line would close the body). The required verification is specific:

- An INTERFACE MUST carry a `VERIFY BY contract:` binding — a `contract`-type proof that the boundary's shape (signature, inputs, return, errors) matches reality.
- No `VERIFY BY` at all → `SOL-V001`.
- A `VERIFY BY` whose proof type is **not** `contract` → `SOL-V006` (interface-without-contract).
- Referencing an undeclared interface id → `SOL-M003` (unbound-cross-reference).

```sol
INTERFACE IF-001:
`refreshSession` RETURNS `Session | AuthExpired`
ACCEPTS:
  - `refreshToken: string`
ERRORS:
  - network-timeout
  - invalid-refresh-token
OWNED BY auth-client
VERIFY BY contract:cmdContract:refresh-session-contract
```

### 3.5 QUESTION — marked ambiguity (non-binding)

Records an explicit unresolved ambiguity. The `[blocking|non-blocking]` tag is REQUIRED and sits in the header, before the colon.

```ebnf
question_body = question_text, nl,
                "AFFECTS", ws, affects_ref, nl;
blocking_tag  = "[blocking]" | "[non-blocking]";
```

A **blocking** QUESTION prevents lowering of any obligation it `AFFECTS`; one that reaches the lower pass is an orchestration error (`SOL-O`-class) — an unresolved decision being compiled into tasks. A **non-blocking** QUESTION may remain open if it does not affect assigned obligations. Behavioral uncertainty MUST be lifted into a QUESTION rather than left as hedged prose (`SOL-P008`).

```sol
QUESTION Q-001 [blocking]:
Should expired sessions redirect to `/login` or show an inline re-auth modal?
AFFECTS AC-001
```

### 3.6 TRACE — implementation claim (non-binding)

Claims that obligations were implemented, naming changed surfaces and proofs run. It is the input to the review pass.

```ebnf
trace_body = "IMPLEMENTS", ws, id_list, nl,
             [ "PRESERVES", ws, id_list, nl ]
             [ "CHANGED",   ws, path_list, nl ]
             "PROOF", ws, verify_ref, ws, proof_result, nl,
             { "PROOF", ws, verify_ref, ws, proof_result, nl };
proof_result = "passed" | "failed" | "blocked" | "unverified";
```

- `IMPLEMENTS` lists the REQ ids satisfied; `PRESERVES` lists the CONSTRAINT/INVARIANT ids not to be violated; `CHANGED` names modified surfaces (the basis for staleness detection).
- Each `PROOF` line names a `verify_ref` and its observed `proof_result`. The four lowercase results map 1:1 to the uppercase VERDICT core values: `passed`→`PASS`, `failed`→`FAIL`, `blocked`→`BLOCKED`, `unverified`→`UNVERIFIED`. (`manual` is a proof *type*, never a result.)
- A TRACE that claims `IMPLEMENTS` MUST carry at least one `PROOF` line — `PROOF` is grammatically mandatory, so a no-`PROOF` trace is a structural parse error (`SOL-S014`), not a missing-evidence lint. An `IMPLEMENTS`/`PRESERVES` naming an unknown obligation is `SOL-M003`. A `PROOF` line MUST reference real output — an unqualified "tests passed" is not admissible.

```sol
TRACE T-001:
IMPLEMENTS AC-001, AC-002
PRESERVES C-001
CHANGED src/auth/client.ts, src/auth/session-store.ts
PROOF test:cmdTest:auth-refresh-expired-token passed
PROOF test:cmdTest:auth-refresh-no-loop passed
PROOF static:cmdLint:dependency-boundary-check passed
```

### 3.7 VERDICT — judgment of an obligation (non-binding)

Records the review judgment of one obligation. It **reuses the judged obligation's id** (it does not mint a new one); its container is `review.md` — there is no `verdict.md`. The core value sits on the header line, after the colon; an optional lifecycle decorator follows it in parentheses.

```ebnf
verdict_block     = "VERDICT", ws, judged_id, ":", ws, core_value,
                    [ ws, "(", lifecycle, " by ", authority, ": ", reason_txt,
                          [ ";", ws, lifecycle_fields ], ")" ], nl,
                    "REASON", ws, prose, nl,
                    "EVIDENCE", ws, reference, nl, { "EVIDENCE", ws, reference, nl };
core_value        = "PASS" | "FAIL" | "BLOCKED" | "UNVERIFIED";
lifecycle         = "WAIVED" | "STALE" | "CONTRADICTED";
lifecycle_fields  = field, { ";", ws, field };
```

A VERDICT carries exactly **one core value** plus an **optional lifecycle decorator** in parentheses. The full value model is 7 = 4 core + 3 lifecycle.

**The four core values** (exactly one is REQUIRED, immediately after the colon):

| Core | Meaning |
|---|---|
| `PASS` | A bound proof ran and succeeded; evidence satisfies the obligation. |
| `FAIL` | A bound proof ran and failed, or the diff contradicts the obligation. |
| `BLOCKED` | The proof could not run (prerequisite, tool, or environment missing). |
| `UNVERIFIED` | No acceptable proof was bound, or none was executed. |

A value outside the core four is a `SOL-V`-family lint error.

**The three lifecycle decorators** (optional; each annotates the core value with how its standing changed over time). When present, the decorator is a parenthesized clause of the exact shape `(<lifecycle> by <authority>: <reason>[; <field>; …])` — `authority` and `reason` are always REQUIRED, and each decorator additionally carries its own mandatory field(s). A decorator missing a required field is `SOL-V005`.

| Lifecycle | Meaning | Mandatory fields (beyond authority + reason) |
|---|---|---|
| `WAIVED` | A `FAIL`/`UNVERIFIED` accepted by a named authority. | **`expiry`** — carried as a `lifecycle_field` (e.g. `expiry 2026-07-01`). A waiver with no expiry is `SOL-V005`. |
| `STALE` | A prior `PASS` whose evidence no longer matches the current source/surface. | **changed-surface** — the surface whose change invalidated the evidence, as a `lifecycle_field`; the prior verdict is given as the `reason`. |
| `CONTRADICTED` | Two proofs disagree, or trace/code disagrees with the obligation. | **its two conflicting evidence references** — carried as the body's `EVIDENCE` lines (not as `lifecycle_fields`); at least two `EVIDENCE` lines are therefore expected. |

`REASON` gives the human justification; `EVIDENCE` references the inspected proof output (one or more lines). The full 7-value lifecycle model, its merge gate, and staleness detection are detailed in `../passes/verify.md` and `../passes/review.md`; this page fixes the surface grammar.

```sol
VERDICT AC-001: PASS
REASON The branch clears the local session and redirects to `/login` when token expiry is simulated.
EVIDENCE test:cmdTest:auth-refresh-expired-token output in review log
```

```sol
VERDICT AC-002: FAIL (WAIVED by auth-team: flaky e2e env; expiry 2026-07-01)
REASON The e2e proof could not be stabilized this cycle.
EVIDENCE test:cmdTest:auth-refresh-no-loop intermittent failure log
```

```sol
VERDICT AC-004: PASS (STALE by review-bot: prior PASS predates the refactor; changed-surface src/auth/session-store.ts)
REASON The session-store surface changed after the last passing run, so the prior evidence no longer matches.
EVIDENCE test:cmdTest:auth-refresh-expired-token earlier passing log
```

```sol
VERDICT AC-005: FAIL (CONTRADICTED by review-bot: unit and e2e proofs disagree)
REASON The unit proof reports success while the e2e proof reports the order is never created.
EVIDENCE test:cmdTest:order-created-event passed
EVIDENCE test:e2e:cmdTest:checkout-order-created failed
```

### 3.8 Metadata clauses (orchestration inputs)

These MAY trail any obligation block (REQ/CONSTRAINT/INVARIANT). They carry no behavioral force; they feed orchestration and the safe-parallelism predicate. Surface form is space-separated UPPERCASE; IR form is snake_case.

| Surface clause | Meaning |
|---|---|
| `DEPENDS ON <id-list>` | Hard ordering against other obligations. |
| `TOUCHES <surface-list>` | Advisory: surfaces incidentally affected; weaker than `WRITES` and **not** read by the safe-parallelism predicate (documentation only). |
| `WRITES <surface-list>` | Write surfaces this obligation owns (conflict / write-disjointness basis). |
| `READS <surface-list>` | Read set. |
| `AFFECTS <surface-or-id-list>` | Impact set (downstream effect). |
| `RISK <low\|medium\|high\|critical>` | Risk tier. |
| `DOMAIN <name>` | Per-obligation Axis-B governance domain (overrides frontmatter `domain`). |

A lock group is expressed as a named `SURFACE` (`SURFACE x = …`), never a `locks` primitive; `WRITES`/`READS` over surfaces is the basis of write-disjointness analysis.

---

## 4. The VERIFY BY binding (the proof reference)

`VERIFY BY` takes a `verify_ref`. The typed form is:

```ebnf
verify_ref = proof_type, [ ":", test_scope ], ":", adapter, ":", artifact, [ "#", selector ];
proof_type = "static" | "test" | "contract" | "property" | "model"
           | "perf" | "security" | "manual" | "monitor";   (* closed 9-set *)
test_scope = "unit" | "integration" | "e2e";               (* only when proof_type = "test" *)
```

There are **exactly nine proof types** (`static`, `test`, `contract`, `property`, `model`, `perf`, `security`, `manual`, `monitor`); any other type is `SOL-V009`. A `bare_ref` (no `proof_type` segment) is valid but raises an advisory untyped-binding smell. The `adapter` resolves through `AGENTS.md > Commands` (the `cmd*` slot); the `artifact` is the file/target it runs; the optional `#selector` is a sub-target (e.g. a test name). Test scope is spelled in the position after `test`: `test:unit:…`, `test:integration:…`, `test:e2e:…`. The full proof taxonomy and its strength ordering (`model > property | contract > test > static > manual | monitor`) live in `../passes/verify.md` — out of scope here.

---

## 5. Lint codes referenced on this page

The five lint layers are **S/P/M/V/O** (Syntax / Prose / seMantic / Verification / Orchestration); the full catalogue lives in `./errors.md`. The codes named above, for orientation only:

| Code | Layer | What it flags |
|---|---|---|
| `SOL-S001` | Syntax | Condition keyword with no following actor clause |
| `SOL-S003` | Syntax | Actor clause with no modal |
| `SOL-S004` | Syntax | Duplicate block id within one spec |
| `SOL-S005` | Syntax | ID prefix ↔ block-type mismatch |
| `SOL-S006` | Syntax | `SHOULD`/`SHOULD NOT` without `BECAUSE`/`EXCEPT` |
| `SOL-S014` | Syntax | TRACE with no `PROOF` line (missing required clause) |
| `SOL-P003` | Prose | `CAN`/`WILL`/informal modal in a binding clause |
| `SOL-P004` | Prose | Bundled obligation (BLOCKING) / >2 `AND THE` chain (advisory) |
| `SOL-P008` | Prose | Hedged-prose ambiguity that should be a QUESTION |
| `SOL-P058` | Prose | Deprecated `SHALL`/`SHALL NOT` alias |
| `SOL-M001` | Semantic | Cross-spec id collision |
| `SOL-M003` | Semantic | Unbound cross-reference (unknown obligation/interface id) |
| `SOL-V001` | Verification | Binding obligation with no `VERIFY BY` |
| `SOL-V003` | Verification | INVARIANT bound only to a non-observable unit test |
| `SOL-V005` | Verification | VERDICT core outside the four, or lifecycle decorator missing a field |
| `SOL-V006` | Verification | INTERFACE not verified by a `contract:` binding |
| `SOL-V009` | Verification | Proof type outside the closed 9-set |

---

## Related

Sibling kernel references that extend or consume what this page defines:

- `./APS.md` — the controlled-prose standard SOL blocks are interleaved with, and the high-risk-word rules.
- `./errors.md` — the full `SOL-<LAYER><NNN>` catalogue behind the codes cited inline here.
- `./versioning.md` — the two version axes (`swarm_language` vs framework/package) and the one-way trigger.
- `../passes/verify.md` — the closed nine proof types, their strength ordering, `VERIFY BY` adapter resolution, and how `VERDICT` core values and lifecycle decorators are produced.
- `../passes/review.md` — how verdicts are rendered and the merge gate.
