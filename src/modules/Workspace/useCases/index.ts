// Workspace module barrel — the git worktree/path operations the launch + reconcile engines wrap.
export {
    resolve_repo_root,
    current_branch,
    commits_ahead_of_remote,
    repo_has_commits,
    worktree_list,
    find_worktree_for_branch,
    worktree_create,
    branch_merged_into,
    branch_merged,
    branch_exists,
    default_branch,
    worktree_remove,
    worktree_prune,
    worktree_changed_files,
    worktree_changed_stats,
    is_worktree_dirty,
    paths_changed_since,
    path_is_tracked,
    head_sha,
    worktree_diff_digest,
} from './git.ts';
export { write_new_file, type FileExistsError } from './files.ts';
// emit engine — `suspec agents emit --codex`: projects agent defs to Codex TOML (ADR-0098). A runner
// adapter (like `launch`), so it names a runner — which is why it is a Workspace leaf, not Core.
export { emit_agents, type EmitAgentsInput, type EmitAgentsReport } from './emitAgents.ts';
export { fetch_gh_issue, type GhIssue, type GhFetchError } from './gh.ts';
// evidence + the gate (SPEC-suspec-v2 AC-010..015): the capture spawn, the PR-comment gh edges,
// and the issue-create gh edge — all injected into (or wired beside) the Core engines.
export { capture_command, type CapturedCommand } from './captureCommand.ts';
export { find_open_pr, type OpenPrProbe } from './ghOpenPr.ts';
export { upsert_pr_comment, type UpsertPrCommentInput, type UpsertPrCommentReport } from './ghPrComment.ts';
export { create_gh_issue, type CreatedIssue } from './ghCreateIssue.ts';
// store doctor (SPEC-suspec-v2 AC-018): the PR-state probe the reconcile sweep injects
export { probe_pr_state, type PrStateProbeResult } from './ghPrState.ts';
export { launch_adapter, write_run_record, write_prompt_scratch, type RunRecord, type LaunchError } from './launch.ts';
// setup executor — `suspec work`: run project-declared setup in the fresh worktree (advisory, no gate)
export { run_setup, type SetupResult } from './runSetup.ts';
// launch loop v2 (SPEC-suspec-v2 AC-005/009): the rendered-argv runner spawn + the setup_copy copier
export { launch_runner, type RunnerLaunchError } from './launchRunner.ts';
export { copy_setup_files, type SetupCopyResult } from './copySetupFiles.ts';
// runner adapters (AC-009) — a Workspace leaf because it names runner CLIs (like emit_agents);
// Core resolves runners through this barrel, keeping agent names out of Core (boundary.spec.ts)
export {
    parse_runner_config,
    resolve_runner,
    render_runner_command,
    runner_attach_hint,
    DEFAULT_RUNNER_NAME,
    type Runner,
    type RunnerConfig,
} from './runnerAdapters.ts';
