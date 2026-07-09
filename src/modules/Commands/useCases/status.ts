#!/usr/bin/env node

// `suspec status` — the STORE summary for this repo (ADR-0137: the board is gone; the store is
// the state of record). Read-only: the active + archived artifacts with their ages, plus the
// `next` attention ranking (live runs, gate gaps, triage debt, ready specs). Writes nothing.
// `-i` opens the framed interactive view. When the store holds decayed items (expired keeps,
// dead-heartbeat runs, past-retention archive), ONE stderr line nudges toward
// `suspec store doctor` (SPEC-suspec-v2 AC-019) — the same shared hook `work` prints.

import { ok, isErr } from '../../../infra/errors/result.ts';
import {
    project,
    resolve_store_dir,
    list_store_artifacts,
    next_action,
    store_decay_note,
} from '../../Core/useCases/index.ts';
import { resolve_repo_root } from '../../Workspace/useCases/index.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';
import { format_store_status, run_status_flow, create_clack_prompter } from '../../Tui/useCases/index.ts';

// Synchronous: `status` only reads + renders (no prompts to await). The dispatcher awaits commands
// uniformly, so a plain exit code is fine here.
export function run(argv: string[], cwd: string = process.cwd()): number {
    const { flags } = parse_flags(argv, {
        booleans: ['--json', '-i', '--interactive'],
        strings: [],
    });
    const json = flags.get('json') === true;
    const interactive = flags.get('i') === true || flags.get('interactive') === true;

    /* v8 ignore start -- interactive dispatch is the thin shell; the flow logic is tested via the mock Prompter */
    if (interactive && process.stdout.isTTY === true && !json) {
        return run_status_flow(create_clack_prompter(), { cwd });
    }
    /* v8 ignore stop */

    // Status works without a git repo and without a store (AC-025): both read as an empty summary,
    // never an error. The store is PROBED — status never creates it.
    const rootResult = resolve_repo_root(cwd);
    const repoRoot = isErr(rootResult) ? cwd : rootResult.value;
    const store = resolve_store_dir({ repoRoot, probe: true });
    if (isErr(store)) {
        return project({
            result: ok({ level: 'clean' as const, active: [], archived: [], next: [] }),
            json,
            render: () =>
                'no store for this repo yet — `suspec write spec "<intent>"` starts one, `suspec work <SPEC>` runs it',
        });
    }
    const storeDir = store.value.storeDir;

    // AC-019: the ambient decay line — any miss (nothing decayed) is silence, never an error.
    const notes: string[] = [];
    const decayNote = store_decay_note(repoRoot);
    if (decayNote !== null) {
        notes.push(decayNote);
    }

    const listing = list_store_artifacts(storeDir);
    return project({
        result: ok({
            level: 'clean' as const,
            active: listing.active,
            archived: listing.archived,
            next: next_action({ storeDir }),
        }),
        json,
        notes,
        render: format_store_status,
    });
}
