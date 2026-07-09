#!/usr/bin/env node

// `suspec new <type> …` — the split + scaffold surface:
//   suspec new task --from <SPEC> [--scope AC-001,AC-002]   SPLIT a store spec into a STORE task
//                                                           slice (scope copied, never invented)
//   suspec new change-plan <slug> [--title <t>] [--owner <o>]   scaffold a draft change plan
//                                                           into the STORE (change-plan-<slug>.md)
//   suspec new                                              the interactive flow (TTY)
//
// `new task` is the SPLIT tool (ADR-0103/0137): summon it when one spec fans out into N parallel
// slices, not as a default station. 1:1 work needs no task — implement against the spec and record
// the run in its append-only `## Execution` section. The slice lands IN THE STORE (task-<slug>.md)
// beside its spec — task packets are transient working memory, never repo files. Specs scaffold
// via `suspec write spec "<intent>"` — one scaffold, store-rooted.

import { isErr } from '../../../infra/errors/result.ts';
import {
    project,
    emit_error,
    usage_error,
    cut_task,
    resolve_store_dir,
    scaffold_change_plan,
} from '../../Core/useCases/index.ts';
import { resolve_repo_root } from '../../Workspace/useCases/index.ts';
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
        return run_new_flow(create_clack_prompter(), { cwd });
    }
    /* v8 ignore stop */

    if (type === 'task') {
        const fromFlag = flags.get('from');
        if (typeof fromFlag !== 'string') {
            return emit_error(
                usage_error('usage: suspec new task --from <SPEC> [--scope AC-001,AC-002] [--id <TASK-id>]'),
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
        // --id names a 2nd+ task from one spec (the default is TASK-<spec-slug>, which collides on
        // the second cut). Normalize to the canonical `TASK-<lower-slug>` shape so it keys the same
        // as the default everywhere downstream; cut_task still validates it as a path-safe segment
        // and refuses to clobber an existing slice.
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
        // The slice lands in the store — resolve it (created on first use; the spec lookup inside
        // cut_task errors cleanly when the spec is absent).
        const rootResult = resolve_repo_root(cwd);
        const repoRoot = isErr(rootResult) ? cwd : rootResult.value;
        const store = resolve_store_dir({ repoRoot });
        if (isErr(store)) {
            return emit_error(store.error, json);
        }
        return project({
            result: cut_task({
                storeDir: store.value.storeDir,
                specRef: fromFlag,
                scope,
                taskId,
                force: flags.get('force') === true,
            }),
            json,
            render: (report) => {
                let head = `cut ${report.taskId} (${String(report.scope.length)} scoped)\n  ${report.path}`;
                if (report.autoSuffixed) {
                    head += `\n  note: the default id was taken — auto-suffixed to ${report.taskId} (pass --id to name it yourself, or --force to replace the original slice).`;
                }
                // An empty scope cuts an UNBOUNDED task — easy to skim past a terse "(0 scoped)".
                // Say so loudly so nobody ships a task with no requirement ids bounding it.
                return report.scope.length === 0
                    ? `${head}\n  note: no --scope given — this task's scope is EMPTY (unbounded). Pass --scope AC-001,… or fill the Scope section before working.`
                    : head;
            },
        });
    }

    if (type === 'spec') {
        // The store scaffold is the ONE spec scaffold — never two divergent skeletons.
        return emit_error(
            usage_error(
                'specs scaffold with `suspec write spec "<one-line intent>"` (add --launch to dispatch the spec author)'
            ),
            json
        );
    }

    if (type === 'change-plan') {
        const slug = positional[1];
        if (slug === undefined) {
            return emit_error(usage_error('usage: suspec new change-plan <slug> [--title <t>] [--owner <o>]'), json);
        }
        const titleFlag = flags.get('title');
        const ownerFlag = flags.get('owner');
        // The plan lands in the store like every working artifact (ADR-0137) — resolve it
        // (created on first use), never a repo `change-plans/` tree.
        const rootResult = resolve_repo_root(cwd);
        const repoRoot = isErr(rootResult) ? cwd : rootResult.value;
        const store = resolve_store_dir({ repoRoot });
        if (isErr(store)) {
            return emit_error(store.error, json);
        }
        return project({
            result: scaffold_change_plan({
                storeDir: store.value.storeDir,
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
                'usage: suspec new <task|change-plan> — `new task --from <SPEC> [--scope …]` SPLITS a store spec into a store task slice (1:1 work needs no task), or `new change-plan <slug>`; specs scaffold via `suspec write spec "<intent>"`'
            ),
            json
        );
    }
    return emit_error(
        usage_error(`unknown new type: ${type} — use task | change-plan (specs: \`suspec write spec "<intent>"\`)`),
        json
    );
}
