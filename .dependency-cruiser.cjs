/** @type {import('dependency-cruiser').IConfiguration} */

// ─────────────────────────────────────────────────────────────────────────────
// Suspec CLI module architecture enforcement
//
// Module layout (one folder per bounded context under src/modules):
//   src/modules/Core/       — the check engine + the unixOutcome contract
//   src/modules/Sol/        — the plain two-tier spec parser
//   src/modules/Terminal/   — CLI argument parsing
//   src/modules/Commands/   — the thin command wrapper (the surface)
//   src/infra/              — cross-cutting infra (the Result / AppError algebra only)
//
// Composition flows one way (enforced below):
//   the surface (Commands) → Core → leaves (Sol, Terminal) → infra
//
// AGENTS.md hard rules enforced here:
//   - Cross-module imports MUST target the destination module's root useCases/index.ts.
//   - Same-module imports MUST use relative paths (never the module barrel).
//   - Models / repositories / services / validators are PRIVATE to their module.
//   - Nothing below the surface may import it; leaves may import only infra.
//   - Infra is leaf-level — it must not import any module.
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
    forbidden: [
        {
            name: 'no-circular',
            severity: 'error',
            comment: 'Circular dependencies are forbidden.',
            from: {},
            to: { circular: true },
        },

        // ── Module isolation (the one-way composition) ──────────────────────
        {
            name: 'surface-isolation',
            severity: 'error',
            comment: 'The surface (Commands) is the top of the graph — Core and the leaves must not import it.',
            from: { path: '^src/modules/(Core|Sol|Terminal)/' },
            to: { path: '^src/modules/Commands/' },
        },
        {
            name: 'leaf-isolation',
            severity: 'error',
            comment:
                'Leaves (Sol, Terminal) sit below Core — they must not import Core or the surface; only infra.',
            from: { path: '^src/modules/(Sol|Terminal)/' },
            to: { path: '^src/modules/(Core|Commands)/' },
        },
        {
            name: 'infra-isolation',
            severity: 'error',
            comment: 'Infra (the Result / AppError algebra) is leaf-level — it must not import any module.',
            from: { path: '^src/infra/' },
            to: { path: '^src/modules/' },
        },

        // ── Cross-module discipline (AGENTS.md architecture discipline) ────
        {
            name: 'no-cross-module-deep-import',
            severity: 'error',
            comment:
                'Cross-module imports must target the destination module barrel (src/modules/<X>/useCases/index.ts). Deep imports into models/, etc. from a different module are forbidden.',
            from: { path: '^src/modules/([^/]+)/' },
            to: {
                path: '^src/modules/[^/]+/(?!useCases/index\\.ts$).+',
                pathNot: [
                    // Same-module relative imports are fine.
                    '^src/modules/$1/',
                ],
            },
        },
        {
            name: 'no-import-private-internals-cross-module',
            severity: 'error',
            comment:
                'Models / repositories / services / validators are STRICTLY PRIVATE to their owning module. Cross-module access goes through useCases re-exported on index.ts.',
            from: { path: '^src/modules/([^/]+)/' },
            to: {
                path: '^src/modules/[^/]+/(models|repositories|services|validators)/',
                pathNot: [
                    // Same-module access into its own private dirs is allowed.
                    '^src/modules/$1/',
                ],
            },
        },
        {
            name: 'no-own-barrel',
            severity: 'error',
            comment:
                'Files inside src/modules/<X>/ must not import from their own barrel (useCases/index.ts). Use relative paths directly to the defining file.',
            from: { path: '^src/modules/([^/]+)/.+' },
            to: { path: '^src/modules/$1/useCases/index\\.ts$' },
        },
        {
            name: 'no-deep-import-from-entry',
            severity: 'error',
            comment:
                'Any src file outside src/modules/ and src/infra/ (the dispatcher src/index.ts, and any future src/<util>/) reaches a module only through its root useCases/index.ts barrel — never a deep import. The module rules anchor on ^src/modules/ and infra-isolation on ^src/infra/, so without this such files would sit outside the enforced perimeter.',
            from: { path: '^src/(?!modules/|infra/).+\\.ts$' },
            to: { path: '^src/modules/[^/]+/(?!useCases/index\\.ts$).+' },
        },

        // ── Hygiene ─────────────────────────────────────────────────────────
        {
            name: 'no-orphans',
            severity: 'warn',
            comment: 'Orphan modules — files no other module imports — are likely dead code.',
            from: {
                orphan: true,
                pathNot: [
                    '\\.(d\\.ts|spec\\.ts|test\\.ts)$',
                    '(^|/)__tests__/',
                    '(^|/)testing/',
                    'src/index\\.ts$',
                    'src/modules/Commands/useCases/',
                    'src/infra/[^/]+/index\\.ts$',
                    'eslint\\.config\\.mjs$',
                    'eslint\\.fast\\.config\\.mjs$',
                ],
            },
            to: {},
        },
        {
            name: 'no-deprecated-core',
            severity: 'warn',
            comment: 'Avoid deprecated Node core modules.',
            from: {},
            to: { dependencyTypes: ['deprecated'] },
        },
        {
            name: 'not-to-spec',
            severity: 'error',
            comment: 'Never import from a spec/test file in production code.',
            from: { pathNot: '\\.(spec|test)\\.(ts|tsx)$' },
            to: { path: '\\.(spec|test)\\.(ts|tsx)$' },
        },
    ],

    options: {
        doNotFollow: { path: ['node_modules'] },
        exclude: { path: '\\.(spec|test)\\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$' },
        includeOnly: ['src', 'bin'],
        moduleSystems: ['cjs', 'es6'],
        enhancedResolveOptions: {
            exportsFields: ['exports'],
            conditionNames: ['import', 'require', 'node', 'default', 'types'],
            mainFields: ['module', 'main', 'types', 'typings'],
        },
        skipAnalysisNotInRules: false,
        tsConfig: { fileName: 'tsconfig.json' },
        // Trace `import type {...}` so types-only files (e.g. infra/**/types.ts)
        // don't show up as orphans.
        tsPreCompilationDeps: true,
        reporterOptions: {
            text: { highlightFocused: true },
            archi: {
                collapsePattern: '^(?:src|bin|test(s?)|spec(s?))/[^/]+|node_modules/(?:@[^/]+/[^/]+|[^/]+)',
            },
        },
    },
};
