import {
    intro,
    outro,
    log,
    spinner,
    confirm,
    isCancel,
    cancel,
    text,
    select,
    password,
    group,
} from '@clack/prompts';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import color from 'picocolors';

export async function cmd_init(repoRoot: string, _argv: string[]): Promise<number> {
    intro(color.bgCyan(color.black(' Swarm CLI Setup ')));

    const agentsDir = join(repoRoot, '.agents');

    if (existsSync(agentsDir)) {
        log.warn('.agents directory already exists in this repository.');

        const shouldReinit = await confirm({
            message: 'Do you want to re-initialize and overwrite configurations?',
            initialValue: false,
        });

        if (isCancel(shouldReinit) || !shouldReinit) {
            cancel('Setup aborted.');
            return 0;
        }
    }

    const envPath = join(repoRoot, '.env');
    let hasAnthropic = false;
    let hasOpenAI = false;
    
    if (existsSync(envPath)) {
        const envContent = readFileSync(envPath, 'utf8');
        hasAnthropic = envContent.includes('ANTHROPIC_API_KEY');
        hasOpenAI = envContent.includes('OPENAI_API_KEY');
    }

    let defaultBranch = 'main';
    try {
        const branchRes = spawnSync('git', ['branch', '--show-current'], { cwd: repoRoot, encoding: 'utf8' });
        if (branchRes.stdout) defaultBranch = branchRes.stdout.trim() || 'main';
    } catch (_e) {
        void 0;
    }

    let defaultTestCmd = 'npm test';
    let defaultLintCmd = 'tsc --noEmit';
    let pm = 'npm';
    if (existsSync(join(repoRoot, 'pnpm-lock.yaml'))) {
        pm = 'pnpm';
    } else if (existsSync(join(repoRoot, 'yarn.lock'))) {
        pm = 'yarn';
    }
    
    try {
        if (existsSync(join(repoRoot, 'package.json'))) {
            const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
            if (pkg.scripts?.test) defaultTestCmd = `${pm} test`;
            if (pkg.scripts?.typecheck) defaultLintCmd = `${pm} run typecheck`;
            else if (pkg.scripts?.lint) defaultLintCmd = `${pm} run lint`;
        }
    } catch (_e) {
        void 0;
    }

    const results = await group(
        {
            anthropicKey: () => {
                if (hasAnthropic) return Promise.resolve(undefined);
                return password({
                    message: 'Anthropic API Key (leave empty to skip)',
                });
            },
            openAIKey: () => {
                if (hasOpenAI) return Promise.resolve(undefined);
                return password({
                    message: 'OpenAI API Key (leave empty to skip)',
                });
            },
            defaultAgent: () => select({
                message: 'Which CLI agent do you primarily use?',
                options: [
                    { value: 'claude', label: 'Claude Code (@anthropic-ai/claude-cli)' },
                    { value: 'cline', label: 'Cline (@cline/cli)' },
                    { value: 'aider', label: 'Aider (aider-chat)' },
                    { value: 'gemini', label: 'Gemini CLI (@google/gemini-cli)' },
                ],
                initialValue: 'claude',
            }),
            editor: () => select({
                message: 'Preferred editor for opening tasks',
                options: [
                    { value: 'cursor', label: 'Cursor' },
                    { value: 'vscode', label: 'VS Code' },
                    { value: 'vim', label: 'Vim / Neovim' },
                ],
                initialValue: 'cursor',
            }),
            defaultBaseBranch: () => text({
                message: 'Default base branch for sandboxes',
                placeholder: defaultBranch,
                defaultValue: defaultBranch,
            }),
            defaultTest: () => text({
                message: 'What is your test command?',
                placeholder: defaultTestCmd,
                defaultValue: defaultTestCmd,
            }),
            defaultLint: () => text({
                message: 'What is your lint or typecheck command?',
                placeholder: defaultLintCmd,
                defaultValue: defaultLintCmd,
            }),
        },
        {
            onCancel: () => {
                cancel('Setup aborted.');
                process.exit(0);
            },
        }
    );

    const s = spinner();
    s.start('Scaffolding Swarm CLI isolated environment...');

    if (!existsSync(agentsDir)) mkdirSync(agentsDir, { recursive: true });

    ['tasks', 'specs', 'audits', 'logs', 'releases'].forEach((d) => {
        const dirPath = join(agentsDir, d);
        if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true });
    });

    const scaffoldDir = join(
        new URL('.', import.meta.url).pathname,
        '../../scaffold'
    );
    if (existsSync(scaffoldDir)) {
        s.start('Copying scaffolded templates and skills...');
        cpSync(scaffoldDir, repoRoot, { recursive: true, force: false, verbatimSymlinks: true });
        s.stop('Installed the Swarm workspace (existing files preserved).');
    }

    s.stop('Directory structure created.');

    s.start('Enabling git rerere for automatic conflict resolution...');
    const rerereRes = spawnSync('git', ['config', 'rerere.enabled'], { cwd: repoRoot, encoding: 'utf8' });
    if (rerereRes.stdout?.trim() !== 'true') {
        const enableRes = spawnSync('git', ['config', 'rerere.enabled', 'true'], { cwd: repoRoot, encoding: 'utf8' });
        if (enableRes.error || enableRes.status !== 0) {
            s.stop('Failed to enable git rerere.');
            log.warn('Could not automatically enable git rerere. You may need to enable it manually: git config rerere.enabled true');
        } else {
            s.stop('Git rerere enabled.');
        }
    } else {
        s.stop('Git rerere already enabled.');
    }

    s.start('Writing configuration...');

    // Write keys to .env
    let envContent = '';
    if (existsSync(envPath)) {
        envContent = readFileSync(envPath, 'utf8');
    }
    if (results.anthropicKey) envContent += `\nANTHROPIC_API_KEY=${results.anthropicKey}`;
    if (results.openAIKey) envContent += `\nOPENAI_API_KEY=${results.openAIKey}`;
    
    if (results.anthropicKey || results.openAIKey) {
        writeFileSync(envPath, `${envContent.trim()  }\n`, 'utf8');
        log.success('API keys saved to .env file.');
    }

    const configPath = join(repoRoot, 'swarm.config.json');
    writeFileSync(
        configPath,
        JSON.stringify(
            {
                defaultAgent: results.defaultAgent,
                defaultBaseBranch: results.defaultBaseBranch,
                defaultEditor: results.editor,
                commands: {
                    install: 'npm install',
                    typecheck: results.defaultLint,
                    test: results.defaultTest,
                    validateDeps: 'npm ls',
                },
                agentRules: ['Always adhere to project linting rules.', 'Empirical proof is required before PR.'],
            },
            null,
            2
        ),
        'utf8'
    );

    s.stop(color.green('swarm.config.json created.'));

    log.message(
        `You can now use Swarm CLI!\n\n` +
            `1. Run ${color.cyan('swarm new <slug>')} to create a task.\n` +
            `2. Run ${color.cyan(`swarm ${results.defaultAgent || 'aider'}`)} to invoke your primary agent.\n` +
            `3. Check the ${color.green('.agents/tasks')} folder for templates.`
    );

    outro(color.cyan('Happy orchestrating!'));
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    void cmd_init(process.cwd(), process.argv.slice(2)).then((code) => {
        process.exitCode = code;
    });
}
