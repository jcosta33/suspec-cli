import {
    intro,
    outro,
    log,
    spinner,
    confirm,
    isCancel,
    cancel,
} from '@clack/prompts';
import { spawnSync } from 'child_process';
import { existsSync, lstatSync, realpathSync } from 'fs';
import os from 'os';
import { basename, dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import color from 'picocolors';
import { print_help } from './modules/Commands/useCases/help.ts';
import { run_dashboard } from './modules/Commands/useCases/dashboard.ts';
import { get_adapter } from './modules/Adapters/useCases/index.ts';
import { run_with_context } from './modules/Terminal/useCases/index.ts';
import { persist_event, record_session } from './modules/AgentState/useCases/index.ts';
import { swarmBus } from './infra/events/swarmBus.ts';

// ── Event-bus bootstrap ─────────────────────────────────────────────────────
swarmBus.on('agent.session.recorded', (event) => {
    const id = `${event.slug}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    record_session(event.repoRoot, {
        id,
        slug: event.slug,
        agent: event.agent,
        model: null,
        started_at: event.startedAt,
        finished_at: event.finishedAt,
        exit_code: event.exitCode,
    });
});

swarmBus.onAny((eventName, payload) => {
    if (
        payload &&
        typeof payload === 'object' &&
        'repoRoot' in payload &&
        typeof (payload as { repoRoot: unknown }).repoRoot === 'string'
    ) {
        const repoRoot = (payload as { repoRoot: string }).repoRoot;
        persist_event(repoRoot, eventName, payload);
    }
});

const AGENT_INSTALL_INFO: Record<string, { install: string; desc: string } | undefined> = {
    aider: { install: 'pip install aider-chat', desc: 'Interactive command-line pair-programming AI.' },
    cline: { install: 'npm install -g @cline/cli', desc: 'Autonomous engineering CLI agent.' },
    'swe-agent': { install: 'pip install swe-agent', desc: 'Headless agent for SWE tasks.' },
    claude: { install: 'npm install -g @anthropic-ai/claude-cli', desc: 'Anthropic Claude CLI agent.' },
    codex: { install: 'npm install -g @openai/codex', desc: 'OpenAI Codex CLI agent.' },
    droid: { install: 'npm install -g @factory/droid-cli', desc: 'Factory Droid CLI agent.' },
    gemini: { install: 'npm install -g @google/gemini-cli', desc: 'Google Gemini CLI agent.' },
    kimi: { install: 'npm install -g @moonshot/kimi-cli', desc: 'Moonshot Kimi CLI agent.' },
    opencode: { install: 'npm install -g opencode', desc: 'OpenCode CLI agent.' },
};

export * from './modules/Commands/services/registry.ts';
import { register_capability } from './modules/Commands/services/registry.ts';
import { adapter_capabilities } from './modules/Adapters/useCases/index.ts';

for (const cap of adapter_capabilities) {
    register_capability(cap);
}

const COMMAND_CATALOG = [
    { name: 'new', description: 'Create a new isolated sandbox task' },
    { name: 'open', description: 'Reopen an existing sandbox' },
    { name: 'list', description: 'List active sandboxes' },
    { name: 'show', description: 'Show detailed metadata for a sandbox' },
    { name: 'status', description: 'Runtime status: state, telemetry, dirtiness' },
    { name: 'remove', description: 'Forcefully remove a sandbox' },
    { name: 'prune', description: 'Clean up merged or orphaned sandboxes' },
    { name: 'validate', description: 'Run configured linters and typechecks' },
    { name: 'test', description: 'Run the test runner' },
    { name: 'test-radius', description: 'Run only the specs impacted by a file' },
    { name: 'init', description: 'Setup Swarm in the current repository' },
    { name: 'lock', description: 'Advisory file locking for parallel agents' },
    { name: 'merge', description: 'Merge a branch with conflict detection' },
    { name: 'capabilities', description: 'List registered capabilities' },
    { name: 'help', description: 'Show command reference' },
    { name: 'dashboard', description: 'Launch interactive TUI dashboard' },
    { name: 'decompose', description: 'Decompose a task graph into a DAG' },
    { name: 'logs', description: 'Query the telemetry database' },
    { name: 'arch', description: 'Lint cross-module boundary invariants' },
    { name: 'audit-sec', description: 'Scan for dangerous patterns and secrets' },
    { name: 'ast-rename', description: 'Structural rename of a symbol' },
    { name: 'chaos', description: 'Toggle latency/failure injection' },
    { name: 'chat', description: 'Append-only IPC log between agents' },
    { name: 'complexity', description: 'Cyclomatic complexity heuristic' },
    { name: 'compress', description: 'Skeletonize a TS file' },
    { name: 'context', description: 'Generate semantic export map for RAG' },
    { name: 'daemon', description: 'Background watcher running test-radius on save' },
    { name: 'dead-code', description: 'Find exported symbols never imported' },
    { name: 'deps', description: 'Find outdated packages and queue upgrade tasks' },
    { name: 'docs', description: 'Extract JSDoc blocks' },
    { name: 'doctor', description: 'Deep environment diagnostics' },
    { name: 'epic', description: 'Decompose a markdown checklist into child tasks' },
    { name: 'find', description: 'Semantic-ish symbol search' },
    { name: 'focus', description: 'Open a sandbox in your editor' },
    { name: 'format', description: 'Run Prettier on a single file' },
    { name: 'fuzz', description: 'Generate fuzz tests for a function' },
    { name: 'graph', description: 'Map import/export dependency graph' },
    { name: 'heal', description: 'Self-healing hotfix when typecheck fails' },
    { name: 'health', description: 'Quick pre-flight environment check' },
    { name: 'knowledge', description: 'Search past tasks, audits, specs, PRs' },
    { name: 'memory', description: 'Cross-agent markdown memory bank' },
    { name: 'message', description: 'Queue a structured message into a mailbox' },
    { name: 'migrate', description: 'Translator + Verifier agent pair' },
    { name: 'mock', description: 'Generate a TS mock factory for an interface' },
    { name: 'path', description: 'Print absolute path of a sandbox' },
    { name: 'pick', description: 'Fuzzy-finder over sandboxes' },
    { name: 'pr', description: 'Auto-commit and optionally open a PR' },
    { name: 'profile', description: 'Profile a Node process and assign optimizer' },
    { name: 'refactor', description: 'Break a refactor into chunks' },
    { name: 'references', description: 'Fast git-grep symbol usages' },
    { name: 'release', description: 'Bump semver and draft release notes' },
    { name: 'repro', description: 'Verify TDD: tests modified before source' },
    { name: 'review', description: 'Spawn an adversarial peer-review agent' },
    { name: 'screenshot', description: 'Capture a Playwright screenshot' },
    { name: 'task', description: 'Append human feedback to a task file' },
    { name: 'telemetry', description: 'Aggregated session metrics dashboard' },
    { name: 'triage', description: 'Convert a raw bug report into a spec' },
    { name: 'visual', description: 'Screenshot-based visual regression' },
] as const;

for (const cmd of COMMAND_CATALOG) {
    register_capability({
        name: cmd.name,
        version: '1.0.0',
        type: 'command',
        description: cmd.description,
        entry_point: `./useCases/${cmd.name}.ts`,
    });
}

function get_git_info() {
    try {
        const repo = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim();
        const repoName = repo ? basename(repo) : 'Standalone';
        const branch =
            spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout.trim() || 'unknown';
        const dirty = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).stdout.trim().length > 0;
        return { repoName, branch, dirty, worktree: process.cwd() };
    } catch {
        return { repoName: basename(process.cwd()), branch: 'N/A', dirty: false, worktree: process.cwd() };
    }
}

function extract_model_arg(args: string[]) {
    const modelIdx = args.findIndex((a) => a === '--model' || a === '-m');
    if (modelIdx !== -1 && args.length > modelIdx + 1) {
        return args[modelIdx + 1];
    }
    return 'default';
}

function print_agent_banner(agentName: string, args: string[]) {
    const info = get_git_info();
    const model = extract_model_arg(args);

    const colorsList = ['cyan', 'magenta', 'yellow', 'blue', 'green'] as const;
    const hash = info.worktree.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const themeColor = colorsList[hash % colorsList.length];
    const c = (color as unknown as Record<string, (text: string) => string>)[themeColor];

    process.stdout.write(`\x1b]0;[Swarm] ${info.repoName} | ${info.branch}\x07`);

    console.clear();
    console.log(c(`╔${'━'.repeat(78)}╗`));
    console.log(
        `${c('┃')} ${color.bold(color.white(`🤖 SWARM EVOLUTION : ${agentName.toUpperCase()}`)).padEnd(87)}${c('┃')}`
    );
    console.log(c(`┣${'━'.repeat(78)}┫`));

    const labels = [
        { label: 'Repo', val: color.white(info.repoName) },
        {
            label: 'Branch',
            val: color.white(info.branch) + (info.dirty ? color.red(' (dirty)') : color.green(' (clean)')),
        },
        { label: 'Worktree', val: color.dim(info.worktree.replace(os.homedir(), '~')) },
        { label: 'Model', val: color.magenta(model) },
        { label: 'Status', val: color.green('● ACTIVE') },
    ];

    for (const row of labels) {
        const text = `  ${c('■')} ${color.dim(row.label.padEnd(10))} ${row.val}`;
        console.log(`${c('┃')}${text.padEnd(99)}${c('┃')}`);
    }

    console.log(c(`╚${'━'.repeat(78)}╝`));
    console.log('');
}

function levenshtein(a: string, b: string): number {
    const matrix = Array.from({ length: a.length + 1 }, () => Array.from({ length: b.length + 1 }, () => 0));
    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
        }
    }
    return matrix[a.length][b.length];
}

async function handle_unknown_command(cmd: string, args: string[]): Promise<number> {
    const adapter = get_adapter(cmd);
    const installInfo = AGENT_INSTALL_INFO[cmd];
    let executable: string | null = null;
    if (adapter) {
        executable = adapter.command;
    } else if (installInfo) {
        executable = cmd;
    }

    if (executable) {
        const isInstalled =
            spawnSync('which', [executable]).status === 0 || spawnSync('where', [executable]).status === 0;

        if (!isInstalled && installInfo) {
            intro(color.bgCyan(color.black(' Swarm CLI ')));
            note(
                color.yellow(`Command '${cmd}' is not a built-in tool, but it matches a known agent CLI.`),
                'Unrecognized Command'
            );
            log.warn(`The agent '${cmd}' (${installInfo.desc}) is not installed on your system.`);

            const shouldInstall = await confirm({
                message: `Would you like Swarm CLI to install it for you using \`${installInfo.install}\`?`,
                initialValue: true,
            });

            if (isCancel(shouldInstall)) {
                cancel('Setup cancelled.');
                return 0;
            }

            if (shouldInstall) {
                const s = spinner();
                s.start(`Installing ${cmd}...`);
                const installParts = installInfo.install.split(' ');
                const installRes = spawnSync(installParts[0], installParts.slice(1), { shell: false, stdio: 'pipe' });

                if (installRes.status !== 0) {
                    s.stop(`Failed to install ${cmd}.`);
                    log.error(installRes.stderr.toString());
                    log.message(`Try installing manually: ${color.cyan(installInfo.install)}`);
                    return 1;
                }
                s.stop(color.green(`Successfully installed ${cmd}!`));
            } else {
                log.message(`You can install it manually via: ${color.cyan(installInfo.install)}`);
                return 0;
            }
            outro();
        } else if (!isInstalled) {
            intro(color.bgCyan(color.black(' Swarm CLI ')));
            log.error(color.red(`Agent '${cmd}' is not installed on your system.`));
            log.message(`Install the '${cmd}' CLI manually, then try again.`);
            outro();
            return 1;
        }

        print_agent_banner(cmd, args);
        spawnSync(executable, args, { stdio: 'inherit', shell: false });
        console.log('');
        outro(color.green(`Agent '${cmd}' execution completed.`));
        return 0;
    }

    // Try fuzzy matching to suggest a correct command
    const validCommands = COMMAND_CATALOG.map(c => c.name);
    const validAgents = Object.keys(AGENT_INSTALL_INFO);
    const allValid = [...validCommands, ...validAgents];
    
    let closest = '';
    let minDistance = Infinity;
    
    for (const valid of allValid) {
        const d = levenshtein(cmd, valid);
        if (d < minDistance) {
            minDistance = d;
            closest = valid;
        }
    }
    
    if (minDistance > 0 && minDistance <= 2) {
        intro(color.bgCyan(color.black(' Swarm CLI ')));
        log.warn(`Unknown command: ${color.red(cmd)}`);
        
        const isBuiltin = (validCommands as string[]).includes(closest);
        const suggestionType = isBuiltin ? 'command' : 'agent';
        
        const shouldRun = await confirm({
            message: `Did you mean the ${suggestionType} ${color.cyan(closest)}?`,
            initialValue: true
        });
        
        if (isCancel(shouldRun)) {
            cancel('Aborted.');
            return 1;
        }
        
        if (shouldRun) {
            outro();
            return execute_command(closest, args);
        }
    } else {
        intro(color.bgCyan(color.black(' Swarm CLI ')));
    }

    log.error(color.red(`Unknown command: ${cmd}`));
    log.message(`Use ${color.cyan('swarm --help')} to see available commands.`);
    log.info(
        color.dim(`If '${cmd}' is a project-specific script, add it to your swarm.config.json under "commands".`)
    );
    outro();
    return 1;
}

