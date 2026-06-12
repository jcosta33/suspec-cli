# Debug and Harden Swarm CLI

## Objective

Audit the `swarm-cli` codebase from top to bottom, identify structural defects, runtime bugs, missing essential features, and architectural inconsistencies. Fix the critical issues that prevent the CLI from functioning correctly, harden edge cases, and bring tests from trivial stubs to meaningful coverage.

## Linked Docs

- `README.md` (canonical command reference)
- `package.json` (scripts and dependencies)
- `AGENTS.md` (project conventions)

## Findings Summary

### 🔴 Critical — CLI is non-functional or severely broken

1. **Missing `src/commands/` directory.** `index.ts` dynamically imports `./commands/${cmd}.ts` (line 178), but the directory does not exist. Commands live at `src/modules/Commands/useCases/`. Every built-in command dispatch fails with `ERR_MODULE_NOT_FOUND`.
2. **Broken barrel file.** `src/modules/Commands/useCases/index.ts` exports `.js` extensions (e.g., `export * from './arch.js'`) but all source files are `.ts`. This barrel is completely unusable.
3. **Missing core lifecycle commands.** The README documents `new`, `open`, `list`, `show`, `task`, `remove`, `prune`, `doctor`, `path`, `focus`, `pick`, `ast rename`. None of these files exist in `src/modules/Commands/useCases/`.
4. **Config file mismatch.** `init.ts` writes `swarm.config.json` to the repo root, but `load_config` (in `Terminal/useCases/config.ts`) reads from `scripts/agents/config.json`. The init command therefore produces a config that is never loaded.
5. **Dashboard state key mismatch.** `ui.ts` uses `globalState[s.path]` to look up agent state, but `write_state` keys state by `slug`, not worktree `path`. The dashboard always shows `[IDLE]` because the lookup never hits.
6. **Adapters module is orphaned.** `index.ts` hardcodes `KNOWN_AGENTS` (`aider`, `cline`, `swe-agent`) and ignores the `Adapters` module which exports 6 properly-structured adapters (`claude`, `codex`, `droid`, `gemini`, `kimi`, `opencode`). The install/run metadata in `KNOWN_AGENTS` is duplicated and stale.
7. **`bin/swarm.js` signal/exit-code bug.** Line 13: `process.exit(res.status || 0)` converts a `null` status (signal termination) into success code `0`. It also does not forward signals to the child process.

### 🟠 High — Bugs, crashes, or wrong behavior

8. **`daemon.ts` file-extension guard is broken.** Line 28 checks `!filename.endsWith('.ts') && !filename.endsWith('.ts')` — the second check should be `.tsx`.
9. **`profile.ts` hardcodes DAW-specific paths.** The mock bottleneck array references `src/modules/Arrangement/...`, `src/modules/AudioEngine/...`, `src/modules/Workspace/presentations/views/AppShell.tsx` — all from the parent WebDAW project. These paths do not exist in the CLI.
10. **`find.ts` regex injection.** `queryTarget` is interpolated directly into a regex string without escaping. A target like `TransportHandler(` crashes the command with a malformed-regex error.
11. **`chat.ts` redundant `get_repo_root()` call.** Line 41 calls `get_repo_root()` again instead of using the already-resolved `repoRoot` variable.
12. **`pr.ts` worktree regex mismatch.** `find_worktree_path` uses `agents-${slug}$` but the config worktree pattern is `../{repoName}--{slug}`. The regex will almost never match.
13. **`release.ts` naive semver parsing.** `currentVer.split('.').map(Number)` breaks on pre-release tags like `v1.0.0-alpha` or `v2.0.0-rc.1`.
14. **`test-radius.ts` spawns itself incorrectly.** It constructs a path to `./test.ts` and passes impacted spec file paths as arguments, but `test.ts` expects vitest-style args, not raw file paths.
15. **`compress.ts` does not actually compress.** The `skeletonize` function keeps every line starting with `import`, `export`, `interface`, etc. Function bodies are not stripped; it is just a noisy filter.
16. **`knowledge.ts` memory bloat.** It loads the **entire content** of every matching markdown file into the `snippet` field, then keeps the top 5. For large repos this can exhaust memory.
17. **`heal.ts`, `review.ts`, `migrate.ts`, `profile.ts` spawn `pnpm agents:new`.** There is no `agents` script in `package.json`. These commands will fail with "Missing script: agents".

