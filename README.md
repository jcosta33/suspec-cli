# suspec-cli

The reference checker for the [Suspec methodology](https://github.com/jcosta33/suspec) — a
**path-agnostic, deterministic checker** for Suspec artifacts. It implements the checks contract in
[`suspec/checks/checks.yaml`](https://github.com/jcosta33/suspec/blob/main/checks/checks.yaml):
the honesty floor a lazy or dishonest reviewer cannot fake — coverage-complete, command-matches,
pass-needs-evidence, ref-resolves — plus the single-artifact lint, at zero model cost.

The CLI reads **exactly the files it is handed**. It never resolves a store, a config, a repo
root, or a workspace tree: the primary artifact's kind is read from its own frontmatter `type:`,
and companions are always explicit flags. The only lookups beyond the handed files are
artifact-relative reference resolution (below) — a spec's named `sources.md` beside the spec, a
change plan's sibling specs one level beside the plan — never a tree walk, never an inferred
root. That makes it a pure function over files — runnable by hand, in a pre-commit hook, in CI,
or through MCP, identically.

## Requirements

- **Node.js ≥ 22.6** (declared in `engines`), installed or from a source checkout (the dev
  loop runs the TypeScript directly via `--experimental-strip-types`, no build step).
- `pnpm` recommended for development (`npm` works for installing).

## Install

suspec-cli is **not yet published to npm** — there is no package under that name yet, so
`npm install -g suspec-cli` won't find anything. Install from source instead:

```bash
git clone https://github.com/jcosta33/suspec-cli
cd suspec-cli && pnpm install && pnpm build   # or: npm install && npm run build
npm link                                     # puts `suspec` on your PATH
```

`bin/suspec.js` runs the bundled JavaScript (`dist/`, built on `prepack`), so an installed CLI needs
no transpiler. From a checkout it runs the `src/` TypeScript directly via Node's native type
stripping (Node ≥ 22.6) — `node bin/suspec.js <command>` works without a build step; `pnpm build`
produces the `dist/` bundle. (A published npm package will make the source install optional.)

## Usage

```bash
suspec check <path> [<path>...]                                    # spec / change-plan files
suspec check <review-path> --spec <spec-path> [--task <task-path>] # a review packet
suspec check --contract                                            # the checks contract as JSON
```

- **Exit codes are the API**: `0` clean · `1` warning · `2` blocking. `--json` emits the
  structured report on stdout; errors go to stderr, always.
- **The artifact kind is sniffed from its own frontmatter** `type:` — a spec runs the spec checks
  (C001–C009, C015, C019), a change plan runs C010/C011, a review packet runs the reconcile
  (C012/C013/C016/C020). A type with no check face (task, finding, intake, …) reports "nothing to
  validate" and exits 0.
- **Several artifacts ride one invocation** (specs / change plans): the process starts once, every
  file is checked, the exit code is the max across files, and frontmatter `id:` collisions across
  the set fire C002. A pre-commit hook batches its staged set here.
- **A review packet always needs its spec; the task follows the review.** `--spec` is required for
  every review; `--task` is required iff the review names a `task:` (the task is an optional split
  slice — a task-less 1:1 review reconciles spec-keyed, against the spec's full requirement set).
  A missing required companion exits `2` naming the flag — the floor's strongest checks (coverage,
  verify-binding, unresolvable ref) never silently degrade into a shallower check — and a `--task`
  the review never references is refused as a wiring mistake.
- **References resolve artifact-relative.** A spec's `sources:` refs and its named `sources.md`
  resolve against the spec's own directory; a change plan's `SPEC-x#AC-NNN` refs resolve against
  the plan's sibling specs. No root is ever inferred.

```bash
$ suspec check specs/triage/spec.md
specs/triage/spec.md  ✓ clean  0 errors, 0 warnings

$ suspec check reviews/checkout.md --spec specs/checkout/spec.md --task tasks/TASK-checkout.md
reviews/checkout.md  ⚠ warning  0 errors, 1 warnings

  ⚠  C012  requirement AC-003 is in scope but has no coverage row (uncovered)
```

## The boundary

suspec-cli checks; it never judges. It surfaces facts and a severity level — never a review
verdict; the Pass/Fail result stays the human's, informed by an independent review. Severity is
expressed at check time (blocking exit `2`), and the human owns what blocks a merge. The
methodology itself — authoring, splitting, implementing, reviewing, saving findings — ships as the
[suspec-skills](https://github.com/jcosta33/suspec-skills) family; the CLI is its deterministic
reinforcement, required by nothing.

The contract is drift-guarded: the checks table implemented here is pinned to the canon's
`checks/checks.yaml` version (`suspec check --contract` prints it), and a test fails the build the
moment the two diverge.

## Further reading

- [`AGENTS.md`](./AGENTS.md) — the bootloader for agents working on this repo
- [`.agents/repo-conventions.md`](./.agents/repo-conventions.md) — the module architecture + soundness rules
- The Suspec methodology: [suspec](https://github.com/jcosta33/suspec)
