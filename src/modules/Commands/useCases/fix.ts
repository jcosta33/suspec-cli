#!/usr/bin/env node

// `suspec fix <FIND-id | #issue>` — resumability (SPEC-suspec-v2 AC-017): turn a promoted source
// back into launched work. A FIND ref resolves from the store (including `archive/` — a promoted
// finding's transient copy retired there); a `#N` ref fetches the issue via gh. Either way the
// source scaffolds a fresh store spec (`spec-fix-<slug>.md`, `base_sha` = repo HEAD,
// `affected_areas` carried from the finding when present) and hands off to the SAME launch
// pipeline `suspec work` runs — fix composes work, it never duplicates it. The wipe-survival
// property: after `rm -rf <store>`, `fix #123` still works end-to-end — store resolution recreates
// the dir, gh re-supplies the content (the issue is the durable copy; ADR-0137).
//   suspec fix <FIND-id | #issue>            scaffold + launch via the work pipeline
//   suspec fix <ref> --no-launch             scaffold only; print the spec path
//   suspec fix <ref> --runner <name>         forwarded to work
//   suspec fix <ref> --base <branch>         forwarded to work
//   suspec fix <ref> --anyway                forwarded to work (staleness / wip-cap override)
//   suspec fix <ref> --json                  machine output (forwarded to work on launch)
// Exits: with --no-launch 0 scaffolded · 1 gh missing/failing (named — AC-025) · 2 usage /
// unknown finding; on launch, the work pipeline's own contract applies.

import { isErr } from '../../../infra/errors/result.ts';
import {
    project,
    emit_error,
    usage_error,
    is_safe_segment,
    resolve_store_dir,
    find_store_finding,
    scaffold_fix_spec,
} from '../../Core/useCases/index.ts';
import { resolve_repo_root, fetch_gh_issue, head_sha } from '../../Workspace/useCases/index.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';
import { run as run_work } from './work.ts';

const USAGE =
    'usage: suspec fix <FIND-id | #issue> [--no-launch] [--runner <name>] [--base <branch>] [--anyway] [--json]';

// The `fix-<…>` spec slug from a source ref: lower-cased, squeezed to safe-segment chars.
function fix_slug(raw: string): string {
    const squeezed = raw
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^[-._]+|[-]+$/g, '');
    return `fix-${squeezed}`;
}

type FixSource = Readonly<{
    slug: string;
    title: string;
    sourceRef: string;
    sourceBody: string;
    affectedAreas: readonly string[];
    labels?: readonly string[];
}>;

export function run(argv: string[], cwd: string = process.cwd()): number {
    const { positional, flags } = parse_flags(argv, {
        booleans: ['--json', '--no-launch', '--anyway'],
        strings: ['--runner', '--base'],
    });
    const json = flags.get('json') === true;
    const noLaunch = flags.get('no-launch') === true;
    const anyway = flags.get('anyway') === true;
    const runnerFlag = flags.get('runner');
    const baseFlag = flags.get('base');
    const ref = positional[0];

    if (ref === undefined) {
        return emit_error(usage_error(USAGE), json);
    }
    const isIssue = ref.startsWith('#');
    if (isIssue && !/^#\d+$/.test(ref)) {
        return emit_error(usage_error(`${USAGE}\n  an issue ref is #<number>, e.g. #123`), json);
    }
    if (!isIssue && !is_safe_segment(ref)) {
        return emit_error(usage_error(`${USAGE}\n  <FIND-id> is a finding id or store filename, never a path`), json);
    }

    const rootResult = resolve_repo_root(cwd);
    if (isErr(rootResult)) {
        return emit_error(rootResult.error, json);
    }
    const repoRoot = rootResult.value;

    // NOT a probe: the wipe-survival property (AC-017) — a wiped store is recreated right here,
    // and the durable source (the gh issue) re-supplies the content.
    const store = resolve_store_dir({ repoRoot });
    if (isErr(store)) {
        return emit_error(store.error, json);
    }
    const storeDir = store.value.storeDir;

    let source: FixSource;
    if (isIssue) {
        const issueNumber = ref.slice(1);
        const fetched = fetch_gh_issue(issueNumber, { cwd: repoRoot });
        if (isErr(fetched)) {
            // AC-025: `fix #N` is the command that needs gh — name the dependency, change nothing.
            return project({
                result: {
                    ok: true,
                    value: { level: 'warning' as const, refused: 'gh' as const, message: fetched.error.message },
                },
                json,
                render: (v) => `fix ${ref} needs the gh CLI — ${v.message}`,
            });
        }
        source = {
            slug: fix_slug(`issue-${issueNumber}`),
            title: fetched.value.title.length > 0 ? fetched.value.title : `issue ${ref}`,
            sourceRef: ref,
            sourceBody: fetched.value.body,
            affectedAreas: [],
            labels: fetched.value.labels,
        };
    } else {
        const finding = find_store_finding(storeDir, ref, { includeArchived: true });
        if (finding === null) {
            return emit_error(
                usage_error(`no finding ${ref} in ${storeDir} (searched finding-*.md, including archive/)`),
                json
            );
        }
        source = {
            slug: fix_slug(finding.id ?? finding.filename.replace(/\.md$/, '')),
            title: finding.title,
            sourceRef: finding.id ?? finding.filename,
            sourceBody: finding.body,
            affectedAreas: finding.affectedAreas,
        };
    }

    const scaffolded = scaffold_fix_spec({
        storeDir,
        slug: source.slug,
        title: source.title,
        sourceRef: source.sourceRef,
        sourceBody: source.sourceBody,
        baseSha: head_sha(repoRoot),
        affectedAreas: source.affectedAreas,
        labels: source.labels,
    });
    if (isErr(scaffolded)) {
        return emit_error(scaffolded.error, json);
    }
    const { specId, path, created } = scaffolded.value;

    if (noLaunch) {
        return project({
            result: {
                ok: true,
                value: { level: 'clean' as const, spec: specId, spec_path: path, created, launched: false },
            },
            json,
            render: (v) =>
                `${v.created ? 'scaffolded' : 'reusing'} ${v.spec} from ${source.sourceRef} (not launched)\n` +
                `  spec:   ${v.spec_path}\n` +
                `  launch: suspec work ${v.spec}`,
        });
    }

    // The hand-off: the work pipeline resolves the spec we just wrote and owns everything from
    // here (worktree, setup, run file, launch) — fix adds nothing to it.
    process.stderr.write(`note: ${created ? 'scaffolded' : 'reusing'} ${path} — launching via the work pipeline\n`);
    const forwarded = [
        specId,
        ...(typeof runnerFlag === 'string' ? ['--runner', runnerFlag] : []),
        ...(typeof baseFlag === 'string' ? ['--base', baseFlag] : []),
        ...(anyway ? ['--anyway'] : []),
        ...(json ? ['--json'] : []),
    ];
    return run_work(forwarded, cwd);
}
