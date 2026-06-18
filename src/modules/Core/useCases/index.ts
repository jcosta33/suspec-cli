// The reconcile-only Core barrel (AC-003) — the single importable surface the command wrappers and
// the TUI flows wrap (and, later, editors / CI / the MCP server, without shelling out). Re-exports
// the four engines' use-cases + the Unix-part contract util. By construction this module touches
// no agent/model path; the boundary test in __tests__/boundary.spec.ts enforces it (AC-014).

// The contract util (AC-001/002)
export { project, emit_error, exit_code_for, no_workspace_error, usage_error } from './unixOutcome.ts';

// check engine (AC-005/006/007/008); review-file C012 (M2 AC-028); change-plan C010/C011 (W6)
export { check_spec } from './checkSpec.ts';
export { check_workspace } from './checkWorkspace.ts';
export { check_review_file } from './checkReviewFile.ts';
export { check_change_plan } from './checkChangePlan.ts';
export { build_spec_ref_resolver } from './resolveSpecRef.ts';
export { find_workspace_spec_files, find_sibling_spec_files } from './findSpecFiles.ts';

// launch engine — worktrees, no agent (AC-009/010); run launch resolution (SPEC-swarm-cli-run)
export { create_worktree } from './createWorktree.ts';
export { list_swarm_worktrees } from './listSwarmWorktrees.ts';
export { remove_worktree } from './removeWorktree.ts';
export { prune_worktrees } from './pruneWorktrees.ts';
export { stamp_runtime_isolation } from './stampRuntimeIsolation.ts';
export { resolve_launch, type LaunchPlan, type ResolveLaunchInput } from './resolveLaunch.ts';

// reconcile engine — status, no agent (AC-011); review, no agent (M2 AC-018/019/020/021/023)
export { derive_board } from './deriveBoard.ts';
export {
    reconcile_review,
    type ReviewReport,
    type CoverageFinding,
    type ReconcileReviewInput,
} from './reconcileReview.ts';
export { resolve_review_run, type ResolveReviewRunInput } from './resolveReviewRun.ts';
export { draft_review_packet, type DraftReviewPacketInput, type DraftReviewPacket } from './draftReviewPacket.ts';

// prepare engine — init + new, no agent (AC-012/013/016); pull + promote, no board (W5 AC-001/002)
export { init_workspace } from './initWorkspace.ts';
export { cut_packet } from './cutPacket.ts';
export { scaffold_spec } from './scaffoldSpec.ts';
export { pull_intake, type PullIntakeInput, type PullIntakeReport, type GhFetcher } from './pullIntake.ts';
export { scaffold_finding, type ScaffoldFindingInput, type ScaffoldFindingReport } from './scaffoldFinding.ts';
