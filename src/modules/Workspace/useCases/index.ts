// Workspace module barrel — the git worktree/path operations the launch + reconcile engines wrap.
export {
    resolve_repo_root,
    current_branch,
    repo_has_commits,
    worktree_list,
    find_worktree_for_branch,
    worktree_create,
    worktree_remove,
    worktree_prune,
    is_worktree_dirty,
} from './git.ts';
