#!/usr/bin/env node

// `suspec new <type> …` — the prepare engine's command surface (AC-013, D-004):
//   suspec new task --from <SPEC-id> [--scope AC-001,AC-002]   SPLIT a spec into a slice (scope copied, never invented)
//   suspec new spec <slug> [--title <t>] [--owner <o>]          scaffold a fresh draft spec
//   suspec new                                                  the interactive flow (TTY)
//
// `new task` is the SPLIT tool (ADR-0103): summon it when one spec fans out into N parallel slices, not
// as a default station. 1:1 work needs no task — implement against the spec and record the run in its
// append-only `## Execution` section. The spec is the unit; the task is an on-demand subdivision.

import {
    project,
    emit_error,
    usage_error,
    cut_packet,
    scaffold_spec,
    scaffold_change_plan,
} from '../../Core/useCases/index.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';
import { run_new_flow, create_clack_prompter } from '../../Tui/useCases/index.ts';

export async function run(argv: string[], cwd: string = process.cwd()): Promise<number> {
    const { positional, flags } = parse_flags(argv, {
        booleans: ['--json', '-i', '--interactive', '--force'],
        strings: ['--from', '--scope', '--title', '--owner', '--id'],
    });
    const json = flags.get('json') === true;
    const interactive = flags.get('i') === true || flags.get('interactive') === true;
    const type = positional[0];

    /* v8 ignore start -- interactive dispatch is the thin shell; the flow logic is tested via the mock Prompter */
    if ((interactive || type === undefined) && process.stdout.isTTY === true && !json) {
        return run_new_flow(create_clack_prompter(), { workspaceDir: cwd });
    }
    /* v8 ignore stop */

    if (type === 'task') {
        const fromFlag = flags.get('from');
        if (typeof fromFlag !== 'string') {
            return emit_error(
                usage_error('usage: suspec new task --from <SPEC-id> [--scope AC-001,AC-002] [--id <TASK-id>]'),
                json
            );
        }
        const scopeFlag = flags.get('scope');
        const scope =
            typeof scopeFlag === 'string'
                ? scopeFlag
                      .split(',')
                      .map((id) => id.trim())
                      .filter((id) => id.length > 0)
                : [];
        // --id names a 2nd+ task from one spec (the default is TASK-<spec-slug>, which collides on the
        // second cut). Normalize to the canonical `TASK-<lower-slug>` shape so it keys the same as the
        // default everywhere downstream (status, the worktree branch tail, resolve_task); cut_packet
        // still validates it as a path-safe segment and refuses to clobber an existing packet.
        const idFlag = flags.get('id');
        let taskId: string | undefined;
        if (typeof idFlag === 'string') {
            const slug = idFlag
                .replace(/^TASK-/i, '')
                .toLowerCase()
                .trim();
            if (slug.length === 0) {
                return emit_error(usage_error('--id needs a task slug, e.g. --id checkout-discount'), json);
            }
            taskId = `TASK-${slug}`;
        }
        return project({
            result: cut_packet({
                workspaceDir: cwd,
                specId: fromFlag,
                scope,
                taskId,
                force: flags.get('force') === true,
            }),
            json,
            render: (report) => {
                let head = `cut ${report.taskId} (${String(report.scope.length)} scoped)\n  ${report.path}`;
                if (report.autoSuffixed) {
                    head += `\n  note: the default id was taken — auto-suffixed to ${report.taskId} (pass --id to name it yourself, or --force to replace the original packet).`;
                }
                // R4-ISS-09: an empty scope cuts an UNBOUNDED task — easy to skim past a terse "(0 scoped)".
                // Say so loudly so a new hire doesn't ship a task with no requirement ids bounding it.
                return report.scope.length === 0
                    ? `${head}\n  note: no --scope given — this task's scope is EMPTY (unbounded). Pass --scope AC-001,… or fill the Scope section before working.`
                    : head;
            },
        });
    }

    if (type === 'spec') {
        const slug = positional[1];
        if (slug === undefined) {
            return emit_error(usage_error('usage: suspec new spec <slug> [--title <t>] [--owner <o>]'), json);
        }
        const titleFlag = flags.get('title');
        const ownerFlag = flags.get('owner');
        return project({
            result: scaffold_spec({
                workspaceDir: cwd,
                slug,
                title: typeof titleFlag === 'string' ? titleFlag : undefined,
                owner: typeof ownerFlag === 'string' ? ownerFlag : undefined,
            }),
            json,
            render: (report) => {
                const head = `scaffolded ${report.specId}\n  ${report.path}`;
                if (report.ordinalClash === undefined) {
                    return head;
                }
                const { ordinal, existingSlug, nextFree } = report.ordinalClash;
                return `${head}\n  note: ordinal ${ordinal} already used by "${existingSlug}" — duplicate ordinal; next free is ${nextFree}`;
            },
        });
    }

    if (type === 'change-plan') {
        const slug = positional[1];
        if (slug === undefined) {
            return emit_error(usage_error('usage: suspec new change-plan <slug> [--title <t>] [--owner <o>]'), json);
        }
        const titleFlag = flags.get('title');
        const ownerFlag = flags.get('owner');
        return project({
            result: scaffold_change_plan({
                workspaceDir: cwd,
                slug,
                title: typeof titleFlag === 'string' ? titleFlag : undefined,
                owner: typeof ownerFlag === 'string' ? ownerFlag : undefined,
            }),
            json,
            render: (report) => `scaffolded ${report.changePlanId}\n  ${report.path}`,
        });
    }

    if (type === undefined) {
        return emit_error(
            usage_error(
                'usage: suspec new <task|spec|change-plan> — `new task --from <SPEC-id> [--scope …]` SPLITS a spec into a slice (1:1 work needs no task — record the run in the spec\'s `## Execution`), `new spec <slug>`, or `new change-plan <slug>`'
            ),
            json
        );
    }
    return emit_error(usage_error(`unknown new type: ${type} — use task | spec | change-plan`), json);
}
