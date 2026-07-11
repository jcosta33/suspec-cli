import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Fork a child process per test file. The suite stubs and mutates per-process state —
        // process.exitCode, captured stdout/stderr writers, env — so each file gets its own
        // process and that state cannot leak across files under `vitest run --coverage`.
        pool: 'forks',
        // Pin color OFF for every test process. picocolors force-enables color when a `CI`
        // env var is present, so renderer tests asserting uncolored strings passed locally
        // but failed on every CI run. NO_COLOR takes precedence over CI/FORCE_COLOR in
        // picocolors, making test output deterministic in both environments.
        env: { NO_COLOR: '1' },
        globals: true,
        environment: 'node',
        exclude: ['**/node_modules/**', '**/dist/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'json'],
            // Cover the product source — the dispatcher + every module. Exclude the barrels
            // (re-exports, no logic), the specs, and the test-support helpers.
            include: ['src/**/*.ts'],
            exclude: ['src/modules/**/index.ts', 'src/**/*.spec.ts', 'src/**/testing/**'],
            all: true,
            // Near-100%, gated. The only source-level exemption is the v8-ignored process entry
            // in src/index.ts (dispatch() + is_main_module are unit-tested directly); the margin
            // under 100% is uncovered branches spread across the dispatcher, the check engine,
            // and the parsers — the coverage report names the lines.
            thresholds: { statements: 98, branches: 94, functions: 99, lines: 98 },
        },
    },
});
