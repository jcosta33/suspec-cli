# suspec-cli repo conventions

Project-owned rules for working in this repository (persist across Suspec kit upgrades). Load this when
implementing or refactoring TypeScript here. These are the **de-contaminated** rules carried over from
the pre-Suspec `AGENTS.md` — the earlier file had React/TanStack/Rust-Tauri-audio content copied from
another project; none of that applies (this repo is a TypeScript CLI, no UI, no Rust).

## Module architecture (DDD boundaries)

- **Cross-module imports target a module's `useCases/index.ts` barrel only** (no module ships a root
  `index.ts`). Deep imports into another module's internals — files inside `useCases/`, `events/`,
  `services/`, `models/`, `repositories/` — are forbidden.
- **Within a module, use relative paths** (`../services/…`, `./useCases/…`) — never import your own
  module's root barrel. The barrel is the _external_ surface, not an intra-module indirection.
- **`index.ts` re-exports only what another module may consume** — runtime values from `useCases/` and
  typed payloads from `events/`. Do not re-export use-case `type`s across modules; a consumer defines its
  own local type or uses `ReturnType<typeof fn>`.
- **Internals are private to their module:** `models/`, `repositories/`, `services/`. A `service` is a
  pure, stateless helper over domain types — no I/O, no orchestration (that's `useCases/`). `repositories/`
  is a reserved convention — no module currently has one; the CLI's only I/O is filesystem reads, living in
  dedicated use-case files as explicit-path reads and injected predicate builders (`docs/05-architecture.md`
  §3.1–3.2).
- **Model isolation:** a module's `models/` never cross a module boundary. If module B needs A-shaped
  data, B defines its own local type with only the fields it uses. Duplication is intentional — it keeps
  a model change in A from cascading into B, and makes a contract change break at compile time.
- **One function per `useCase`/`repository` file.** Use cases orchestrate; a repository, when a module
  grows one, owns its I/O.
- **`src/infra` MUST NOT import `src/modules`** (`infra-isolation`). Infra is leaf-level by
  construction — after the M1 realignment it carries the `Result<V, E>` / `AppError` algebra plus the
  shared pure markdown/YAML scan utilities (`markdownScan.ts`, `yamlScalar.ts`).
- **The gate:** `pnpm deps:validate` (dependency-cruiser, `.dependency-cruiser.cjs`) MUST pass with
  **zero** architectural violations before a cross-module change is done. Run it after every ~10 files in
  a refactor — it is the `cmdValidate` proof adapter.

## The checker boundary

suspec-cli checks Suspec artifacts — it **never runs the model/agent loop**, owns no chat UI, and
issues no review verdict. The logic lives in `src/modules/Core` (the check engine — pure over the
files the command hands it, with filesystem access injected as predicates — plus `unixOutcome`, the
`--json`/exit-code contract). One surface wraps Core: the check command + usage
(`src/modules/Commands`, the Unix path). The CLI reads exactly the files it is handed (ADR-0143):
it resolves no store, no config, no repo root, no workspace tree — a change that adds any location
resolution is out of bounds.

## Cross-cutting infra (`src/infra/*`)

- **Errors (the only infra):** at an I/O boundary where a caller would otherwise switch on
  `error.message`, return `Result<TValue, AppError<'Tag', {…fields}>>` (`ok(...)` /
  `err(createAppError('Tag', msg, fields))`) and discriminate at the CLI boundary — do not thread a
  `Result<>` through many layers. Keep `throw` for genuinely unrecoverable failures. Output is the
  contract util's job (`Core/unixOutcome`: data → stdout, messages → stderr, exit 0/1/2), not a logger.

## TypeScript conventions

- Prefer `type` over `interface`; `as const` objects over `enum`; explicit `import type`.
- Never namespace-import (`import * as X`); import named exports individually.
- `if` uses block syntax; guard clauses / early returns; no chained ternaries.
- Functions with >1 parameter take a single object param; the input type is `FunctionNameInput` and a
  non-scalar output `FunctionNameOutput`, defined immediately above the function.
- Descriptive names — no entity-type prefixes/suffixes (`thingRepository`), no single-letter vars/generics.
- **Soundness:** types describe real data. Forbidden: `any` (except at a boundary with immediate
  narrowing), `as` / `as unknown as …` to silence the compiler, `@ts-ignore`/`@ts-expect-error` without a
  one-line justification, `{}`/`object`/`Record<string,…>` as a stand-in for a real shape. Prefer
  `unknown` + narrowing, `satisfies`, discriminated unions, runtime validation at I/O boundaries. Tests
  assert the real contract (values/shape/error text), not just "defined"/"truthy".

## Safety (the repo runs agents in bypass-permissions mode)

Every action is immediate and irreversible — these prohibitions prevent unrecoverable damage:

- **No file deletion/rename/move/overwrite without an explicit instruction naming the file.** Prefer a
  targeted `Edit` over a full `Write`. If a file looks unused, surface it as a finding — don't delete it.
- **No destructive git:** no `reset --hard`, `clean`, `push --force`, `branch -D`, `checkout -- .`,
  `restore .`. Stage only the files you intentionally changed; never commit unrelated files; never amend
  or rebase pushed commits; push only when the task says to.
- **No automated code mutation:** no codemods (jscodeshift, ts-morph, ast-grep), no `sed`/`awk`/`perl -pi`
  bulk find-replace, no batch rename scripts, no global `--fix`. Every change is made deliberately by hand.
- **No package install/removal or `package.json`/CI/build-config edits** unless that is the task.
- **When unsure, don't.** Log it as an open `QUESTION` in the task — the cost of pausing is zero.
