#!/usr/bin/env node

// `swarm promote <task>` — the prepare engine's finding-scaffold command surface (W5, AC-002/AC-005).
// Thin: scaffold one `findings/<slug>.md` from a finished task/review id and report its path. It
// pre-fills `from:` and leaves the *what-we-learned* body a placeholder — it asserts no learning of
// its own — and it writes NO board and emits no review result/board-flip/merge decision (a
// verdict-free prepare op, ADR-0077 D8). The board-mutating close stays parked (ADR-0084 D3).
//   swarm promote <task>            scaffold findings/<slug>.md (from: pre-filled, learning left blank)
//   swarm promote <task> --force    overwrite an existing finding (else no-clobber)
//   swarm promote <task> --json     machine output (the path + slug; never a verdict)

import { project, emit_error, usage_error, scaffold_finding } from '../../Core/useCases/index.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';

export function run(argv: string[], cwd: string = process.cwd()): number {
    const { positional, flags } = parse_flags(argv, {
        booleans: ['--json', '--force'],
        strings: [],
    });
    const json = flags.get('json') === true;
    const force = flags.get('force') === true;
    const task = positional[0];

    if (task === undefined) {
        return emit_error(
            usage_error('usage: swarm promote <task> — the task/review id the finding is promoted from'),
            json
        );
    }

    return project({
        result: scaffold_finding({ workspaceDir: cwd, from: task, force }),
        json,
        render: (report) =>
            `scaffolded candidate finding ${report.slug} (from ${report.from} — fill in what we learned)\n  ${report.path}`,
    });
}
