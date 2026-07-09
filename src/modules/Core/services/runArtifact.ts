// The store run file's CLI-owned face (SPEC-suspec-v2 AC-006/AC-008). `suspec work` creates
// `run-<slug>.md` in the store at launch; its FRONTMATTER is the run record + lock: type, spec id,
// worktree, branch, base_sha, `status: live`, and the pid + heartbeat timestamp the live-run lock
// keys on. The BODY belongs to the agent (the prompt tells it to append run/evidence notes there
// directly — AC-006), so every rewrite here goes through upsert_frontmatter and preserves the body
// byte-for-byte. PURE (strings in, strings out); the atomic write lives in write_store_artifact.

import { fm_scalar, read_frontmatter, upsert_frontmatter } from './readFrontmatter.ts';

// A heartbeat older than this is DEAD: the lock is reported reclaimable and a relaunch may take it
// (AC-008's default threshold, 15 minutes).
export const HEARTBEAT_FRESH_MS = 15 * 60 * 1000;

export type RunRecordFields = Readonly<{
    specId: string;
    worktree: string;
    branch: string;
    baseSha: string | null; // repo HEAD at launch; null in a repo with no commits (line omitted)
    pid: number;
    heartbeat: string; // ISO timestamp, stamped at launch
}>;

// The full content of a FRESH run file. grammar_version is injected by write_store_artifact
// (AC-003) — this service builds only the fields it owns.
export function build_run_content(fields: RunRecordFields): string {
    const frontmatter = [
        '---',
        'type: run',
        `spec: ${fields.specId}`,
        `worktree: ${fields.worktree}`,
        `branch: ${fields.branch}`,
        ...(fields.baseSha !== null ? [`base_sha: ${fields.baseSha}`] : []),
        'status: live',
        `pid: ${fields.pid}`,
        `heartbeat: ${fields.heartbeat}`,
        '---',
    ];
    const body = [
        '',
        `# Run — ${fields.specId}`,
        '',
        'Append run and evidence notes below as you work: commands run, verbatim output, files',
        'changed, blockers. The CLI owns only the frontmatter above; the body is yours.',
        '',
    ];
    return [...frontmatter, ...body].join('\n');
}

// A check-my-work run file (SPEC-suspec-v2 AC-021, written only under `--save`): the same run
// grammar, keyed on the stated INTENT instead of a driving spec — check-my-work reviews the
// current repo diff, so there is no `spec:` to record. The worktree is the repo itself; the lock
// fields (status/pid/heartbeat) are stamped like any run so a crash mid-gate reads reclaimable,
// and the command releases them with finish_run_content when the gate completes.
export type CheckRunFields = Readonly<{
    intent: string; // whitespace-collapsed by the command — frontmatter stays one line
    worktree: string; // the repo root — check-my-work runs where the developer works
    branch: string | null;
    baseSha: string | null;
    pid: number;
    heartbeat: string; // ISO timestamp
}>;

export function build_check_run_content(fields: CheckRunFields): string {
    const frontmatter = [
        '---',
        'type: run',
        `intent: ${fields.intent}`,
        `worktree: ${fields.worktree}`,
        ...(fields.branch !== null ? [`branch: ${fields.branch}`] : []),
        ...(fields.baseSha !== null ? [`base_sha: ${fields.baseSha}`] : []),
        'status: live',
        `pid: ${fields.pid}`,
        `heartbeat: ${fields.heartbeat}`,
        '---',
    ];
    const body = [
        '',
        `# Check-my-work — ${fields.intent}`,
        '',
        'Saved by `suspec check-my-work --save`: the gate captures below are the record of the',
        'verify commands run against the working tree at this point.',
        '',
    ];
    return [...frontmatter, ...body].join('\n');
}

// The lock fields a second `suspec work` reads to decide refuse / reclaim (AC-008).
export type RunLock = Readonly<{
    status: string | null;
    pid: number | null;
    heartbeat: string | null;
    worktree: string | null;
    branch: string | null; // the launch-recorded branch — `done`'s PR probe (AC-014) keys on it
}>;

export function read_run_lock(content: string): RunLock {
    const fm = read_frontmatter(content);
    const pidRaw = fm_scalar(fm.pid);
    const pid = pidRaw === undefined ? Number.NaN : Number.parseInt(pidRaw, 10);
    return {
        status: fm_scalar(fm.status) ?? null,
        pid: Number.isNaN(pid) ? null : pid,
        heartbeat: fm_scalar(fm.heartbeat) ?? null,
        worktree: fm_scalar(fm.worktree) ?? null,
        branch: fm_scalar(fm.branch) ?? null,
    };
}

// Fresh = the recorded heartbeat parses and is younger than the threshold. A missing or
// unparseable heartbeat reads DEAD — a lock that cannot prove liveness never blocks a relaunch.
export function is_heartbeat_fresh(
    heartbeat: string | null,
    nowMs: number,
    thresholdMs: number = HEARTBEAT_FRESH_MS
): boolean {
    if (heartbeat === null) {
        return false;
    }
    const at = Date.parse(heartbeat);
    if (Number.isNaN(at)) {
        return false;
    }
    return nowMs - at < thresholdMs;
}

// Re-take an EXISTING run file for a relaunch (a dead-heartbeat reclaim, or a re-run after the
// previous run exited): re-stamp the lock + launch facts, preserving the agent-written body.
export function reclaim_run_content(content: string, fields: RunRecordFields): string {
    return upsert_frontmatter(content, {
        worktree: fields.worktree,
        branch: fields.branch,
        ...(fields.baseSha !== null ? { base_sha: fields.baseSha } : {}),
        status: 'live',
        pid: String(fields.pid),
        heartbeat: fields.heartbeat,
    });
}

// The runner exited: release the lock and record the exit as a fact (never a verdict). When the
// run reached a TERMINAL status mid-session (`suspec done` marked it done, or an abort landed),
// the post-run release must not downgrade it back to `exited` — the exit code is still recorded
// (a harmless fact), the status is left standing.
export function finish_run_content(content: string, exit: number): string {
    const status = read_run_lock(content).status;
    if (status === 'done' || status === 'aborted') {
        return upsert_frontmatter(content, { exit: String(exit) });
    }
    return upsert_frontmatter(content, { status: 'exited', exit: String(exit) });
}

// The runner could not be launched at all: release the lock so the failed attempt never leaves a
// live lock blocking the next `work` (the command still exits 2).
export function abort_run_content(content: string): string {
    return upsert_frontmatter(content, { status: 'aborted' });
}

// The gate passed (or was explicitly accepted): mark the run done (SPEC-suspec-v2 AC-011). An
// acceptance stamps its reason beside the status — the waiver is a recorded fact, never silent.
export function done_run_content(content: string, acceptedFailing: string | null): string {
    return upsert_frontmatter(content, {
        status: 'done',
        ...(acceptedFailing !== null ? { accepted_failing: acceptedFailing } : {}),
    });
}
