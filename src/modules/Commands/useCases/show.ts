#!/usr/bin/env node

// `suspec show <spec|run|review|task|finding|intake|checks> [ref]` — a read-only projection of a
// parsed Suspec artifact, the loader surface suspec-mcp (ADR-0085) adapts over the `--json`
// contract. Thin: parse flags, resolve the store (PROBED — a read never creates it), call the
// reconcile-only `show_artifact` engine, project. Renders no verdict and writes nothing.
//   suspec show spec <id|slug>     the parsed spec (frontmatter, requirements + verify commands)
//   suspec show run <slug>         the run record (frontmatter + body)
//   suspec show review <id|slug>   the parsed review packet (status, coverage rows, verify blocks)
//   suspec show task <id|slug>     the parsed task packet (scope, affected areas, claimed changes)
//   suspec show finding <id>       the finding (severity, run, affected areas, body)
//   suspec show intake <slug>      the intake snapshot (frontmatter + body)
//   suspec show checks             the checks contract (version + the core checks)
//   suspec show <path.md>          a repo file directly (kind inferred from frontmatter `type:`)
//   --json                         machine output

import { isErr } from '../../../infra/errors/result.ts';
import { project, show_artifact, resolve_store_dir } from '../../Core/useCases/index.ts';
import { resolve_repo_root } from '../../Workspace/useCases/index.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';

export function run(argv: string[], cwd: string = process.cwd()): number {
    const { positional, flags } = parse_flags(argv, { booleans: ['--json'], strings: [] });
    const json = flags.get('json') === true;
    const kind = positional[0] ?? '';
    const ref = positional[1];

    // Artifacts live in the store (ADR-0137). Probe-only: `show` reads — a repo that never
    // launched anything is left byte-untouched, and the store kinds report "no store yet".
    const rootResult = resolve_repo_root(cwd);
    const repoRoot = isErr(rootResult) ? cwd : rootResult.value;
    const store = resolve_store_dir({ repoRoot, probe: true });

    return project({
        result: show_artifact({
            storeDir: isErr(store) ? null : store.value.storeDir,
            repoDir: cwd,
            kind,
            ref,
        }),
        json,
        render: (result) => JSON.stringify(result.value, null, 2),
    });
}
