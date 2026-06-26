#!/usr/bin/env node

// `corpus stamp <ref>` — write the provenance stamp that makes staleness detection live (ADR-0107/0108).
// A SPEC gets `snapshot:` = the code repo's current HEAD; a REVIEW gets `reviewed_sha:` = HEAD +
// `evidence_hash:` = the reconcile's evidence digest. In-place frontmatter upsert; nothing else touched.
//   corpus stamp <spec-id|slug>          stamp the spec's snapshot SHA
//   corpus stamp <review-file|slug>      stamp the review's reviewed_sha + evidence_hash
//   corpus stamp <ref> --repo <path>     stamp against a SEPARATE code repo (dedicated-workspace layout)

import { resolve } from 'path';

import { isErr } from '../../../infra/errors/result.ts';
import { project, emit_error, usage_error, stamp_artifact } from '../../Core/useCases/index.ts';
import { resolve_repo_root } from '../../Workspace/useCases/index.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';

export function run(argv: string[], cwd: string = process.cwd()): number {
    const { positional, flags } = parse_flags(argv, { booleans: ['--json'], strings: ['--repo'] });
    const json = flags.get('json') === true;
    const ref = positional[0];
    if (ref === undefined) {
        return emit_error(usage_error('usage: corpus stamp <spec|review> [--repo <code-repo>]'), json);
    }

    const repoFlag = flags.get('repo');
    if (typeof repoFlag === 'string' && repoFlag.startsWith('-')) {
        return emit_error(usage_error(`invalid --repo value: "${repoFlag}" — expected a path to the code repo`), json);
    }
    let repoRoot: string;
    if (typeof repoFlag === 'string') {
        repoRoot = resolve(cwd, repoFlag);
    } else {
        const rootResult = resolve_repo_root(cwd);
        if (isErr(rootResult)) {
            return emit_error(rootResult.error, json);
        }
        repoRoot = rootResult.value;
    }

    return project({
        result: stamp_artifact({ workspaceDir: cwd, repoRoot, ref }),
        json,
        render: (report) =>
            `stamped ${report.kind} ${report.path}\n${Object.entries(report.stamped)
                .map(([key, value]) => `  ${key}: ${value}`)
                .join('\n')}`,
    });
}