function note(message: string, title: string) {
    log.message(`${color.cyan('│')} ${color.bold(title)}\n${color.cyan('│')} ${message}`);
}

async function execute_command(cmd: string, args: string[]): Promise<number> {
    const useCasesDir = resolve(dirname(fileURLToPath(import.meta.url)), 'modules/Commands/useCases');
    const candidatePath = join(useCasesDir, `${cmd}.ts`);

    if (existsSync(candidatePath)) {
        try {
            const stat = lstatSync(candidatePath);
            if (stat.isSymbolicLink()) {
                console.error(color.red(`Refusing to execute symlinked command: ${cmd}`));
                return 1;
            }
            const realCandidate = realpathSync(candidatePath);
            const realRoot = realpathSync(useCasesDir);
            if (!realCandidate.startsWith(`${realRoot}/`) && realCandidate !== realRoot) {
                console.error(color.red(`Command resolved outside useCases dir: ${cmd}`));
                return 1;
            }
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            console.error(color.red(`Failed to validate command path: ${message}`));
            return 1;
        }

        const res = spawnSync(
            process.execPath,
            ['--experimental-strip-types', candidatePath, ...args],
            {
                stdio: 'inherit',
                cwd: process.cwd(),
            }
        );
        
        if (res.signal) {
            process.kill(process.pid, res.signal);
            return 1;
        }
        return res.status ?? 1;
    }

    return handle_unknown_command(cmd, args);
}

