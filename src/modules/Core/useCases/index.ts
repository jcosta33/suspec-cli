// The reconcile-only Core barrel (AC-003) — the single importable surface the command wrappers and
// the TUI flows wrap (and, later, editors / CI / the MCP server, without shelling out). Re-exports
// the four engines' use-cases + the Unix-part contract util. By construction this module touches
// no agent/model path; the boundary test in __tests__/boundary.spec.ts enforces it (AC-014).

// The contract util (AC-001/002)
export { project, emit_error, exit_code_for, no_workspace_error, usage_error } from './unixOutcome.ts';
// Path-segment guard (shared with scaffold/cut) — for command-surface positional slug validation.
export { is_safe_segment } from '../services/safeSegment.ts';
// The canonical task-slug normalizer (the worktree branch tail) — shared so command surfaces derive the
// same `reviews/<slug>.md` / branch tail the worktree producer + resolvers do, never a hand-rolled copy.
export { task_slug } from '../services/worktreeNames.ts';

// check engine (AC-005/006/007/008); review-file C012 (M2 AC-028); change-plan C010/C011 (W6)
export { check_spec } from './checkSpec.ts';
export { check_workspace } from './checkWorkspace.ts';
export { check_review_file } from './checkReviewFile.ts';
export { check_change_plan } from './checkChangePlan.ts';
export { build_spec_ref_resolver } from './resolveSpecRef.ts';
export { build_anchor_resolver } from './buildAnchorResolver.ts';
export { build_source_exists, infer_workspace_root } from './resolveSourcePath.ts';
export { find_workspace_spec_files, find_sibling_spec_files } from './findSpecFiles.ts';

// launch engine — worktrees, no agent (AC-009/010); run launch resolution (SPEC-suspec-cli-run)
export { create_worktree } from './createWorktree.ts';
export { list_suspec_worktrees } from './listSuspecWorktrees.ts';
export { remove_worktree } from './removeWorktree.ts';
export { prune_worktrees } from './pruneWorktrees.ts';
export { stamp_runtime_isolation } from './stampRuntimeIsolation.ts';
export { resolve_launch, type LaunchPlan, type ResolveLaunchInput } from './resolveLaunch.ts';
// Task resolution shared by the worktree/review/run surfaces — bidirectional id↔slug + the task list.
export { resolve_task, list_task_ids } from './taskLocator.ts';

// read-only artifact projection — the `suspec show` loader surface (the MCP adapts it; ADR-0085)
export { show_artifact, type ShowResult, type ShowKind } from './showArtifact.ts';

// reconcile engine — status, no agent (AC-011); review, no agent (M2 AC-018/019/020/021/023)
export { derive_board } from './deriveBoard.ts';
export {
    scan_clean_candidates,
    type CleanReport,
    type CleanCandidate,
    type CleanKind,
    type ScanCleanInput,
} from './scanCleanCandidates.ts';
export { apply_clean, type CleanResult, type ApplyCleanInput } from './applyClean.ts';
export {
    scan_spec_staleness,
    type StalenessReport,
    type StaleSpec,
    type ScanStalenessInput,
} from './scanSpecStaleness.ts';
export {
    reconcile_review,
    type ReviewReport,
    type CoverageFinding,
    type ReconcileReviewInput,
} from './reconcileReview.ts';
export { resolve_review_run, type ResolveReviewRunInput } from './resolveReviewRun.ts';
export { resolve_review_run_by_spec, type ResolveReviewRunBySpecInput } from './resolveReviewRunBySpec.ts';
export { stamp_artifact, type StampReport, type StampArtifactInput } from './stampArtifact.ts';
export { draft_review_packet, type DraftReviewPacketInput, type DraftReviewPacket } from './draftReviewPacket.ts';

// drift engine — suspec update --check, no agent, no write (SPEC-suspec-update, ADR-0091)
export { check_update, type UpdateCheckReport, type CheckUpdateInput } from './checkUpdate.ts';
// drift apply — suspec update --write, reuses init_workspace's copy engine (SPEC-suspec-update AC-008)
export { apply_update, type ApplyUpdateReport, type ApplyUpdateInput } from './applyUpdate.ts';

// prepare engine — init + new, no agent (AC-012/013/016); pull + promote, no board (W5 AC-001/002)
export { init_workspace, type ConflictPolicy } from './initWorkspace.ts';
export { cut_packet } from './cutPacket.ts';
export { scaffold_spec } from './scaffoldSpec.ts';
export { scaffold_change_plan } from './scaffoldChangePlan.ts';
export { pull_intake, type PullIntakeInput, type PullIntakeReport, type GhFetcher } from './pullIntake.ts';
export { scaffold_finding, type ScaffoldFindingInput, type ScaffoldFindingReport } from './scaffoldFinding.ts';
