#!/usr/bin/env node

// `suspec check` — the whole command surface (ADR-0143). The CLI reads exactly the files it is
// handed: the primary artifact's kind comes from its own frontmatter `type:`, companions are
// explicit flags, and nothing resolves a store, a config, a repo root, or a workspace tree.
//   suspec check <artifact> [<artifact>...]                    spec / task / change-plan (exit = max)
//   suspec check <review-path> --spec <path> [--task <path>]   reconcile a review packet
//   suspec check --contract                                    the checks contract as JSON
// Direct output + exit codes flow through the shared unixOutcome contract.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import {
    check_spec,
    check_task,
    check_review_file,
    check_change_plan,
    check_artifact_set,
    build_spec_ref_resolver,
    build_anchor_resolver,
    build_source_exists,
    find_sibling_spec_files,
    contract_dump,
    project,
    emit_error,
    usage_error,
} from '../../Core/useCases/index.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { err, ok, type Result } from '../../../infra/errors/result.ts';
import { parse_frontmatter, scalar_field } from '../../../infra/frontmatter.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';
import { format_check_report } from '../services/renderCheckReport.ts';

type CheckFileSystem = Readonly<{
    exists: (path: string) => boolean;
    identity: (path: string) => string;
    isDirectory: (path: string) => boolean;
    read: (path: string) => string;
}>;

type BufferedOutcome = Readonly<{
    code: number;
    stdout: string;
    stderr: string;
    structuredError: boolean;
}>;

const nodeFileSystem: CheckFileSystem = {
    exists: existsSync,
    identity: (path) => {
        const stats = statSync(path, { bigint: true });
        return `${stats.dev}:${stats.ino}`;
    },
    isDirectory: (path) => statSync(path).isDirectory(),
    read: (path) => readFileSync(path, 'utf8'),
};

const RECOGNIZED_TYPES = new Set(['spec', 'task', 'review', 'inventory', 'change-plan', 'audit', 'research']);

export const CHECK_FLAG_SPEC = {
    booleans: ['--json', '--contract'],
    strings: ['--spec', '--task'],
} as const;

function caught_message(caught: unknown): string {
    return caught instanceof Error ? caught.message : String(caught);
}

function load_artifact_source(fileSystem: CheckFileSystem, path: string, flag?: string) {
    let exists: boolean;
    try {
        exists = fileSystem.exists(path);
    } catch (caught) {
        return err(
            usage_error(
                `cannot stat ${flag === undefined ? 'file' : `${flag} file`}: ${path}: ${caught_message(caught)}`
            )
        );
    }
    if (!exists) {
        return err(usage_error(`${flag === undefined ? '' : `${flag} `}file not found: ${path}`));
    }

    let isDirectory: boolean;
    try {
        isDirectory = fileSystem.isDirectory(path);
    } catch (caught) {
        return err(
            usage_error(
                `cannot stat ${flag === undefined ? 'file' : `${flag} file`}: ${path}: ${caught_message(caught)}`
            )
        );
    }
    if (isDirectory) {
        const message =
            flag === undefined
                ? `not an artifact file (it is a directory): ${path} — point at the file inside it`
                : `${flag} is not an artifact file (it is a directory): ${path} — point at the file inside it`;
        return err(usage_error(message));
    }

    try {
        return ok(fileSystem.read(path));
    } catch (caught) {
        return err(
            usage_error(
                `cannot read ${flag === undefined ? 'file' : `${flag} file`}: ${path}: ${caught_message(caught)}`
            )
        );
    }
}

