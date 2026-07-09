#!/usr/bin/env node

// `suspec write spec "<intent>"` — the thin authoring launcher (SPEC-suspec-v2 AC-023). Scaffold
// a STORE spec from a one-line intent: `spec-<slug>.md` (storeLayout naming) with frontmatter
// type/id/status: draft/base_sha = repo HEAD (+ the grammar stamp from the atomic store write),
// the intent line in the body, and a Requirements skeleton of ONE empty AC with a `Verify with:`
// placeholder — the CLI authors NO requirement content. `--launch` dispatches the spec-author
// prompt (a POINTER at the store spec path + the instruction to interrogate the intent into ACs)
// to the default runner in the current dir; without it the scaffold just prints its path. This
// supersedes the retired `suspec new spec` workspace scaffold — one scaffold, store-rooted.
//   suspec write spec "<intent>"                scaffold the draft store spec
//   suspec write spec "<intent>" --launch       also dispatch the spec-author prompt to the runner
//   suspec write spec "<intent>" --runner <name> · --json
//
// Exits: 0 scaffolded (and, with --launch, the author dispatched — its exit is reported as data);
// 1 the launched author exited non-zero (a soft signal, like `work`); 2 usage / no git repo /
// unknown runner / the program could not launch.

import { isErr } from '../../../infra/errors/result.ts';
import {
    project,
    emit_error,
    usage_error,
    resolve_store_dir,
    scaffold_store_spec,
    resolve_runner_from_config,
    generate_spec_author_prompt,
} from '../../Core/useCases/index.ts';
import { resolve_repo_root, head_sha, launch_runner, render_runner_command } from '../../Workspace/useCases/index.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';

const USAGE = 'usage: suspec write spec "<one-line intent>" [--launch] [--runner <name>] [--json]';

// The spec slug from the intent: lower-cased, squeezed to safe-segment chars, capped.
function intent_slug(intent: string): string {
    return intent
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48)
        .replace(/-+$/, '');
}

export function run(argv: string[], cwd: string = process.cwd()): number {
    const { positional, flags } = parse_flags(argv, {
        booleans: ['--json', '--launch'],
        strings: ['--runner'],
    });
    const json = flags.get('json') === true;
    const launch = flags.get('launch') === true;
    const runnerFlag = flags.get('runner');
    const runnerName = typeof runnerFlag === 'string' ? runnerFlag : undefined;
    const type = positional[0];

    if (type !== 'spec') {
        return emit_error(
            usage_error(
                type === undefined ? USAGE : `unknown write type: ${type} — only \`write spec\` exists today\n${USAGE}`
            ),
            json
        );
    }
    const intent = positional[1]?.trim().replace(/\s+/g, ' ') ?? '';
    if (intent.length === 0) {
        return emit_error(usage_error(`${USAGE}\n  the intent seeds the spec — say it in one line`), json);
    }
    const slug = intent_slug(intent);
    if (slug.length === 0) {
        return emit_error(usage_error(`cannot derive a spec slug from "${intent}" — use letters or digits`), json);
    }

    const rootResult = resolve_repo_root(cwd);
    if (isErr(rootResult)) {
        return emit_error(rootResult.error, json);
    }
    const repoRoot = rootResult.value;
    const store = resolve_store_dir({ repoRoot });
    if (isErr(store)) {
        return emit_error(store.error, json);
    }
    const storeDir = store.value.storeDir;

    const scaffolded = scaffold_store_spec({ storeDir, slug, intent, baseSha: head_sha(repoRoot) });
    if (isErr(scaffolded)) {
        return emit_error(scaffolded.error, json);
    }
    const { specId, path, created } = scaffolded.value;

    if (!launch) {
        return project({
            result: {
                ok: true,
                value: { level: 'clean' as const, spec: specId, spec_path: path, created, launched: false },
            },
            json,
            render: (v) =>
                `${v.created ? 'scaffolded' : 'reusing'} ${v.spec} (draft — author the ACs, or re-run with --launch)\n` +
                `  spec: ${v.spec_path}\n` +
                `  then: suspec work ${v.spec}`,
        });
    }

    // --launch: the spec-author prompt goes to the runner IN THE CURRENT DIR — authoring a spec
    // needs no worktree; the artifact being written lives in the store.
    const runner = resolve_runner_from_config(repoRoot, runnerName);
    if (isErr(runner)) {
        return emit_error(runner.error, json);
    }
    const prompt = generate_spec_author_prompt({ specId, specPath: path, intent });
    const rendered = render_runner_command(runner.value.command_template, {
        prompt,
        cwd: repoRoot,
        store: storeDir,
    });
    const launched = launch_runner(rendered, repoRoot);
    if (isErr(launched)) {
        return emit_error(launched.error, json);
    }
    const { exit } = launched.value;
    const level = exit === 0 ? ('clean' as const) : ('warning' as const);
    return project({
        result: {
            ok: true,
            value: {
                level,
                spec: specId,
                spec_path: path,
                created,
                launched: true,
                runner: runner.value.name,
                exit,
            },
        },
        json,
        render: (v) =>
            `${v.created ? 'scaffolded' : 'reusing'} ${v.spec} — spec author (${v.runner}) exited ${v.exit}\n` +
            `  spec: ${v.spec_path}\n` +
            `  then: suspec work ${v.spec}`,
    });
}
