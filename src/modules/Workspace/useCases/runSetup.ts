// Run the project-declared setup commands in a fresh worktree before launch (SPEC-suspec-cli-work
// AC-003). A Workspace leaf beside launch.ts/git.ts — process edges live here, not in Core. Each command
// is a bare `binary arg arg` form (like the adapter command, launch.ts): split on whitespace and spawned
// with no shell, so there is no shell-injection surface and setup stays consistent with how the launcher
// spawns. stdio is inherited so the human sees setup progress.
//
// ADVISORY: a non-zero (or unlaunchable) command is recorded and returned, never thrown — `suspec work`
// warns and launches anyway. Setup is an accelerator, not a gate; the by-hand path never depended on it.

import { spawnSync } from 'child_process';

export type SetupResult = Readonly<{
    command: string;
    exit: number; // the command's exit status; 127 when the program could not be launched (ENOENT)
}>;

export function run_setup(commands: readonly string[], worktreePath: string): readonly SetupResult[] {
    const results: SetupResult[] = [];
    for (const command of commands) {
        const [bin, ...args] = command.trim().split(/\s+/);
        if (bin.length === 0) {
            continue;
        }
        const result = spawnSync(bin, args, { cwd: worktreePath, stdio: 'inherit' });
        results.push({ command, exit: result.error ? 127 : (result.status ?? 1) });
    }
    return results;
}
