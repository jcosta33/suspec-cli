import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Fork a child process per test file. The default thread pool deadlocks under v8 coverage
        // when a test spawns many `git` subprocesses (the worktree / launch integration tests);
        // forks isolate cleanly so `vitest run --coverage` completes.
        pool: 'forks',
        // The worktree / review integration tests spawn many real `git` subprocesses; under forked
        // parallelism they contend and can exceed the 5s default, flaking the suite on busy hosts.
        // A higher ceiling keeps `vitest run` deterministic without weakening any check (coverage
        // thresholds and the test set are unchanged); a genuinely hung test still fails, just later.
        testTimeout: 30000,
        globals: true,
        environment: 'node',
        exclude: ['**/node_modules/**', '**/dist/**', '.worktrees/**', 'scaffold/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'json'],
            // Cover the product source — the dispatcher + every module. Exclude the barrels
            // (re-exports, no logic), the specs, and the test-support helpers.
            include: ['src/**/*.ts'],
            exclude: ['src/modules/**/index.ts', 'src/**/*.spec.ts', 'src/**/testing/**'],
            all: true,
            // Near-100%, gated. The documented margin (a few percent of branches) is genuinely
            // untestable defensive code: the no---from network clone, the detached-HEAD `?? 'main'`
            // fallbacks, and a worktree-list parse branch. Interactive @clack shells + the spawn-
            // launch error paths are v8-ignored at the source with justifications.
            thresholds: { statements: 98, branches: 94, functions: 99, lines: 98 },
        },
    },
});
