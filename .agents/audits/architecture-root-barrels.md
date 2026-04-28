# Architecture Audit: Root Barrels

## Goal
Audit the codebase to identify and eliminate root-level `index.ts` barrel files in modules. Modules must expose their public contracts through specific contract folders (e.g., `useCases/index.ts`, `stores/index.ts`) rather than aggregating everything at the module root.

## Findings
- Root `index.ts` files currently exist in multiple modules.
- These files act as blatant barrel exports, often causing all dependencies of a module to be evaluated upon import, which breaks lazy loading boundaries and creates circular dependency risks.
- Cross-module imports currently point to `#/modules/<Module>` or `../../<Module>`.

## Action Plan
1. **Identify Root Barrels:** Find all `src/modules/*/index.ts`.
2. **Relocate Exports:** Move the exports from each root `index.ts` into their respective contract folder barrels, such as `src/modules/<Module>/useCases/index.ts` or `events/index.ts`.
3. **Delete Root Barrels:** Remove the root `index.ts` files.
4. **Update Imports:** Find all cross-module imports targeting the old root barrels and update them to target the specific contract barrel (e.g., `#/modules/Terminal/useCases`).
5. **Update Dependency Rules:** Ensure `.dependency-cruiser.cjs` permits importing from the specific contract folders instead of the root.
6. **Validate:** Run `pnpm typecheck`, `pnpm deps:validate`, and `pnpm test:run`.