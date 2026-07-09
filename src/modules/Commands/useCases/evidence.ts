#!/usr/bin/env node

// `suspec evidence add <RUN> --ac <AC-id> -- <command…>` — cli-verified evidence capture
// (SPEC-suspec-v2 AC-010/AC-012). The CLI runs the command ITSELF in the run's worktree (a bare
// binary + args, no shell), stores the raw output + the record under the store's
// `evidence/<run>/`, stamps `provenance: cli-verified` with the capture cross-check block and the
// AC-012 staleness digest, and appends a row to the run file's evidence table. Evidence written
// any other way records `provenance: agent`/`dev` — the lint (AC-013) flags a hand-authored
// cli-verified claim.
//   suspec evidence add <RUN> --ac AC-003 -- pnpm test:run     capture one verify command
//   suspec evidence add <RUN> --ac AC-003 --json -- <cmd…>     machine output
//
// Exits: MIRRORS the captured command — 0 when it exited 0, 1 when it failed (the record is
// written either way; a failing run is evidence too); 2 usage / no such run / the command could
// not execute at all (nothing written).

import { isErr } from '../../../infra/errors/result.ts';
import {
    project,
    emit_error,
    usage_error,
    is_safe_segment,
    resolve_store_dir,
    add_evidence,
} from '../../Core/useCases/index.ts';
import { resolve_repo_root, capture_command, worktree_diff_digest } from '../../Workspace/useCases/index.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';

const USAGE = 'usage: suspec evidence add <RUN> --ac <AC-id> [--json] -- <command…>';
const AC_ID = /^[A-Z][A-Z0-9]*-\d+$/;

export function run(argv: string[], cwd: string = process.cwd()): number {
    const { positional, flags } = parse_flags(argv, { booleans: ['--json'], strings: ['--ac'] });
    const json = flags.get('json') === true;

    // The shape: `add <RUN>` before the `--`, the command after it (parse_flags keeps everything
    // past `--` positional, dashes included).
    if (positional[0] !== 'add') {
        return emit_error(usage_error(USAGE), json);
    }
    const runRef = positional[1];
    if (runRef === undefined || !is_safe_segment(runRef)) {
        return emit_error(usage_error(`${USAGE}\n  <RUN> is a run slug, never a path`), json);
    }
    const acFlag = flags.get('ac');
    if (typeof acFlag !== 'string' || !AC_ID.test(acFlag)) {
        return emit_error(
            usage_error(`${USAGE}\n  --ac names the acceptance criterion the evidence maps to (e.g. AC-003)`),
            json
        );
    }
    const command = positional.slice(2);
    if (command.length === 0) {
        return emit_error(usage_error(`${USAGE}\n  nothing to capture — pass the command after --`), json);
    }

    const rootResult = resolve_repo_root(cwd);
    if (isErr(rootResult)) {
        return emit_error(rootResult.error, json);
    }
    const store = resolve_store_dir({ repoRoot: rootResult.value });
    if (isErr(store)) {
        return emit_error(store.error, json);
    }

    // The engine captures + writes; the impure edges (spawn, git hash) are the Workspace functions.
    return project({
        result: add_evidence({
            storeDir: store.value.storeDir,
            runSlug: runRef,
            ac: acFlag,
            command,
            capture: capture_command,
            diffDigest: worktree_diff_digest,
        }),
        json,
        render: (value) =>
            `evidence recorded — ${value.ac} · exit ${value.exit} · ${value.provenance}\n` +
            `  command:  ${value.command}\n` +
            `  record:   ${value.evidencePath}\n` +
            `  raw:      ${value.capturePath} (stays in the store)`,
    });
}