export function run(argv: string[], cwdOrFileSystem?: string | CheckFileSystem): number {
    const fileSystem = typeof cwdOrFileSystem === 'object' ? cwdOrFileSystem : nodeFileSystem;
    const { positional, flags, unknown, errors } = parse_flags(argv, CHECK_FLAG_SPEC);
    const json = flags.get('json') === true;
    const specFlag = flags.get('spec');
    const taskFlag = flags.get('task');
    const specPath = typeof specFlag === 'string' ? specFlag : undefined;
    const taskPath = typeof taskFlag === 'string' ? taskFlag : undefined;

    if (errors.length > 0) {
        return emit_error(usage_error(errors.join('; ')), json);
    }
    if (unknown.length > 0) {
        return emit_error(usage_error(`unknown option: ${unknown.join(', ')}`), json);
    }

    // `--contract`: dump the checks contract as JSON — its own invocation: no artifacts, no
    // companions. `--json` is accepted here too; it changes nothing because the dump is already
    // JSON.
    if (flags.get('contract') === true) {
        if (positional.length > 0 || specPath !== undefined || taskPath !== undefined) {
            return emit_error(
                usage_error('--contract takes no artifacts or companions — usage: suspec check --contract'),
                json
            );
        }
        process.stdout.write(`${JSON.stringify(contract_dump(), null, 2)}\n`);
        return 0;
    }

    if (positional.length === 0) {
        return emit_error(
            usage_error(
                'no artifact named — usage: suspec check <artifact> [<artifact>...] | suspec check <review-path> --spec <spec-path> [--task <task-path>]'
            ),
            json
        );
    }

    // Load every named file up front (deduped by filesystem identity — `spec.md`, `./spec.md`, a
    // case-variant spelling on a case-insensitive volume, and a symlink alias all name ONE
    // artifact, never a C002 duplicate-id pair; a path that stats to nothing falls back to its
    // resolved spelling, so one missing file named twice still reports once): a missing file or
    // a directory keeps its per-file error report. Any load failure fails the whole invocation
    // before the invocation-shape rules below — shape judged over a partial set would print a
    // second, contradictory diagnosis (and a second JSON document) for what is really one bad path.
    let status = 0;
    const bump = (code: number) => {
        if (code > status) {
            status = code;
        }
    };
    const capture_error = (error: AppError): BufferedOutcome => {
        let stdout = '';
        let stderr = '';
        const code = emit_error(error, json, {
            out: (text) => {
                stdout += text;
            },
            err: (text) => {
                stderr += text;
            },
        });
        return { code, stdout, stderr, structuredError: true };
    };
    const capture_result = <TValue extends { readonly level: 'clean' | 'warning' | 'blocking' }>(
        result: Result<TValue, AppError>,
        render: (value: TValue) => string
    ): BufferedOutcome => {
        let stdout = '';
        let stderr = '';
        const code = project(
            { result, json, render },
            {
                out: (text) => {
                    stdout += text;
                },
                err: (text) => {
                    stderr += text;
                },
            }
        );
        return { code, stdout, stderr, structuredError: !result.ok };
    };
    const seen = new Set<string>();
    const paths = positional.filter((file) => {
        let key: string;
        try {
            key = fileSystem.identity(file);
        } catch {
            key = resolve(file); // not statable — the per-file load pass below diagnoses it
        }
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
    const loaded: { path: string; source: string; type: string; id: string | null }[] = [];
    for (const file of paths) {
        const sourceResult = load_artifact_source(fileSystem, file);
        if (!sourceResult.ok) {
            bump(emit_error(sourceResult.error, json));
            continue;
        }
        const source = sourceResult.value;
        const parsed = parse_frontmatter(source);
        if (!parsed.ok) {
            bump(emit_error(parsed.error, json));
            continue;
        }
        const rawType = parsed.value.fields.type;
        if (Array.isArray(rawType)) {
            bump(emit_error(usage_error(`artifact \`${file}\` must declare \`type:\` as a scalar`), json));
            continue;
        }
        const type = scalar_field(parsed.value.fields, 'type');
        if (type === undefined || type.length === 0) {
            bump(emit_error(usage_error(`artifact \`${file}\` must declare a non-empty \`type:\``), json));
            continue;
        }
        if (!RECOGNIZED_TYPES.has(type)) {
            bump(emit_error(usage_error(`artifact \`${file}\` declares unknown type \`${type}\``), json));
            continue;
        }
        const rawId = parsed.value.fields.id;
        if (Array.isArray(rawId)) {
            bump(
                emit_error(
                    createAppError('ParseFailure', `frontmatter \`id:\` in \`${file}\` must be a scalar`, {
                        reason: 'unparseable-frontmatter',
                        line: null,
                    }),
                    json
                )
            );
            continue;
        }
        loaded.push({ path: file, source, type, id: scalar_field(parsed.value.fields, 'id') ?? null });
    }
    if (loaded.length < paths.length) {
        return status;
    }

    // The invocation-shape rules. A review packet reconciles against its explicit companions, so it
    // is checked alone; the companion flags belong to a review and nothing else.
    const hasReview = loaded.some((artifact) => artifact.type === 'review');
    if (hasReview && paths.length > 1) {
        return emit_error(
            usage_error(
                'a review packet is checked alone — usage: suspec check <review-path> --spec <spec-path> [--task <task-path>]'
            ),
            json
        );
    }
    if (!hasReview && (specPath !== undefined || taskPath !== undefined)) {
        return emit_error(
            usage_error('--spec/--task accompany a review packet — the named artifacts carry no review'),
            json
        );
    }

    // Check one loaded artifact without emitting. Multi-path output is committed only after every
    // result is known, so one invocation can never mix reports with structured errors.
    const check_one_file = (file: string, source: string, type: string): BufferedOutcome => {
        // A review packet reconciles against the spec it is checked against — always handed
        // explicitly (ADR-0143 D3). The task is a conditional split slice (ADR-0134): --task is
        // required iff the review references a task — the engine refuses a task-referencing review
        // with no --task (and a handed --task nothing references) as a blocking usage error, so the
        // floor's strongest checks (C012/C013/C020) are never silently skippable.
        if (type === 'review') {
            if (specPath === undefined) {
                return capture_error(
                    usage_error(
                        'a review packet needs its source spec: missing --spec — usage: suspec check <review-path> --spec <spec-path> [--task <task-path>]'
                    )
                );
            }
            const companions: { flag: string; path: string }[] = [{ flag: '--spec', path: specPath }];
            if (taskPath !== undefined) {
                companions.push({ flag: '--task', path: taskPath });
            }
            const companionSources = new Map<string, string>();
            for (const companion of companions) {
                const sourceResult = load_artifact_source(fileSystem, companion.path, companion.flag);
                if (!sourceResult.ok) {
                    return capture_error(sourceResult.error);
                }
                companionSources.set(companion.flag, sourceResult.value);
            }
            return capture_result(
                check_review_file({
                    reviewSource: source,
                    reviewPath: file,
                    specSource: companionSources.get('--spec') ?? '',
                    specPath,
                    taskSource: taskPath === undefined ? undefined : companionSources.get('--task'),
                }),
                format_check_report
            );
        }
        // A change plan (`type: change-plan`) runs C010/C011. C010 resolves `SPEC-x#AC-NNN` refs
        // artifact-relative — against the plan's sibling `*/spec.md` files (contract C010:
        // refs resolve against the plan's sibling specs; checks.yaml).
        if (type === 'change-plan') {
            let specRefResolves: (specId: string, acId: string) => boolean;
            try {
                specRefResolves = build_spec_ref_resolver(find_sibling_spec_files(file));
            } catch (caught) {
                return capture_error(
                    usage_error(`cannot resolve sibling specs for change plan ${file}: ${caught_message(caught)}`)
                );
            }
            return capture_result(
                check_change_plan({
                    source,
                    path: file,
                    spec_ref_resolves: specRefResolves,
                }),
                format_check_report
            );
        }
        if (type === 'task') {
            return capture_result(check_task(source, file), format_check_report);
        }
        // A recognized artifact with no deterministic face reports that fact and exits clean.
        if (type !== 'spec') {
            return capture_result(
                ok({ level: 'clean' as const, path: file, type, checked: false }),
                () =>
                    `${file} — no checks for type ${type} (check faces: spec, task, review, change-plan); nothing to validate`
            );
        }
        // C009 resolves a source ref artifact-relative (against the spec's own directory, ADR-0143
        // D4). The C015 resolver is built from the spec's named sources.md (read here, so the
        // engine stays pure); it admits every key when no sources.md is resolvable — the ADR-0087
        // no-false-flag rule.
        return capture_result(
            check_spec({
                source,
                path: file,
                exists: build_source_exists(file),
                anchor_resolves: build_anchor_resolver(source, file),
            }),
            format_check_report
        );
    };

    // Check EVERY named file in ONE process — a caller batching a staged set pays the ~0.15s startup
    // floor once, not per file. The exit code is the max across files (the shared unixOutcome
    // ordering: 0 clean < 1 warning < 2 blocking).
    const outcomes = loaded.map((artifact) => check_one_file(artifact.path, artifact.source, artifact.type));
    // The cross-file checks over the passed set (C002 duplicate-id) — only meaningful when several
    // artifacts ride one invocation; a clean set prints nothing (no noise on the happy path).
    if (loaded.length > 1) {
        const set = check_artifact_set({ artifacts: loaded });
        if (!set.ok || set.value.diagnostics.length > 0) {
            outcomes.push(capture_result(set, format_check_report));
        }
    }
    const selected = outcomes.some((outcome) => outcome.structuredError)
        ? outcomes.filter((outcome) => outcome.structuredError)
        : outcomes;
    for (const outcome of selected) {
        process.stdout.write(outcome.stdout);
        process.stderr.write(outcome.stderr);
        bump(outcome.code);
    }
    return status;
}