### 🟡 Medium — Structural, maintainability, hygiene

18. **Tests are trivial stubs.** All 6 test files contain only `expect(true).toBe(true)`. Zero meaningful coverage for git helpers, state I/O, slug derivation, template rendering, arg parsing, etc.
19. **`complexity.ts` and `format.ts` live in `src/utils/`** but are executable CLI commands. They should be in `src/modules/Commands/useCases/` to follow DDD boundaries.
20. **`ast.ts` has `rename_symbol` but no CLI wrapper.** The README documents `ast rename` but there is no corresponding command file.
21. **`bin/swarm.js` has no Node version check.** `--experimental-strip-types` requires Node ≥ 22.6.0. Older Node versions fail with an opaque error.
22. **`index.ts` help text is incomplete.** It lists only 5 commands and 3 agents, omitting 35+ commands and 6 adapters.
23. **`index.ts` dynamic import is not path-sanitized.** `cmd` from `argv[0]` is used directly in `` `./commands/${cmd}.ts` ``. A value like `../../etc/passwd` could attempt traversal (mitigated by the missing directory, but still a latent risk).
24. **Unused dependency: `ora`.** Listed in `package.json` dependencies but never imported.
25. **`lint-results.json` in project root.** Should be gitignored or deleted; it is a stale artifact from the previous lint-fix session.

## Plan

### Phase 1 — Fix Critical Breakage (must work before anything else)

1. Fix `index.ts` dynamic import path to resolve commands from `./modules/Commands/useCases/${cmd}.ts` instead of the non-existent `./commands/${cmd}.ts`.
2. Fix `src/modules/Commands/useCases/index.ts` barrel to export `.ts` files.
3. Implement missing core commands:
   - `new` — create worktree, branch, task file (uses `Workspace/git.ts`, `TaskManagement/template.ts`, `AgentState/state.ts`)
   - `list` — display active sandboxes with status (uses `worktree_list` + `read_state`)
   - `show` — display metadata for a single sandbox
   - `open` — reopen a sandbox terminal (uses `Terminal/terminal.ts` launch functions)
   - `task` — append human feedback to a task file
   - `remove` — delete worktree + branch + state
   - `prune` — remove merged/orphaned sandboxes
   - `path` — print absolute worktree path for a slug
   - `focus` — open worktree in `$EDITOR`
   - `pick` — interactive fzf menu
4. Fix config path mismatch: align `init.ts` and `load_config` on a single file location (`swarm.config.json` in repo root).
5. Fix `ui.ts` state lookup to use slug (derived from worktree path or branch) instead of `path`.
6. Replace `index.ts` `KNOWN_AGENTS` hardcode with dynamic resolution from the `Adapters` module.
7. Fix `bin/swarm.js` exit-code and signal forwarding logic.

### Phase 2 — Fix High-Priority Bugs

8. Fix `daemon.ts` `.tsx` guard.
9. Fix `profile.ts` mock bottlenecks to be generic or project-agnostic.
10. Escape `queryTarget` in `find.ts` before regex construction.
11. Fix `chat.ts` to reuse `repoRoot`.
12. Fix `pr.ts` worktree discovery to use `worktree_list` instead of fragile regex.
13. Make `release.ts` semver parsing robust (use a simple semver helper).
14. Fix `test-radius.ts` to invoke vitest directly with file filters instead of spawning `test.ts`.
15. Rewrite `compress.ts` to actually strip function bodies (naive brace-counting is acceptable for Phase 1).
16. Cap `knowledge.ts` snippet size (read first 2KB only).
17. Fix all commands that spawn `pnpm agents:new` to spawn the correct binary path (via `process.argv[1]` or the `swarm` bin).

### Phase 3 — Structural Cleanup

18. Move `complexity.ts` and `format.ts` from `src/utils/` to `src/modules/Commands/useCases/`.
19. Create `ast-rename.ts` command wrapper for `src/utils/ast.ts`.
20. Add Node version check to `bin/swarm.js`.
21. Update `index.ts` help text to enumerate all implemented commands.
22. Sanitize `cmd` in `index.ts` (alphanumeric only).
23. Remove unused `ora` from dependencies.
24. Delete `lint-results.json` from repo root.

