#!/usr/bin/env node

// `suspec check` — the whole command surface (ADR-0143). The CLI reads exactly the files it is
// handed: the primary artifact's kind comes from its own frontmatter `type:`, companions are
// explicit flags, and nothing resolves a store, a config, a repo root, or a workspace tree.
//   suspec check <artifact> [<artifact>...]                    spec / change-plan files (exit = max)
//   suspec check <review-path> --spec <path> [--task <path>]   reconcile a review packet
//   suspec check --contract                                    the checks contract as JSON
// Direct output + exit codes flow through the shared unixOutcome contract.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import {
    check_spec,
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
import { err, ok } from '../../../infra/errors/result.ts';
import { normalize_scalar } from '../../../infra/yamlScalar.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';
import { format_check_report } from '../services/renderCheckReport.ts';

// The frontmatter `type:` scalar from an artifact's leading `---` fence — the kind sniff the
// dispatch keys on. Scans the fenced block only (however long, never the body) and reads the value
// as YAML would (normalize_scalar: quotes, inline comments), so `type: "review"` dispatches like
// `type: review`. null when no `type:` is present (the legacy type-less spec shape the spec parser
// owns rejecting).
function artifact_type(source: string): string | null {
    const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source; // BOM-tolerant, like read_frontmatter
    const lines = text.split(/\r\n|[\r\n]/);
    if (lines[0] !== '---') {
        return null;
    }
    for (let index = 1; index < lines.length && lines[index] !== '---'; index += 1) {
        const match = /^type:\s*(.+)$/.exec(lines[index]);
        if (match !== null) {
            const value = normalize_scalar(match[1]);
            return value.length > 0 ? value : null;
        }
    }
    return null;
}

export function run(argv: string[]): number {
    const { positional, flags } = parse_flags(argv, {
        booleans: ['--json', '--contract'],
        strings: ['--spec', '--task'],
    });
    const json = flags.get('json') === true;
    const specFlag = flags.get('spec');
    const taskFlag = flags.get('task');
    const specPath = typeof specFlag === 'string' ? specFlag : undefined;
    const taskPath = typeof taskFlag === 'string' ? taskFlag : undefined;

    // `--contract`: dump the checks contract as JSON — its own invocation: no artifacts, no
    // companions. `--json` (the structured face, ADR-0143 D7) rides every invocation and is
    // accepted here too — it changes nothing, the dump is already JSON, and corpus-mcp's
    // shell-out appends it unconditionally.
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
    const seen = new Set<string>();
    const paths = positional.filter((file) => {
        let key: string;
        try {
            const stats = statSync(file, { bigint: true });
            key = `${stats.dev}:${stats.ino}`;
        } catch {
            key = resolve(file); // not statable — the per-file load pass below diagnoses it
        }
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
    const loaded: { path: string; source: string; type: string | null }[] = [];
    for (const file of paths) {
        if (!existsSync(file)) {
            bump(project({ result: err(usage_error(`file not found: ${file}`)), json, render: format_check_report }));
            continue;
        }
        if (statSync(file).isDirectory()) {
            bump(
                project({
                    result: err(
                        usage_error(`not an artifact file (it is a directory): ${file} — point at the file inside it`)
                    ),
                    json,
                    render: format_check_report,
                })
            );
            continue;
        }
        const source = readFileSync(file, 'utf8');
        loaded.push({ path: file, source, type: artifact_type(source) });
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

    // Check one loaded artifact: dispatch by its frontmatter `type:` and render its report. Returns
    // the file's exit code (the shared unixOutcome contract via `project`).
    const check_one_file = (file: string, source: string, type: string | null): number => {
        // A review packet reconciles against the spec it is checked against — always handed
        // explicitly (ADR-0143 D3). The task is an optional split slice (ADR-0134): --task is
        // required iff the review references a task — the engine refuses a task-referencing review
        // with no --task (and a handed --task nothing references) as a blocking usage error, so the
        // floor's strongest checks (C012/C013/C020) are never silently skippable.
        if (type === 'review') {
            if (specPath === undefined) {
                return emit_error(
                    usage_error(
                        'a review packet needs its source spec: missing --spec — usage: suspec check <review-path> --spec <spec-path> [--task <task-path>]'
                    ),
                    json
                );
            }
            const companions: { flag: string; path: string }[] = [{ flag: '--spec', path: specPath }];
            if (taskPath !== undefined) {
                companions.push({ flag: '--task', path: taskPath });
            }
            for (const companion of companions) {
                if (!existsSync(companion.path)) {
                    return emit_error(usage_error(`${companion.flag} file not found: ${companion.path}`), json);
                }
                if (statSync(companion.path).isDirectory()) {
                    return emit_error(
                        usage_error(
                            `${companion.flag} is not an artifact file (it is a directory): ${companion.path} — point at the file inside it`
                        ),
                        json
                    );
                }
            }
            return project({
                result: check_review_file({
                    reviewSource: source,
                    reviewPath: file,
                    specSource: readFileSync(specPath, 'utf8'),
                    specPath,
                    taskSource: taskPath === undefined ? undefined : readFileSync(taskPath, 'utf8'),
                }),
                json,
                render: format_check_report,
            });
        }
        // A change plan (`type: change-plan`) runs C010/C011. C010 resolves `SPEC-x#AC-NNN` refs
        // artifact-relative — against the plan's sibling `*/spec.md` files (contract C010:
        // refs resolve against the plan's sibling specs; checks.yaml).
        if (type === 'change-plan') {
            return project({
                result: check_change_plan({
                    source,
                    path: file,
                    spec_ref_resolves: build_spec_ref_resolver(find_sibling_spec_files(file)),
                }),
                json,
                render: format_check_report,
            });
        }
        // An artifact whose `type:` has NO check face (task, finding, adr, intake, inventory, …)
        // must not fall through to the SPEC checks — that only emits category-error warnings ("no
        // Requirements section" against a finding). Say so cleanly and exit 0: nothing to validate
        // is not a defect. A `type: spec` file and a type-less file (the legacy shape the spec
        // parser owns rejecting) take the spec path below.
        if (type !== null && type !== 'spec') {
            return project({
                result: ok({ level: 'clean' as const, path: file, type, checked: false }),
                json,
                render: () =>
                    `${file} — no checks for type ${type} (check faces: spec, review, change-plan); nothing to validate`,
            });
        }
        // C009 resolves a source ref artifact-relative (against the spec's own directory, ADR-0143
        // D4). The C015 resolver is built from the spec's named sources.md (read here, so the
        // engine stays pure); it admits every key when no sources.md is resolvable — the ADR-0087
        // no-false-flag rule.
        return project({
            result: check_spec({
                source,
                path: file,
                exists: build_source_exists(file),
                anchor_resolves: build_anchor_resolver(source, file),
            }),
            json,
            render: format_check_report,
        });
    };

    // Check EVERY named file in ONE process — a caller batching a staged set pays the ~0.15s startup
    // floor once, not per file. The exit code is the max across files (the shared unixOutcome
    // ordering: 0 clean < 1 warning < 2 blocking).
    for (const artifact of loaded) {
        bump(check_one_file(artifact.path, artifact.source, artifact.type));
    }
    // The cross-file checks over the passed set (C002 duplicate-id) — only meaningful when several
    // artifacts ride one invocation; a clean set prints nothing (no noise on the happy path).
    if (loaded.length > 1) {
        const set = check_artifact_set({ artifacts: loaded });
        if (set.ok && set.value.diagnostics.length > 0) {
            bump(project({ result: set, json, render: format_check_report }));
        }
    }
    return status;
}
