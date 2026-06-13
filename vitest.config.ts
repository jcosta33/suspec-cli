import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Fork a child process per test file. The default thread pool deadlocks under v8 coverage
        // when a test spawns many `git` subprocesses (the worktree / launch integration tests);
        // forks isolate cleanly so `vitest run --coverage` completes.
        pool: 'forks',
        globals: true,
        environment: 'node',
        exclude: ['**/node_modules/**', '**/dist/**', '.worktrees/**', 'scaffold/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'json'],
            include: ['src/modules/**/*'],
            exclude: ['src/modules/**/index.ts', 'src/modules/**/*.spec.ts', 'src/modules/**/*.md', 'src/modules/**/*.json'],
            all: true,
        },
    },
});
