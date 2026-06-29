// The interactive `init` flow (AC-015/016): show the plan (target + detected mode), confirm, choose
// the conflict policy, scaffold, then show the written/skipped/merged summary. The default policy
// (skip) never destroys user content, so showing the summary after a safe run is enough; overwrite
// and backup are explicit opt-ins. Pure over the injected Prompter + the prepare engine.

import { init_workspace, exit_code_for } from '../../Core/useCases/index.ts';
import { isErr } from '../../../infra/errors/result.ts';
import { type Prompter, is_cancelled } from './prompter.ts';
import { format_init_report } from '../services/render.ts';

export type InitFlowDeps = Readonly<{ sourceDir: string; targetDir: string; mode: 'workspace' | 'footprint' }>;

export async function run_init_flow(prompter: Prompter, deps: InitFlowDeps): Promise<number> {
    prompter.intro('suspec init');
    prompter.note(`Target: ${deps.targetDir}\nLayout: ${deps.mode}`, 'Plan');

    const proceed = await prompter.confirm({ message: `Scaffold the ${deps.mode} here?`, initialValue: true });
    if (is_cancelled(proceed) || !proceed) {
        prompter.outro('Cancelled.');
        return 1;
    }

    const choice = await prompter.select({
        message: 'If a file already exists…',
        options: [
            { value: 'skip', label: 'Keep mine (skip it)', hint: 'recommended — never overwrites' },
            { value: 'backup', label: 'Back mine up (.suspec-bak), write the kit version' },
            { value: 'overwrite', label: 'Overwrite with the kit version' },
        ],
    });
    if (is_cancelled(choice)) {
        prompter.outro('Cancelled.');
        return 1;
    }
    let policy: 'skip' | 'overwrite' | 'backup' = 'skip';
    if (choice === 'overwrite') {
        policy = 'overwrite';
    } else if (choice === 'backup') {
        policy = 'backup';
    }

    const spin = prompter.spinner();
    spin.start('Scaffolding the workspace…');
    const result = init_workspace({ sourceDir: deps.sourceDir, targetDir: deps.targetDir, policy, mode: deps.mode });
    spin.stop('Done.');
    if (isErr(result)) {
        prompter.error(result.error.message);
        prompter.outro('✗ could not scaffold');
        return 2;
    }

    prompter.note(format_init_report(result.value), 'Result');
    const skipped = result.value.skipped.length;
    prompter.outro(skipped > 0 ? `${String(skipped)} existing file(s) kept — review them` : '✓ workspace ready');
    return exit_code_for(result.value.level);
}
