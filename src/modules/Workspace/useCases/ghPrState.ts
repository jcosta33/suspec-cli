// Probe one branch's PR STATE via the gh CLI (SPEC-suspec-v2 AC-018) — the read-only edge
// `store doctor` injects into the Core sweep. Unlike find_open_pr (which only cares about an
// OPEN PR to comment on), doctor needs the terminal states too: `gh pr view <branch> --json
// state` reports OPEN / CLOSED / MERGED for the branch's PR. Deliberately NOT a Result — a
// missing gh is `available: false` (the check is skipped, noted), and "no PR" is a null state;
// neither is an error for a reconciler.

import { spawnSync } from 'child_process';

export type PrStateProbeResult = Readonly<{ available: boolean; state: string | null }>;

export function probe_pr_state(branch: string, cwd: string): PrStateProbeResult {
    const result = spawnSync('gh', ['pr', 'view', branch, '--json', 'state'], { cwd, encoding: 'utf8' });
    if (result.error) {
        return { available: false, state: null }; // gh is not installed — the caller notes and skips
    }
    if (result.status !== 0) {
        return { available: true, state: null }; // no PR for this branch — a non-event
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse((result.stdout || '').trim());
    } catch {
        return { available: true, state: null };
    }
    if (typeof parsed !== 'object' || parsed === null) {
        return { available: true, state: null };
    }
    const state = (parsed as Record<string, unknown>).state;
    return { available: true, state: typeof state === 'string' ? state : null };
}