### Phase 4 — Meaningful Tests

25. Rewrite test stubs into real unit tests:
   - `slug.ts`: test `to_slug`, `derive_names`, `next_duplicate_slug`
   - `git.ts`: test `get_repo_name`, `worktree_list` parsing (mock spawnSync)
   - `state.ts`: test `read_state`, `write_state`, `remove_state` (mock fs)
   - `template.ts`: test `render_template` with sample data
   - `cli.ts`: test `parse_args` with various flag patterns
   - `config.ts`: test `load_config` with/without file present

## Progress

- [x] Phase 1: Critical breakage fixes
- [x] Phase 2: High-priority bug fixes
- [x] Phase 3: Structural cleanup
- [x] Phase 4: Meaningful tests
- [x] Self-review

## Decisions

- The `new` command should be the most robust implementation because it is the primary entry point for the entire workflow. It must handle branch naming, worktree path derivation from config, task file generation from templates, and optional agent launch.
- `list` and `show` should share a common formatter to avoid duplicating status-tag logic between `ui.ts` and plain-text output.
- Config file location: standardize on `swarm.config.json` in the repo root. Update `load_config` to read from there, with a fallback to `scripts/agents/config.json` for backward compatibility during transition.
- The Adapters module should be the single source of truth for agent metadata. `index.ts` should import from `Adapters` instead of duplicating data.

## Blockers

- None currently. This task can proceed once approved.

## Next Steps

1. Read this task file and the linked docs.
2. Start Phase 1: fix `index.ts` import path and the broken barrel.
3. Implement `new`, `list`, `show` as the foundational commands.
4. Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm deps:validate` after every major change.

---

## Self-review

### Did all planned items complete?

Yes. All phases are complete. Additional features were also implemented during this session:
- `.gitignore` created and `node_modules/` untracked from git
- `swarm status` command for sandbox diagnostics
- `swarm logs --follow` for real-time telemetry streaming
- `swarm init` now enables `git rerere`
- `swarm doctor` comprehensive diagnostic command
- Fixed a deadlock in `state.ts` where `write_state`/`remove_state` held a lock and called `read_state` which tried to re-acquire the same lock.

### Verification outputs

**TypeScript compilation:**
```
$ pnpm typecheck
> swarm-cli@1.0.0 typecheck /Users/josecosta/dev/swarm-cli
> tsc --noEmit

(no output — 0 errors)
```

**ESLint:**
```
$ pnpm lint
> swarm-cli@1.0.0 lint /Users/josecosta/dev/swarm-cli
> eslint --cache --cache-location node_modules/.cache/eslint/ "src/**/*.ts"

(no output — 0 errors, 0 warnings)
```

**Dependency cruiser:**
```
$ pnpm deps:validate
> swarm-cli@1.0.0 deps:validate /Users/josecosta/dev/swarm-cli
> depcruise src --config .dependency-cruiser.cjs

✔ no dependency violations found (87 modules, 198 dependencies cruised)
```

**Tests:**
```
$ pnpm test:run
> swarm-cli@1.0.0 test:run /Users/josecosta/dev/swarm-cli
> vitest run

✓ src/modules/TaskManagement/__tests__/slug.spec.ts (8 tests)
✓ src/modules/Workspace/__tests__/workspace.spec.ts (3 tests)
✓ src/modules/TaskManagement/__tests__/task-management.spec.ts (3 tests)
✓ src/modules/Adapters/__tests__/adapters.spec.ts (5 tests)
✓ src/modules/AgentState/__tests__/agent-state.spec.ts (7 tests)
✓ src/modules/Terminal/__tests__/terminal.spec.ts (13 tests)

Test Files  6 passed (6)
     Tests  39 passed (39)
