// The interactive `worktree` flow (AC-015): choose an action, run the launch engine with prompts +
// a spinner. Pure orchestration over the injected Prompter + the Core engine + Workspace.git, so it
// is testable with a mock Prompter against a real throwaway git repo.

import { create_worktree, list_swarm_worktrees, remove_worktree, prune_worktrees } from '../../Core/useCases/index.ts';
import { resolve_repo_root, current_branch } from '../../Workspace/useCases/index.ts';
import { isErr } from '../../../infra/errors/result.ts';
import { type Prompter, is_cancelled } from './prompter.ts';
import { format_worktrees } from '../services/render.ts';

export type WorktreeFlowDeps = Readonly<{ cwd: string }>;

// Reverse derive_worktree_names: swarm/<spec>[/<task>] → its slug parts.
function parse_branch(branch: string): { specSlug: string; taskSlug?: string } {
    const rest = branch.replace(/^swarm\//, '');
    const slash = rest.indexOf('/');
    if (slash === -1) {
        return { specSlug: rest };
    }
    return { specSlug: rest.slice(0, slash), taskSlug: rest.slice(slash + 1) };
}

async function create(prompter: Prompter, repoRoot: string): Promise<number> {
    const slug = await prompter.text({ message: 'Spec slug', placeholder: 'checkout' });
    if (is_cancelled(slug)) {
        prompter.outro('Cancelled.');
        return 1;
    }
    const spin = prompter.spinner();
    spin.start('Creating worktree…');
    const result = create_worktree({ repoRoot, specSlug: slug, baseBranch: current_branch(repoRoot) ?? 'main' });
    spin.stop('Done.');
    /* v8 ignore start -- in-flow create uses the valid current branch as base; it does not err here (the command path tests the bad-base error) */
    if (isErr(result)) {
        prompter.error(result.error.message);
        prompter.outro('✗ could not create');
        return 2;
    }
    /* v8 ignore stop */
    prompter.success(`${result.value.reused ? 'Reusing' : 'Created'} ${result.value.branch}`);
    prompter.outro(result.value.worktreePath);
    return 0;
}

async function remove(prompter: Prompter, repoRoot: string): Promise<number> {
    const report = list_swarm_worktrees(repoRoot);
    if (report.worktrees.length === 0) {
        prompter.warn('No swarm worktrees to remove.');
        prompter.outro('Nothing to remove.');
        return 1;
    }
    const branch = await prompter.select({
        message: 'Which worktree?',
        options: report.worktrees.map((wt) => ({
            value: wt.branch,
            label: wt.branch,
            hint: wt.dirty ? 'dirty' : 'clean',
        })),
    });
    if (is_cancelled(branch)) {
        prompter.outro('Cancelled.');
        return 1;
    }
    const force = await prompter.confirm({ message: 'Force removal (discard changes if dirty)?', initialValue: false });
    if (is_cancelled(force)) {
        prompter.outro('Cancelled.');
        return 1;
    }
    const { specSlug, taskSlug } = parse_branch(branch);
    const spin = prompter.spinner();
    spin.start('Removing…');
    const result = remove_worktree({ repoRoot, specSlug, taskSlug, force });
    spin.stop('Done.');
    if (isErr(result)) {
        prompter.error(result.error.message);
        prompter.outro('✗ could not remove');
        return 2;
    }
    prompter.success(`Removed ${result.value.branch}`);
    prompter.outro('done');
    return 0;
}

export async function run_worktree_flow(prompter: Prompter, deps: WorktreeFlowDeps): Promise<number> {
    prompter.intro('swarm worktree');
    const rootResult = resolve_repo_root(deps.cwd);
    if (isErr(rootResult)) {
        prompter.error(rootResult.error.message);
        prompter.outro('Not a git repository.');
        return 2;
    }
    const repoRoot = rootResult.value;

    const action = await prompter.select({
        message: 'Worktree action',
        options: [
            { value: 'list', label: 'List swarm worktrees' },
            { value: 'create', label: 'Create a worktree for a spec' },
            { value: 'remove', label: 'Remove a worktree' },
            { value: 'prune', label: 'Prune stale worktrees' },
        ],
    });
    if (is_cancelled(action)) {
        prompter.outro('Cancelled.');
        return 1;
    }

    if (action === 'list') {
        prompter.note(format_worktrees(list_swarm_worktrees(repoRoot).worktrees), 'Worktrees');
        prompter.outro('done');
        return 0;
    }
    if (action === 'create') {
        return create(prompter, repoRoot);
    }
    if (action === 'remove') {
        return remove(prompter, repoRoot);
    }
    const spin = prompter.spinner();
    spin.start('Pruning…');
    const pruned = prune_worktrees(repoRoot);
    spin.stop('Done.');
    /* v8 ignore start -- prune over a valid repo does not err in practice */
    if (isErr(pruned)) {
        prompter.error(pruned.error.message);
        prompter.outro('✗ could not prune');
        return 2;
    }
    /* v8 ignore stop */
    prompter.success('Pruned stale worktrees.');
    prompter.outro('done');
    return 0;
}
