# Fix Ungraceful Crashes

## Metadata
- Slug: fix-ungraceful-crashes

## Objective
Refactor core modules (specifically `Workspace/git.ts` and `Terminal/terminal.ts`) to return explicit `Result<V, AppError>` types instead of throwing raw `Error`s for recoverable failures. This prevents the CLI from crashing ungracefully.

## Linked docs
- `.agents/skills/manage-task/SKILL.md`
- `.agents/skills/documentation-gatekeeper/SKILL.md`
- `.agents/skills/event-bus-and-results/SKILL.md`
- `.agents/audits/critical-analysis.md`

## Plan
1. Analyze `src/modules/Workspace/useCases/git.ts` to identify `throw` usage and refactor to return `Result`.
2. Analyze `src/modules/Terminal/useCases/terminal.ts` to identify `throw` usage (especially for `osascript`) and refactor to return `Result` and provide a fallback.
3. Update all callers of these refactored functions to correctly discriminate on the returned `Result`.
4. Update associated tests (`*.spec.ts`) to assert on `Result` types (`assertOk`/`assertErr`) instead of expecting `throw`s.
5. Verify changes with `pnpm typecheck`, `pnpm deps:validate`, `pnpm lint`, and `pnpm test:run`.

## Progress checklist
- [x] Refactor `Workspace/useCases/git.ts`
- [x] Refactor `Terminal/useCases/terminal.ts`
- [x] Update callers of refactored `git.ts` functions
- [x] Update callers of refactored `terminal.ts` functions
- [x] Fix tests
- [x] Pass all validation checks

## Decisions
- Refactored `worktree_prune` instead of `git()` internally because `git()` is used for purely unrecoverable paths like `get_repo_root()`, while `worktree_prune` was unhandled.
- Replaced throwing functions in `terminal.ts` with `TerminalLaunchResult`.
- Updated `slug.ts` and `decompose.ts` to return `Result` since their inputs are user-provided and should fail gracefully.

## Blockers
- None.

## Findings
- `fs.watch` and `osascript` throw errors that needed to be explicitly handled by propagating them to `Result<V, E>` rather than letting the entire application crash abruptly.

## Self-review

### Verification outputs

- [x] `git status`
```
On branch fix-ungraceful-crashes
Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
        modified:   src/modules/Commands/__tests__/decompose.spec.ts
        modified:   src/modules/Commands/__tests__/launch-agent.spec.ts
        modified:   src/modules/Commands/__tests__/new.spec.ts
        modified:   src/modules/Commands/useCases/decompose.ts
        modified:   src/modules/Commands/useCases/launch-agent.ts
        modified:   src/modules/Commands/useCases/new.ts
        modified:   src/modules/Commands/useCases/prune.ts
        modified:   src/modules/TaskManagement/__tests__/slug.spec.ts
        modified:   src/modules/TaskManagement/useCases/slug.ts
        modified:   src/modules/Terminal/__tests__/terminal-launch.spec.ts
        modified:   src/modules/Terminal/useCases/terminal.ts
        modified:   src/modules/Workspace/useCases/git.ts
```
- [x] `pnpm typecheck`
```
> swarm-cli@1.0.0 typecheck /Users/josecosta/dev/swarm-cli
> tsc --noEmit
```
- [x] `pnpm lint` (0 errors)
- [x] `pnpm test:run`
```
 Test Files  91 passed (91)
      Tests  669 passed (669)
```
- [x] `pnpm deps:validate`
```
✔ no dependency violations found (115 modules, 210 dependencies cruised)
```

### Did I stay within scope?
Yes, focused purely on replacing `throw` with `Result` in core modules.

### Are there any follow-up tasks?
- The daemon hardcoded paths and linux recursive watcher issue still needs to be addressed.
- Need to check if `git rerere.enabled true` is executed safely in `init.ts`.
