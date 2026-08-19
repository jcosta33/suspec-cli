// The Core barrel — the single importable surface the check command wraps. Re-exports the check
// engine's use-cases + the Unix-part contract util. The engine is pure over the files it is handed
// (ADR-0143): filesystem access comes in through injected predicates built here from explicit
// paths; nothing resolves a store, a config, a repo root, or a workspace tree.

// The contract util
export { project, emit_error, usage_error } from './unixOutcome.ts';

// check engine: single-spec checks, change-plan checks, campaign checks,
// file-set checks, and injected-predicate builders. Reference resolution stays artifact-relative.
export { check_spec } from './checkSpec.ts';
export { check_task } from './checkTask.ts';
export { check_change_plan } from './checkChangePlan.ts';
export { check_campaign } from './checkCampaign.ts';
export { check_artifact_set } from './checkArtifactSet.ts';
export { build_spec_ref_resolver } from './resolveSpecRef.ts';
export { build_anchor_resolver } from './buildAnchorResolver.ts';
export { build_source_exists } from './resolveSourcePath.ts';
export { find_sibling_spec_files } from './findSpecFiles.ts';

// the checks-contract projection (`suspec check --contract`)
export { contract_dump } from './contractDump.ts';
