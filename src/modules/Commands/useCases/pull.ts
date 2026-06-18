#!/usr/bin/env node

// `swarm pull <ref>` — the prepare engine's intake command surface (W5, AC-001/AC-005). Thin: wire
// the real `gh` fetcher to the engine, write one `intake/<slug>.md`, and report its path. It writes
// no spec, mutates no board, and emits no review result/board-flip/merge decision — it prepares a
// file and reports where it landed (a verdict-free prepare op, ADR-0077 D8).
//   swarm pull <ref>            snapshot a ticket into intake/<slug>.md (verbatim; gh-issue fetched)
//   swarm pull <ref> --force    overwrite an existing snapshot (else no-clobber)
//   swarm pull <ref> --json     machine output (the path + slug; never a verdict)

import { project, emit_error, usage_error, pull_intake } from '../../Core/useCases/index.ts';
import { fetch_gh_issue } from '../../Workspace/useCases/index.ts';
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
        return emit_error(usage_error('usage: swarm pull <ref> — a ticket ref (a gh issue, a URL, or a tracker key)'), json);
    }

    return project({
        result: pull_intake({ workspaceDir: cwd, ref, force, fetchGhIssue: fetch_gh_issue }),
        json,
        render: (report) =>
            report.fetched
                ? `pulled ${report.slug} (verbatim from gh)\n  ${report.path}`
                : `wrote intake snapshot ${report.slug} (paste placeholder — fill in the upstream body)\n  ${report.path}`,
    });
}
