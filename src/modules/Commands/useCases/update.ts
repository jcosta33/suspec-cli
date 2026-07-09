#!/usr/bin/env node

// `suspec update [--check | --write]` — the kit drift surface (SPEC-suspec-update, ADR-0091).
// For a dir carrying kit-managed content (a `.agents/.suspec-version` pin + the manifest-declared
// templates). Resolves the kit (clone jcosta33/suspec-starter-kit by default; `--from <path|url>`
// overrides), then either:
//   --check (default) reconcile-only: compares the `.agents/.suspec-version` pin to the kit's
//            VERSION and reports drift, writing nothing. Exit 0 up-to-date · 1 behind · 2 error.
//   --write / --apply: lands the newer kit-owned content (the manifest's `kit_owned` list —
//            templates) via the conflict-safe copy engine (default `--on-conflict backup`: a
//            changed file is preserved as `*.suspec-bak`, the kit's lands; the pin re-stamps).
//            Exit 0 applied-clean · 1 applied-with-files-to-reconcile · 2 error.
// The methodology skills are NOT refreshed here — they install globally
// (npx skills add jcosta33/suspec-skills -g).

import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

import { ok, err, isErr, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import {
    project,
    emit_error,
    usage_error,
    check_update,
    apply_update,
    type ConflictPolicy,
} from '../../Core/useCases/index.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';
import { format_update_report, format_apply_report } from '../../Tui/useCases/index.ts';

const DEFAULT_KIT = 'https://github.com/jcosta33/suspec-starter-kit';

export type KitSource = Readonly<{ sourceDir: string; cleanup: () => void }>;

// A kit source must not be flag-shaped or a transport-scheme URL: git's `ext::`/`fd::`/`ssh+ext::`
// transports can execute arbitrary commands, and a leading `-` is parsed as a clone option.
// DEFAULT_KIT (https) and normal URLs pass.
function is_safe_clone_source(url: string): boolean {
    return !url.startsWith('-') && !/^(?:ext|fd|ssh\+ext)::/i.test(url);
}

/* v8 ignore start -- network clone shell; tests resolve the kit via a local --from */
function clone_kit(url: string): Result<KitSource, AppError> {
    const temp = mkdtempSync(join(tmpdir(), 'suspec-kit-'));
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

export function resolve_kit_source(from: string | undefined): Result<KitSource, AppError> {
    if (from !== undefined && existsSync(from)) {
        return ok({ sourceDir: from, cleanup: () => undefined });
    }
    const url = from ?? DEFAULT_KIT;
    if (!is_safe_clone_source(url)) {
        return err(
            createAppError(
                'CloneFailed',
                `refusing an unsafe kit source "${url}" — a transport-scheme or flag-shaped URL`,
                { url }
            )
        );
    }
    /* v8 ignore next -- the clone path is the network shell; tests resolve the kit via a local --from */
    return clone_kit(url);
}

// The kit resolver is injectable so a test can assert the cleanup contract (AC-007) without a network
// clone; production uses the default clone / `--from` resolution above.
type KitResolver = (from: string | undefined) => Result<KitSource, AppError>;

export function run(argv: string[], cwd: string = process.cwd(), resolveKit: KitResolver = resolve_kit_source): number {
    // `--check` is the default: bare `suspec update` and `suspec update --check` both run the read-only
    // drift check. `--write` / `--apply` (below) lands the kit content via the copy engine. The flags
    // are declared so the parser and the advertised usage agree.
    const { flags } = parse_flags(argv, {
        booleans: ['--check', '--json', '--write', '--apply'],
        strings: ['--from', '--on-conflict'],
    });
    const json = flags.get('json') === true;
    const write = flags.get('write') === true || flags.get('apply') === true;

    // `--on-conflict <skip|overwrite|backup>` only shapes the apply; default `backup` (non-destructive).
    // A typo'd value is a hard usage error, never a silent fallthrough to a different policy.
    const policy = parse_conflict_policy(flags.get('on-conflict'));
    if (policy === null) {
        return emit_error(usage_error('--on-conflict must be one of: backup (default), overwrite, skip'), json);
    }

    const fromFlag = flags.get('from');
    const from = typeof fromFlag === 'string' ? fromFlag : undefined;

    const sourceResult = resolveKit(from);
    if (isErr(sourceResult)) {
        return emit_error(sourceResult.error, json);
    }
    const { sourceDir, cleanup } = sourceResult.value;

    try {
        if (write) {
            return project({
                result: apply_update({ workspaceDir: cwd, kitSourceDir: sourceDir, policy }),
                json,
                render: format_apply_report,
            });
        }
        return project({
            result: check_update({ workspaceDir: cwd, kitSourceDir: sourceDir }),
            json,
            render: format_update_report,
        });
    } finally {
        cleanup();
    }
}

// `backup` is the default — a `--write` never overwrites a user's edited file unless asked. `null`
// signals an unrecognized value (a usage error at the surface), keeping the policy a closed set.
function parse_conflict_policy(value: string | boolean | undefined): ConflictPolicy | null {
    if (value === undefined) {
        return 'backup';
    }
    if (value === 'backup' || value === 'overwrite' || value === 'skip') {
        return value;
    }
    return null;
}
