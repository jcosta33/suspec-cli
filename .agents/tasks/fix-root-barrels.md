# Fix Root Barrels

## Metadata
- Slug: fix-root-barrels

## Objective
Remove root `index.ts` files from all modules and migrate their public exports to contract-specific barrels like `useCases/index.ts`. Update all internal cross-module imports to target these new boundaries.

## Linked docs
- `.agents/audits/architecture-root-barrels.md`
- `docs/05-architecture.md`

## Plan
1. Glob for `src/modules/*/index.ts`.
2. Read the contents to see what is being exported.
3. Create/update `src/modules/*/useCases/index.ts` (and others if needed) with the appropriate exports.
4. Update all consumers of the old root modules to import from the specific contract barrel.
5. Delete the root `index.ts` files.
6. Validate with typecheck, deps:validate, and tests.

## Progress checklist
- [ ] Find all root `index.ts` files
- [ ] Migrate exports to `useCases/index.ts` (or `events/index.ts`, etc.)
- [ ] Update import statements across the codebase
- [ ] Update `dependency-cruiser.cjs` rules if necessary
- [ ] Delete old `index.ts` files
- [ ] Validation

## Decisions
- 

## Blockers
- 

## Findings
- 

## Self-review

### Verification outputs
- [ ] `git status`
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test:run`
- [ ] `pnpm deps:validate`

### Did I stay within scope?

### Are there any follow-up tasks?