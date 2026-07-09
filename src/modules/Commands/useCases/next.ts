#!/usr/bin/env node

// `suspec next` — the single most actionable item (SPEC-suspec-v2 AC-023). Reads ONLY the store
// (plus the local filesystem for worktree existence) — ZERO network, zero gh — and prints THE top
// item of the ranking the next_action engine computes (live-dead → reclaim/attach, live-fresh →
// attach/wait, gate gaps → evidence/done, triage debt → store doctor, ready/draft specs → work),
// plus the shared ambient decay line (AC-019, the same hook `work` and `status` print). Writes
// nothing — the store is probed, never created.
//   suspec next            the top item
//   suspec next --json     the FULL ranking, machine-readable
//
// Exits: 0 always when readable (an empty store is "nothing to do", not an error) · 2 outside a
// git repo.

import { isErr } from '../../../infra/errors/result.ts';
import { project, emit_error, resolve_store_dir, next_action, store_decay_note } from '../../Core/useCases/index.ts';
import { resolve_repo_root } from '../../Workspace/useCases/index.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';

export function run(argv: string[], cwd: string = process.cwd()): number {
    const { flags } = parse_flags(argv, { booleans: ['--json'], strings: [] });
    const json = flags.get('json') === true;

    const rootResult = resolve_repo_root(cwd);
    if (isErr(rootResult)) {
        return emit_error(rootResult.error, json);
    }
    const repoRoot = rootResult.value;

    // Probe-only: `next` is a read face — a repo that never resolved a store must stay untouched.
    const store = resolve_store_dir({ repoRoot, probe: true });
    const items = isErr(store) ? [] : next_action({ storeDir: store.value.storeDir });

    // AC-019: the ambient decay line — the same shared hook `work` and `status` wire.
    const notes: string[] = [];
    const decayNote = store_decay_note(repoRoot);
    if (decayNote !== null) {
        notes.push(decayNote);
    }

    const top = items.length > 0 ? items[0] : null;
    return project({
        result: { ok: true, value: { level: 'clean' as const, top, items } },
        json,
        notes,
        render: (v) =>
            v.top === null
                ? 'nothing actionable in the store — seed it: suspec write spec "<one-line intent>"'
                : `next: ${v.top.detail}\n  → ${v.top.action}`,
    });
}
