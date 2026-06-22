#!/usr/bin/env node

// `swarm update [--check | --write]` — the kit drift surface (SPEC-swarm-update, ADR-0091). Resolves
// the kit (clone jcosta33/swarm-starter-kit by default; `--from <path|url>` overrides — the same
// resolution as `swarm init`), then either:
//   --check (default) reconcile-only: compares the workspace's `.agents/.swarm-version` pin to the
//            kit's VERSION and reports drift, writing nothing. Exit 0 up-to-date · 1 behind · 2 error.
//   --write / --apply: lands the newer kit content via the conflict-safe copy engine (default
//            `--on-conflict backup`: a changed user file is preserved as `*.swarm-bak`, the kit's
//            lands; `.gitignore` / `AGENTS.md` marker-merge; the pin re-stamps). Exit 0 applied-clean ·
//            1 applied-with-files-to-reconcile / nothing-to-apply-but-already-current is 0 · 2 error.

import { isErr, type Result } from '../../../infra/errors/result.ts';
import type { AppError } from '../../../infra/errors/createAppError.ts';
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
import { resolve_kit_source, type KitSource } from './init.ts';

// The kit resolver is injectable so a test can assert the cleanup contract (AC-007) without a network
// clone; production uses the default — the same clone / `--from` resolution as `swarm init`.
type KitResolver = (from: string | undefined) => Result<KitSource, AppError>;

export function run(argv: string[], cwd: string = process.cwd(), resolveKit: KitResolver = resolve_kit_source): number {
    // `--check` is the default: bare `swarm update` and `swarm update --check` both run the read-only
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
