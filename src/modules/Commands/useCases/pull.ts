#!/usr/bin/env node

// `suspec pull <ref>` — intake-only capture into the STORE (ADR-0137). Thin: wire the real `gh`
// fetcher to the engine, write one `intake-<slug>.md` store artifact, and report its path. It
// writes NO spec and launches NOTHING — that is `suspec fix #N`'s job (scaffold + launch); `pull`
// is the capture half on its own, for when you want the ticket verbatim before deciding anything.
// The artifact records the original `url:`, so a wiped store re-captures with one command.
//   suspec pull <ref>            snapshot a ticket into the store (verbatim; gh-issue fetched)
//   suspec pull <ref> --force    overwrite an existing snapshot (else no-clobber)
//   suspec pull <ref> --json     machine output (the path + slug; never a verdict)

import { isErr } from '../../../infra/errors/result.ts';
import { project, emit_error, usage_error, pull_intake, resolve_store_dir } from '../../Core/useCases/index.ts';
import { fetch_gh_issue, resolve_repo_root } from '../../Workspace/useCases/index.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';

export function run(argv: string[], cwd: string = process.cwd()): number {
    const { positional, flags } = parse_flags(argv, {
        booleans: ['--json', '--force'],
        strings: [],
    });
    const json = flags.get('json') === true;
    const force = flags.get('force') === true;
    const ref = positional[0];

    if (ref === undefined) {
        return emit_error(
            usage_error(
                'usage: suspec pull <ref> — a ticket ref (a gh issue, a URL, or a tracker key); capture only — `suspec fix #N` scaffolds + launches'
            ),
            json
        );
    }

    // The snapshot lands in the store (created on first use — capture is a first-touch operation).
    const rootResult = resolve_repo_root(cwd);
    const repoRoot = isErr(rootResult) ? cwd : rootResult.value;
    const store = resolve_store_dir({ repoRoot });
    if (isErr(store)) {
        return emit_error(store.error, json);
    }

    return project({
        result: pull_intake({ storeDir: store.value.storeDir, repoRoot, ref, force, fetchGhIssue: fetch_gh_issue }),
        json,
        render: (report) =>
            report.fetched
                ? `pulled ${report.slug} (verbatim from gh)\n  ${report.path}\n  capture only — \`suspec fix #N\` scaffolds a fix spec and launches`
                : `wrote intake snapshot ${report.slug} (paste placeholder — fill in the upstream body)\n  ${report.path}`,
    });
}
