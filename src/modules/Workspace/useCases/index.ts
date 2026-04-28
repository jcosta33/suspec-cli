export {
    get_repo_root,
    get_repo_name,
    worktree_list,
    branch_exists,
    find_worktree_for_branch,
    worktree_create,
    worktree_remove,
    worktree_prune,
    is_worktree_dirty,
    get_status_summary,
    is_branch_merged_into,
    delete_branch,
    list_branches_by_prefix,
    worktree_sync,
} from './git.ts';

export { resolve_within } from './resolveWithin.ts';
