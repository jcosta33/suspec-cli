#!/usr/bin/env node

// `swarm init [dir]` — the prepare engine's init surface (AC-012/016, D-003). Resolves the kit
// source (clone jcosta33/swarm-starter-kit by default; `--from <path|url>` overrides), then copies
// it conflict-safely (skip by default; `--force` / `--on-conflict skip|overwrite|backup`).
// `--workspace`/`--footprint` force the layout, else it is auto-detected (empty dir → workspace,
// existing repo → footprint). `-i` opens the interactive wizard.

import { mkdtempSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

import { ok, err, isErr, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { project, emit_error, usage_error, init_workspace } from '../../Core/useCases/index.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';
import { format_init_report, run_init_flow, create_clack_prompter } from '../../Tui/useCases/index.ts';

const DEFAULT_KIT = 'https://github.com/jcosta33/swarm-starter-kit';

type KitSource = Readonly<{ sourceDir: string; cleanup: () => void }>;

// A kit source must not be flag-shaped or a transport-scheme URL: git's `ext::`/`fd::`/`ssh+ext::`
// transports can execute arbitrary commands, and a leading `-` is parsed as a clone option (swarm-hq #22).
// Mirrors the is_safe_base guard for the same family; DEFAULT_KIT (https) and normal URLs pass.
function is_safe_clone_source(url: string): boolean {
    return !url.startsWith('-') && !/^(?:ext|fd|ssh\+ext)::/i.test(url);
}

/* v8 ignore start -- network clone shell; tests resolve the kit via a local --from */
function clone_kit(url: string): Result<KitSource, AppError> {
    const temp = mkdtempSync(join(tmpdir(), 'swarm-kit-'));
    const result = spawnSync('git', ['-c', 'protocol.ext.allow=never', 'clone', '--depth', '1', url, temp], {
        encoding: 'utf8',
    });
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
    const url = from ?? DEFAULT_KIT;
    if (!is_safe_clone_source(url)) {
        return err(
            createAppError('CloneFailed', `refusing an unsafe kit source "${url}" — a transport-scheme or flag-shaped URL`, { url })
        );
    }
    /* v8 ignore next -- the clone path is the network shell; tests resolve the kit via a local --from */
    return clone_kit(url);
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
    // An already-initialized Swarm workspace (it carries the kit's templates/ + specs/) keeps
    // workspace mode on re-run, so a second `init` stays idempotent instead of flipping to footprint.
    if (existsSync(join(targetDir, 'templates')) && existsSync(join(targetDir, 'specs'))) {
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
    if (existsSync(targetDir) && !statSync(targetDir).isDirectory()) {
        return emit_error(usage_error(`target is not a directory: ${targetDir}`), json);
    }
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
            return run_init_flow(create_clack_prompter(), { sourceDir, targetDir, mode });
        }
        /* v8 ignore stop */
        return project({
            result: init_workspace({ sourceDir, targetDir, policy, mode }),
            json,
            render: format_init_report,
        });
    } finally {
        cleanup();
    }
}
