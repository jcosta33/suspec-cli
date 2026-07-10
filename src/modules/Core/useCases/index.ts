// The Core barrel — the single importable surface the check command wraps. Re-exports the check
// engine's use-cases + the Unix-part contract util. The engine is pure over the files it is handed
// (ADR-0143): filesystem access comes in through injected predicates built here from explicit
// paths; nothing resolves a store, a config, a repo root, or a workspace tree.

// The contract util
export { project, emit_error, exit_code_for, usage_error } from './unixOutcome.ts';
// Path-segment guard — rejects traversal-shaped ids/segments before they reach a path join.
export { is_safe_segment } from '../services/safeSegment.ts';

// check engine: single-spec checks, review-packet reconcile (C012/C013/C016/C020), change-plan
// checks (C010/C011), and the injected-predicate builders (all artifact-relative).
export { check_spec } from './checkSpec.ts';
export { check_review_file } from './checkReviewFile.ts';
export { check_change_plan } from './checkChangePlan.ts';
export { build_spec_ref_resolver } from './resolveSpecRef.ts';
export { build_anchor_resolver } from './buildAnchorResolver.ts';
export { build_source_exists, infer_workspace_root } from './resolveSourcePath.ts';
export { find_workspace_spec_files, find_sibling_spec_files } from './findSpecFiles.ts';
