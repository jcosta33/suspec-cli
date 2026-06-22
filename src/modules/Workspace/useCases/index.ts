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
    is_worktree_dirty,
} from './git.ts';
export { write_new_file, type FileExistsError } from './files.ts';
export { fetch_gh_issue, type GhIssue, type GhFetchError } from './gh.ts';
export { launch_adapter, write_run_record, type RunRecord, type LaunchError } from './launch.ts';
