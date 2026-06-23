// @ts-check
// ESLint config for the Corpus CLI — Node 22, TypeScript, no React, no JSX.
//
// Uses only the plugins that are actually installed:
//   - @eslint/js
//   - typescript-eslint
//   - eslint-config-prettier (Prettier compat)
//   - globals
//
// AGENTS.md soundness rules are enforced inline below. We do not pull in
// React/Tauri/Tailwind/TanStack tooling — this is a CLI.

import eslintJs from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    // ── Ignores ──────────────────────────────────────────────────────────────
    {
        // `.worktrees/` holds task worktrees the launch engine creates — separate
        // checkouts, never lint targets (same reasoning as node_modules).
        ignores: ['node_modules/', 'dist/', 'build/', 'coverage/', 'scaffold/', '.worktrees/', '**/*.md'],
    },

    // ── Base configs ─────────────────────────────────────────────────────────
    eslintJs.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,

    // ── Global settings ──────────────────────────────────────────────────────
    {
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.node,
            },
            parserOptions: {
                project: './tsconfig.eslint.json',
                tsconfigRootDir: import.meta.dirname,
            },
        },
        linterOptions: {
            reportUnusedDisableDirectives: 'error',
        },
    },

    // ── All TS/JS files ──────────────────────────────────────────────────────
    {
        files: ['**/*.{ts,mts,cts,js,mjs,cjs}'],
        rules: {
            // Empty functions are common as mocks/no-op handlers in this codebase.
            '@typescript-eslint/no-empty-function': 'off',

            // Code style basics (covers what AGENTS.md/docs/07-conventions.md call out)
            curly: ['error', 'all'],
            eqeqeq: ['error', 'always'],
            'no-eval': 'error',
            'no-debugger': 'error',
            'no-var': 'error',
            'prefer-const': 'error',
            // string concatenation is widespread in the existing useCases; flag
            // as warning while we incrementally migrate to template literals.
            'prefer-template': 'warn',
            'no-implicit-coercion': 'warn',
            'no-nested-ternary': 'error',
            'no-unneeded-ternary': 'error',
            'object-shorthand': ['error', 'always'],
            'default-case-last': 'error',

            // Unused imports/vars: allow leading underscore, error otherwise.
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                    destructuredArrayIgnorePattern: '^_',
                },
            ],
        },
    },

    // ── TypeScript-only rules ────────────────────────────────────────────────
    {
        files: ['**/*.{ts,mts,cts}'],
        rules: {
            // AGENTS.md § TypeScript — soundness. The legacy SOL-era code that
            // accumulated `any` debt has been removed (M1 realignment), so the
            // `no-unsafe-*` family is now an error in source (tests relax it for
            // JSON.parse / mock convenience — see the test-file override below).
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-unsafe-argument': 'error',
            '@typescript-eslint/no-unsafe-assignment': 'error',
            '@typescript-eslint/no-unsafe-call': 'error',
            '@typescript-eslint/no-unsafe-member-access': 'error',
            '@typescript-eslint/no-unsafe-return': 'error',
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
            '@typescript-eslint/await-thenable': 'error',
            '@typescript-eslint/no-for-in-array': 'error',
            '@typescript-eslint/no-unnecessary-type-assertion': 'error',
            '@typescript-eslint/restrict-plus-operands': 'error',
            '@typescript-eslint/restrict-template-expressions': [
                'warn',
                { allowAny: false, allowBoolean: true, allowNullish: false, allowNumber: true, allowRegExp: true },
            ],

            // Prefer `type` over `interface` (AGENTS.md L147). Soft-warn for
            // now while pre-existing `interface` declarations are migrated.
            '@typescript-eslint/consistent-type-definitions': ['warn', 'type'],

            // Forbid empty `{}` types.
            '@typescript-eslint/no-empty-object-type': 'error',

            // `import { type X } ...` style (AGENTS.md L147).
            '@typescript-eslint/consistent-type-imports': [
                'error',
                { prefer: 'type-imports', fixStyle: 'inline-type-imports', disallowTypeAnnotations: false },
            ],

            // `@ts-expect-error` requires a justification.
            '@typescript-eslint/ban-ts-comment': [
                'error',
                {
                    'ts-expect-error': 'allow-with-description',
                    'ts-ignore': true,
                    'ts-nocheck': true,
                    'ts-check': false,
                    minimumDescriptionLength: 8,
                },
            ],

            // No namespace imports (AGENTS.md L149).
            'no-restricted-syntax': [
                'error',
                {
                    selector: 'ImportNamespaceSpecifier',
                    message:
                        'Namespace imports (`import * as X from ...`) are forbidden. Import named exports individually (AGENTS.md § React 19 & Coding Conventions).',
                },
                {
                    selector: 'TSEnumDeclaration',
                    message: '`enum` is forbidden. Use an `as const` object instead (AGENTS.md L147).',
                },
                {
                    selector: 'TSAsExpression > TSAnyKeyword',
                    message:
                        '`as any` is forbidden. Use `unknown` + narrowing, `satisfies`, or runtime validation at the I/O boundary.',
                },
            ],

            // Mostly-correct switch/case discipline.
            '@typescript-eslint/switch-exhaustiveness-check': 'warn',
        },
    },

    // ── CLI command files: console.log is fine (it's the UI) ─────────────────
    {
        files: ['src/modules/Commands/useCases/**/*.ts', 'src/modules/Terminal/useCases/**/*.ts', 'src/index.ts'],
        rules: {
            'no-console': 'off',
        },
    },

    // ── Test files: relax soundness for mocking convenience ──────────────────
    // Tests parse JSON, spy on process streams, and script mocks — `any` flows
    // through them by nature. The unsafe family is off here; the product source
    // (above) keeps it as an error.
    {
        files: ['**/*.spec.{ts,tsx}', '**/*.test.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}', '**/testing/**/*.{ts,tsx}'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-return': 'off',
            '@typescript-eslint/restrict-template-expressions': 'off',
            '@typescript-eslint/prefer-regexp-exec': 'off',
            '@typescript-eslint/no-empty-object-type': 'off',
            '@typescript-eslint/unbound-method': 'off',
            'no-restricted-syntax': 'off',
            'consistent-return': 'off',
        },
    },

    // ── Generated coverage artifacts and the bin shim ────────────────────────
    {
        files: ['bin/**/*.js'],
        rules: {
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
        },
    },

    // ── Plain-JS + config files (.dependency-cruiser.cjs, this config, the bin
    //    shim) are not part of the TS program, so type-aware parsing would fail
    //    ("file not found in project"). Turn off the typed parser + typed rules
    //    for them. cmdLint only globs src/**/*.ts, but this keeps `eslint .`
    //    clean across the whole repo.
    {
        files: ['**/*.{js,mjs,cjs}', '**/*.config.{ts,mts,cts}'],
        ...tseslint.configs.disableTypeChecked,
    },

    // ── Prettier compatibility (must be last) ────────────────────────────────
    prettierConfig
);
