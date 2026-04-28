# Fix Daemon Watcher

## Metadata
- Slug: fix-daemon-watcher

## Objective
Fix the daemon background test loop (`src/modules/Commands/useCases/daemon.ts`) to avoid hardcoding `src` as the watch path and to fix `fs.watch` `{ recursive: true }` issues on Linux by implementing manual recursive watching or replacing it.

## Linked docs
- `.agents/skills/manage-task/SKILL.md`
- `.agents/audits/critical-analysis.md`

## Plan
1. Analyze `src/modules/Commands/useCases/daemon.ts`.
2. Allow `path` to be configurable (via arguments or fallback to `src`). Wait, checking if we can pass args.
3. Replace `fs.watch(..., { recursive: true })` with a manual tree traversal watcher because external dependencies are restricted (unless `chokidar` is allowed? Let's check `package.json`).
4. Wait, the audit says: "Replace raw `fs.watch` with a robust file watcher like `chokidar` or manually traverse directories if external dependencies are forbidden."
5. Let's see if we can use a recursive manual traversal watcher using `fs.watch` on every directory.
6. Verify changes with tests.

## Progress checklist
- [x] Analyze `daemon.ts`
- [x] Determine watcher strategy
- [x] Refactor `daemon.ts`
- [x] Fix tests
- [x] Validation

## Decisions
- Chose to write a custom `watchRecursive` function using `fs.watch` combined with `fs.readdirSync` and `fs.statSync` because adding `chokidar` via external dependency is restricted by the project's package rules.
- Replaced the hardcoded 'src' watch target with a positional argument, defaulting to 'src' if omitted.

## Blockers
- None.

## Findings
- `fs.watch` with `{ recursive: true }` fails silently on several platforms. The manual traversal approach guarantees accurate tracking of files and prevents node watcher crashes.

## Self-review

### Verification outputs
- [x] `git status`
```
On branch fix-daemon-watcher
Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
        modified:   src/modules/Commands/__tests__/daemon.spec.ts
        modified:   src/modules/Commands/useCases/daemon.ts
```
- [x] `pnpm typecheck`
```
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
Yes, solely fixed the daemon background watcher issues.

### Are there any follow-up tasks?
- Final issue: Check if `git rerere.enabled true` is executed safely in `init.ts`.
