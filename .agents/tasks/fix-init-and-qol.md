# Fix Init and Quality of Life Features

## Metadata
- Slug: fix-init-and-qol

## Objective
Address the blind `git rerere` execution in `init.ts` by validating its exit status instead of silently failing, and introduce standard verbosity flags (`--quiet`, `--verbose`) to improve CLI Quality of Life and reduce output clashing.

## Linked docs
- `.agents/skills/manage-task/SKILL.md`
- `.agents/audits/critical-analysis.md`

## Plan
1. Check `src/modules/Commands/useCases/init.ts` for the `spawnSync` command enabling `rerere`.
2. Capture the `Result` or `spawnSync` exit code, and if it fails, use the UI logger to emit a non-fatal warning instead of continuing silently.
3. Check `src/modules/Terminal/useCases/cli.ts` (where `parse_args` is) and `src/modules/Terminal/services/logger.ts` to implement `--quiet` and `--verbose` flags.
4. If verbosity is already somewhat handled, refine it so standard UI functions check verbosity state.
5. Update tests.

## Progress checklist
- [x] Fix `init.ts` blind execution
- [x] Investigate QoL verbosity
- [x] Update `parse_args` and logger
- [x] Fix tests
- [x] Validation

## Decisions
- Used `process.env.SWARM_LOG_LEVEL` and `process.env.SWARM_DEBUG` to propagate the `--quiet` and `--verbose` flags globally from `src/index.ts` so that child spawn processes and all loaded modules automatically inherit the requested verbosity level without threading parameter state everywhere.
- Captured `spawnSync` errors and non-zero exit codes in `init.ts` for `git config rerere.enabled true` to fallback to a UI warning instead of continuing blindly.

## Blockers
- None.

## Findings
- Swarm commands are executed natively within child Node processes spawned by `index.ts`, making environment variables the optimal state transfer mechanism for universal CLI arguments like verbosity.

## Self-review

### Verification outputs
- [x] `git status`
```
On branch fix-init-and-qol
Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
        modified:   src/index.ts
        modified:   src/modules/Commands/__tests__/init.spec.ts
        modified:   src/modules/Commands/useCases/init.ts
        modified:   src/modules/Terminal/services/logger.ts
```
- [x] `pnpm typecheck`
```
> tsc --noEmit
```
- [x] `pnpm lint` (0 errors)
- [x] `pnpm test:run`
```
 Test Files  91 passed (91)
      Tests  670 passed (670)
```
- [x] `pnpm deps:validate`
```
✔ no dependency violations found (115 modules, 210 dependencies cruised)
```

### Did I stay within scope?
Yes, added logging validation for `init.ts` and verbosity flags to `index.ts`.

### Are there any follow-up tasks?
- All audit issues from `critical-analysis.md` should now be fully resolved.
