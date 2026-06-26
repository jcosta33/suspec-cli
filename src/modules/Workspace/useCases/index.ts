// Workspace module barrel — the git worktree/path operations the launch + reconcile engines wrap.
export {
    resolve_repo_root,
    current_branch,
    commits_ahead_of_remote,
    repo_has_commits,
    worktree_list,
    find_worktree_for_branch,
    worktree_create,
    worktree_remove,
    worktree_prune,
    worktree_changed_files,
    worktree_changed_stats,
    is_worktree_dirty,
    paths_changed_since,
    path_is_tracked,
    head_sha,
} from './git.ts';
export { write_new_file, type FileExistsError } from './files.ts';
// emit engine — `corpus agents emit --codex`: projects agent defs to Codex TOML (ADR-0098). A runner
// adapter (like `launch`), so it names a runner — which is why it is a Workspace leaf, not Core.
export { emit_agents, type EmitAgentsInput, type EmitAgentsReport } from './emitAgents.ts';
export { fetch_gh_issue, type GhIssue, type GhFetchError } from './gh.ts';
export { launch_adapter, write_run_record, type RunRecord, type LaunchError } from './launch.ts';
