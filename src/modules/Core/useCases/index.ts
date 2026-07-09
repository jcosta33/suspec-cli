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
export { task_slug, derive_worktree_names } from '../services/worktreeNames.ts';
// The lean launch-prompt templater (pure) — `suspec work` writes its output to scratch (ADR-0136 D3).
export { generate_prompt, type GeneratePromptInput } from '../services/generatePrompt.ts';

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
// spec-first launch resolution + setup commands — `suspec work` (SPEC-suspec-cli-work), task-optional
export { resolve_launch_by_spec, type LaunchBySpecPlan, type ResolveLaunchBySpecInput } from './resolveLaunchBySpec.ts';
export { read_setup_commands } from './readSetupCommands.ts';
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

// store engine — the personal-harness store foundation (SPEC-suspec-v2 AC-001/002/003)
export {
    resolve_store_dir,
    type ResolveStoreDirInput,
    type StoreDirResolution,
    type StoreConfig,
} from './resolveStoreDir.ts';
export { write_store_artifact, type WriteStoreArtifactOptions } from './writeStoreArtifact.ts';
export { archive_artifact } from './archiveArtifact.ts';
export { migrate_store, type MigrateStoreInput, type MigrateStoreReport } from './migrateStore.ts';

// launch loop v2 — `suspec work` re-rooted onto the store (SPEC-suspec-v2 AC-004..009)
export {
    resolve_launch_from_store,
    type LaunchFromStorePlan,
    type ResolveLaunchFromStoreInput,
} from './resolveLaunchFromStore.ts';
export { resolve_setup_plan, type SetupPlan, type ResolveSetupPlanInput } from './resolveSetupPlan.ts';
export { check_store_spec_staleness, type StoreSpecStaleness } from './checkStoreSpecStaleness.ts';
export { read_run_state, type RunState } from './readRunState.ts';
// the pure v2 services the work command wires: the setup blocking heuristic (AC-005), the
// run-file record + lock (AC-006/008), and the store run-file name (AC-002). The runner
// adapters (AC-009) live in the Workspace barrel — they name runner CLIs, which Core must not.
export { spec_requires_runtime } from '../services/specRuntimeNeeds.ts';
export {
    build_run_content,
    reclaim_run_content,
    finish_run_content,
    abort_run_content,
    is_heartbeat_fresh,
    HEARTBEAT_FRESH_MS,
} from '../services/runArtifact.ts';
export { run_filename } from '../services/storeLayout.ts';

// evidence + the strict gate (SPEC-suspec-v2 AC-010..015): capture, lint, gate, digest, triage.
// The impure spawn/git/gh edges come in injected from Workspace; the digest renderers are pure
// services surfaced here (the run-file stamp precedent above).
export { add_evidence, type AddEvidenceInput, type AddEvidenceReport, type EvidenceCapture } from './addEvidence.ts';
export { list_evidence_records } from './listEvidenceRecords.ts';
export { verify_evidence_capture } from './verifyEvidenceCapture.ts';
export { gate_evidence, type GateEvidenceInput, type GateReport, type GateRequirement } from './gateEvidence.ts';
export {
    lint_run_artifacts,
    type LintRunArtifactsInput,
    type LintRunArtifactsReport,
    type StoreLintArtifact,
    type StoreLintDiagnostic,
} from './lintRunArtifacts.ts';
export { list_open_findings, type OpenFinding } from './listOpenFindings.ts';
export { stamp_finding_expiry, type StampFindingExpiryInput, FINDING_EXPIRY_DAYS } from './stampFindingExpiry.ts';
export {
    promote_finding,
    type PromoteFindingInput,
    type PromoteFindingReport,
    type IssueCreator,
} from './promoteFinding.ts';
export { done_run_content } from '../services/runArtifact.ts';
export {
    render_digest,
    digest_markers,
    build_digest_comment_body,
    type Digest,
    type DigestRow,
} from '../services/doneDigest.ts';

// prepare engine — init + new, no agent (AC-012/013/016); pull + promote, no board (W5 AC-001/002)
export { init_workspace, type ConflictPolicy } from './initWorkspace.ts';
export { cut_packet } from './cutPacket.ts';
export { scaffold_spec } from './scaffoldSpec.ts';
export { scaffold_change_plan } from './scaffoldChangePlan.ts';
export { pull_intake, type PullIntakeInput, type PullIntakeReport, type GhFetcher } from './pullIntake.ts';

// promotion + resumability + structural anti-rot (SPEC-suspec-v2 AC-016..020): the promote face's
// finding lookup, the fix scaffold, and the store-maintenance sweep/list/gc/purge engines. The gh
// edges stay injected (promote_finding's IssueCreator, store_doctor's PrStateProbe).
export { find_store_finding, type StoreFinding } from './findStoreFinding.ts';
export { scaffold_fix_spec, type ScaffoldFixSpecInput, type ScaffoldFixSpecReport } from './scaffoldFixSpec.ts';
export {
    store_doctor,
    type StoreDoctorInput,
    type StoreDoctorReport,
    type DoctorRow,
    type PrStateProbe,
} from './storeDoctor.ts';
export { store_decay_summary, decay_line, type StoreDecaySummary } from './storeDecaySummary.ts';
export { store_decay_note } from './storeDecayNote.ts';
export { list_active_specs, type ActiveSpec } from './listActiveSpecs.ts';
export {
    read_store_settings,
    DEFAULT_WIP_CAP,
    DEFAULT_RETENTION_DAYS,
    type StoreSettings,
} from './readStoreSettings.ts';
export { list_store_artifacts, type StoreListing, type StoreArtifactAge } from './listStoreArtifacts.ts';
export { gc_store, type GcStoreInput, type GcStoreReport } from './gcStore.ts';
export { purge_store } from './purgeStore.ts';

// the middle tier + thin launchers (SPEC-suspec-v2 AC-021..023): check-my-work's gate face
// (declared verify commands + the saved check run), the shared risk-path nudge, the spec-less
// runner resolution, the store-spec scaffold, the `next` ranking, and the two dispatch prompts
// (pure services, surfaced here like generate_prompt).
export { read_verify_commands } from './readVerifyCommands.ts';
export { risk_path_nudge } from './riskPathNudge.ts';
export { resolve_runner_from_config } from './resolveRunnerFromConfig.ts';
export { scaffold_store_spec, type ScaffoldStoreSpecInput, type ScaffoldStoreSpecReport } from './scaffoldStoreSpec.ts';
export { next_action, type NextItem, type NextActionInput } from './nextAction.ts';
export { build_check_run_content } from '../services/runArtifact.ts';
export { generate_review_prompt, type GenerateReviewPromptInput } from '../services/reviewPrompt.ts';
export { generate_spec_author_prompt, type GenerateSpecAuthorPromptInput } from '../services/specAuthorPrompt.ts';
