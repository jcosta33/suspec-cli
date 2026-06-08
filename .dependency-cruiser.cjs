/** @type {import('dependency-cruiser').IConfiguration} */

// ─────────────────────────────────────────────────────────────────────────────
// Swarm CLI module architecture enforcement
//
// Module layout (one folder per bounded context under src/modules):
//   src/modules/Workspace/      — git worktree primitives (core)
//   src/modules/AgentState/     — JSON state registry + telemetry SQLite (core)
//   src/modules/TaskManagement/ — slug, template, DAG helpers
//   src/modules/Adapters/       — external agent CLI configs
//   src/modules/Terminal/       — terminal launching, colors, parse_args, UI
//   src/modules/Commands/       — CLI command implementations (orchestration)
//   src/utils/                  — pure stateless utilities
//   src/infra/                  — cross-cutting infra (DI, logger, events, store, errors)
//
// AGENTS.md hard rules enforced here:
//   - Cross-module imports MUST target the destination module's root index.ts.
//   - Same-module imports MUST use relative paths (never the module barrel).
//   - Models / repositories / services / handlers / engine are PRIVATE.
//   - Core modules (Workspace, AgentState) cannot depend on Commands or Terminal.
//   - Utils must be pure and stateless — no module deps.
//   - Infra (DI/logger/events/...) must not depend on modules.
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

        // ── Module isolation ────────────────────────────────────────────────
        {
            name: 'core-isolation',
            severity: 'error',
            comment: 'Core modules (Workspace, AgentState, Sol) must not depend on Commands or Terminal.',
            from: { path: '^src/modules/(Workspace|AgentState|Sol)/' },
            to: { path: '^src/modules/(Commands|Terminal)/' },
        },
        {
            name: 'task-management-isolation',
            severity: 'error',
            comment: 'TaskManagement must not depend on Commands or Terminal.',
            from: { path: '^src/modules/TaskManagement/' },
            to: { path: '^src/modules/(Commands|Terminal)/' },
        },
        {
            name: 'adapters-isolation',
            severity: 'error',
            comment: 'Adapters define external tool logic. They cannot depend on Commands or Terminal.',
            from: { path: '^src/modules/Adapters/' },
            to: { path: '^src/modules/(Commands|Terminal)/' },
        },
        {
            name: 'utils-isolation',
            severity: 'error',
            comment: 'Utils must be pure and stateless. They cannot depend on any module.',
            from: { path: '^src/utils/' },
            to: { path: '^src/modules/' },
        },
        {
            name: 'infra-isolation',
            severity: 'error',
            comment: 'Infra (DI, logger, events, store, errors) cannot depend on modules — that direction reverses the dependency.',
            from: { path: '^src/infra/' },
            to: { path: '^src/modules/' },
        },

        // ── Cross-module discipline (AGENTS.md § Frontend Domain-Driven) ────
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
                'Models / repositories / services / handlers / engine are STRICTLY PRIVATE to their owning module. Cross-module access goes through useCases re-exported on index.ts.',
            from: { path: '^src/modules/([^/]+)/' },
            to: {
                path: '^src/modules/[^/]+/(models|repositories|services|handlers|engine|transformers|validators|stores|events|presentations)/',
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
                collapsePattern:
                    '^(?:src|bin|test(s?)|spec(s?))/[^/]+|node_modules/(?:@[^/]+/[^/]+|[^/]+)',
            },
        },
    },
};