async function main(): Promise<number> {
    let argv = process.argv.slice(2);
    
    if (argv.includes('--quiet') || argv.includes('-q')) {
        process.env.SWARM_LOG_LEVEL = 'quiet';
        argv = argv.filter(a => a !== '--quiet' && a !== '-q');
    }
    
    if (argv.includes('--verbose') || argv.includes('-v')) {
        process.env.SWARM_LOG_LEVEL = 'verbose';
        process.env.SWARM_DEBUG = '1';
        argv = argv.filter(a => a !== '--verbose' && a !== '-v');
    }

    if (argv[0] === '--help' || argv[0] === '-h') {
        print_help();
        return 0;
    }

    if (argv.length === 0) {
        return run_dashboard();
    }

    const cmd = argv[0];

    if (!/^[a-z0-9][a-z0-9-]*$/.test(cmd)) {
        return handle_unknown_command(cmd, argv.slice(1));
    }

    return execute_command(cmd, argv.slice(1));
}

function generate_trace_id(): string {
    const bytes = new Uint8Array(8);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const traceId = generate_trace_id();

run_with_context({ trace_id: traceId }, () => main())
    .then((code: number | void) => {
        if (typeof code === 'number') process.exitCode = code;
    })
    .catch((err: unknown) => {
        const message = err instanceof Error ? err.stack ?? err.message : String(err);
        console.error(color.red(`Fatal: ${message}`));
        process.exitCode = 1;
    });