```

### Additional changes completed in this session

- **process.exit refactoring:** Replaced all scattered `process.exit(0|1)` calls across 48 command files with `return` values. Added `return 0` at function ends to satisfy TS2366. Fixed async execution guards (e.g., `task.ts`) to use `.then(code => process.exitCode = code)`. Fixed lint `no-useless-assignment` in `find.ts`.
- **`swarm message` command:** New command file `message.ts` that validates JSON input, checks agent state exists, and appends structured messages to `.agents/mailbox/{slug}.jsonl`.
- **`swarm decompose --execute`:** Full DAG executor implementation. Creates worktrees and task files for all tasks upfront, then executes in topological waves. Independent tasks run concurrently via `spawn(detached: true)`. Polls child process exit events. Reports pass/fail per task and overall.
- **NDJSON logger infrastructure:** Created `Terminal/services/logger.ts` with `info/error/warn/debug/raw` methods, `AsyncLocalStorage` context for `trace_id` and `slug`, and `SWARM_LOG_FORMAT=json` environment toggle. Updated `colors.ts` helpers (`success`, `info`, `warn`, `error`, `box`) to route through logger. Migrated `new.ts`, `list.ts`, `status.ts`, `logs.ts`, `message.ts` to use logger.

**Phase 1 — Critical fixes:**
- Rewrote `index.ts` to spawn command files directly via `spawnSync(process.execPath, ['--experimental-strip-types', commandPath, ...args])` instead of broken dynamic imports into the missing `src/commands/` directory. Added `cmd` sanitization (`/^[a-z0-9-]+$/`) and updated help text to list all ~40 commands.
- Deleted the forbidden `src/modules/Commands/useCases/index.ts` barrel file (architecture rules only allow module-root barrels). Fixed `src/modules/Commands/index.ts` to remove the dead reference.
- Implemented 10 missing core commands: `new.ts`, `open.ts`, `list.ts`, `show.ts`, `task.ts`, `remove.ts`, `prune.ts`, `path.ts`, `focus.ts`, `pick.ts`.
- Fixed config path mismatch: `load_config` now reads from `swarm.config.json` (repo root) with a fallback to the legacy `scripts/agents/config.json`.
- Fixed `ui.ts` dashboard to derive slug from `branch` (`agent/${slug}`) and use it as the state lookup key instead of `worktree.path`.
- Fixed `bin/swarm.js` to forward child signals (`process.kill(process.pid, res.signal)`) and use `res.status ?? 1` instead of `res.status || 0`.

**Phase 2 — High-priority bugs:**
- `daemon.ts`: fixed duplicate `.ts` check to `.tsx`.
- `profile.ts`: replaced hardcoded DAW paths with a placeholder message.
- `find.ts`: added `escape_regex()` helper to sanitize `queryTarget` before regex construction.
- `chat.ts`: replaced redundant `get_repo_root()` call with the cached `repoRoot` variable.
- `pr.ts`: replaced fragile `worktree` regex with `worktree_list()` lookup by branch name.
- `release.ts`: replaced naive `split('.').map(Number)` with robust regex-based semver parsing (`/^(\d+)\.(\d+)\.(\d+)/.exec`).
- `test-radius.ts`: changed to spawn `pnpm vitest run <files>` directly instead of incorrectly re-spawning `test.ts`.
- `heal.ts`, `review.ts`, `migrate.ts`, `profile.ts`: replaced broken `pnpm agents:new` spawns with direct `node --experimental-strip-types new.ts` invocations.

**Phase 3 — Structural cleanup:**
- Moved `complexity.ts` and `format.ts` from `src/utils/` to `src/modules/Commands/useCases/` with corrected relative imports.
- Created `ast-rename.ts` command wrapper for `src/utils/ast.ts`.
- Deleted `lint-results.json` from the repo root.
- Fixed `init.ts` to add the standard execution guard so it works when spawned directly.

### Open items / follow-up

- **Remove unused `ora` dependency:** ✅ Removed (no longer in `package.json`).
- **Scattered `process.exit()` in command files:** ✅ Refactored all 48 command files to return exit codes; execution guards use `process.exitCode = run()`.
- **NDJSON logging with `SWARM_LOG_FORMAT=json`:** ✅ Implemented `Terminal/services/logger.ts` with AsyncLocalStorage context, integrated into `index.ts`, migrated color helpers and representative command files.
- **`swarm decompose --execute`:** ✅ Implemented wave-based parallel DAG executor with worktree creation, task file generation, agent spawning, and completion polling.
- **`swarm message <slug> <json>`:** ✅ Implemented file-based mailbox command writing to `.agents/mailbox/{slug}.jsonl`.
