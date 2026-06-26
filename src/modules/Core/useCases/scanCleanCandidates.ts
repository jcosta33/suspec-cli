// ReconcileEngine — `corpus clean` (SPEC-corpus-clean, ADR-0106 item 2). Read-only v0: scan the
// ephemeral artifact dirs (tasks/, reviews/) and report which files are SPENT — their work reached a
// terminal status — and so are prune candidates. Reads the filesystem; writes nothing. The destructive
// --apply (delete the gitignored / archive the committed) is deferred until the prune-window policy is
// ratified (SPEC-corpus-clean D1). NEVER reads the durable set (specs, findings, decisions, the board)
// — this scan only ever opens tasks/ and reviews/.

import { readdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { ok, type Result } from '../../../infra/errors/result.ts';
import type { AppError } from '../../../infra/errors/createAppError.ts';
import { read_frontmatter, fm_scalar } from '../services/readFrontmatter.ts';
import type { OutcomeLevel } from './unixOutcome.ts';

export type CleanKind = 'task' | 'review';

export type CleanCandidate = Readonly<{
    path: string; // workspace-relative path, e.g. `reviews/foo.md`
    kind: CleanKind;
    id: string | null; // the frontmatter id, or null when absent
    status: string; // the terminal status that made it spent
}>;

export type CleanReport = Readonly<{
    // Always `clean`: this is a read-only advisory report, never a finding/verdict.
    level: OutcomeLevel;
    candidates: readonly CleanCandidate[]; // spent ephemeral artifacts (prune candidates)
    keptCount: number; // live ephemeral artifacts left in place (not spent)
}>;

export type ScanCleanInput = Readonly<{ workspaceDir: string }>;

// Terminal (spent) statuses by ephemeral kind — the work is done, so the artifact is a prune
// candidate. task: `closed` (the task status_enum's terminal value). review: `pass` | `waived` (the
// review is resolved/merged). Any live status (running, review-ready, draft, needs-human, blocked,
// …) is KEPT — never a candidate, so an in-flight artifact is never proposed for pruning.
const TERMINAL: Record<CleanKind, ReadonlySet<string>> = {
    task: new Set(['closed']),
    review: new Set(['pass', 'waived']),
};

function scan_dir(
    workspaceDir: string,
    dir: 'tasks' | 'reviews',
    kind: CleanKind,
    out: CleanCandidate[],
    counters: { kept: number }
): void {
    const abs = join(workspaceDir, dir);
    if (!existsSync(abs)) {
        return;
    }
    for (const name of readdirSync(abs).sort()) {
        // A `*/README.md` placeholder is never a prune candidate; non-markdown is ignored.
        if (!name.endsWith('.md') || name === 'README.md') {
            continue;
        }
        const fm = read_frontmatter(readFileSync(join(abs, name), 'utf8'));
        const status = fm_scalar(fm.status) ?? '';
        if (TERMINAL[kind].has(status)) {
            out.push({ path: `${dir}/${name}`, kind, id: fm_scalar(fm.id) ?? null, status });
        } else {
            counters.kept += 1;
        }
    }
}

export function scan_clean_candidates(input: ScanCleanInput): Result<CleanReport, AppError> {
    const candidates: CleanCandidate[] = [];
    const counters = { kept: 0 };
    scan_dir(input.workspaceDir, 'tasks', 'task', candidates, counters);
    scan_dir(input.workspaceDir, 'reviews', 'review', candidates, counters);
    return ok({ level: 'clean', candidates, keptCount: counters.kept });
}
