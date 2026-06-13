#!/usr/bin/env node

// `swarm init [dir]` — the prepare engine's init surface (AC-012/016, D-003). Resolves the kit
// source (clone jcosta33/swarm-starter-kit by default; `--from <path|url>` overrides), then copies
// it conflict-safely (skip by default; `--force` / `--on-conflict skip|overwrite|backup`).
// `--workspace`/`--footprint` force the layout, else it is auto-detected (empty dir → workspace,
// existing repo → footprint). `-i` opens the interactive wizard.

import { mkdtempSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

import { ok, err, isErr, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { project, emit_error, init_workspace } from '../../Core/useCases/index.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';
import { format_init_report } from '../../Tui/services/render.ts';

const DEFAULT_KIT = 'https://github.com/jcosta33/swarm-starter-kit';

type KitSource = Readonly<{ sourceDir: string; cleanup: () => void }>;

/* v8 ignore start -- network clone shell; tests resolve the kit via a local --from */
function clone_kit(url: string): Result<KitSource, AppError> {
    const temp = mkdtempSync(join(tmpdir(), 'swarm-kit-'));
    const result = spawnSync('git', ['clone', '--depth', '1', url, temp], { encoding: 'utf8' });
    if (result.status !== 0) {
        rmSync(temp, { recursive: true, force: true });
        return err(createAppError('CloneFailed', `could not clone the kit from ${url}`, { url }));
    }
    return ok({ sourceDir: temp, cleanup: () => rmSync(temp, { recursive: true, force: true }) });
}
/* v8 ignore stop */

function resolve_kit_source(from: string | undefined): Result<KitSource, AppError> {
    if (from !== undefined && existsSync(from)) {
        return ok({ sourceDir: from, cleanup: () => undefined });
    }
    /* v8 ignore next -- the clone path is the network shell; tests resolve the kit via a local --from */
    return clone_kit(from ?? DEFAULT_KIT);
}

function parse_policy(flags: Map<string, string | boolean>): 'skip' | 'overwrite' | 'backup' {
    if (flags.get('force') === true) {
        return 'overwrite';
    }
    const onConflict = flags.get('on-conflict');
    if (onConflict === 'overwrite' || onConflict === 'backup') {
        return onConflict;
    }
    return 'skip';
}

function resolve_mode(flags: Map<string, string | boolean>, targetDir: string): 'workspace' | 'footprint' {
    if (flags.get('footprint') === true) {
        return 'footprint';
    }
    if (flags.get('workspace') === true) {
        return 'workspace';
    }
    if (!existsSync(targetDir)) {
        return 'workspace';
    }
    return readdirSync(targetDir).filter((entry) => entry !== '.git').length === 0 ? 'workspace' : 'footprint';
}

export async function run(argv: string[], cwd: string = process.cwd()): Promise<number> {
    const { positional, flags } = parse_flags(argv, {
        booleans: ['--json', '-i', '--interactive', '--force', '--workspace', '--footprint'],
        strings: ['--from', '--on-conflict'],
    });
    const json = flags.get('json') === true;
    const interactive = flags.get('i') === true || flags.get('interactive') === true;
    const fromFlag = flags.get('from');
    const from = typeof fromFlag === 'string' ? fromFlag : undefined;
    const targetDir = positional[0] !== undefined ? resolve(cwd, positional[0]) : cwd;
    const policy = parse_policy(flags);
    const mode = resolve_mode(flags, targetDir);

    const sourceResult = resolve_kit_source(from);
    if (isErr(sourceResult)) {
        return emit_error(sourceResult.error, json);
    }
    const { sourceDir, cleanup } = sourceResult.value;

    try {
        /* v8 ignore start -- interactive dispatch is the thin shell; the flow logic is tested via the mock Prompter */
        if (interactive && process.stdout.isTTY === true && !json) {
            const [flowModule, prompterModule] = await Promise.all([
                import('../../Tui/useCases/initFlow.ts'),
                import('../../Tui/useCases/prompter.ts'),
            ]);
            return flowModule.run_init_flow(prompterModule.create_clack_prompter(), { sourceDir, targetDir, mode });
        }
        /* v8 ignore stop */
        return project({ result: init_workspace({ sourceDir, targetDir, policy, mode }), json, render: format_init_report });
    } finally {
        cleanup();
    }
}

/* v8 ignore start -- the script entry runs when spawned by the dispatcher, not as a unit */
if (import.meta.url === `file://${process.argv[1]}`) {
    void run(process.argv.slice(2)).then((code) => {
        process.exitCode = code;
    });
}
/* v8 ignore stop */
