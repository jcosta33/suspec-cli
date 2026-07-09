// `suspec store doctor` — the reconcile-only sweep (SPEC-suspec-v2 AC-018): terminal states
// derive from git/GitHub TRUTH, never from a judgment. For each ACTIVE spec/run in the store
// root, probe the terminal signals — the branch merged into the default branch, the worktree path
// gone (for work that demonstrably existed), the PR closed/merged (via the injected gh probe;
// skipped with a note when gh is absent) — and on ANY signal move the artifact to `archive/` via
// archive_artifact (same bytes, never a delete). A run whose branch/worktree never existed is an
// ORPHAN: listed, untouched. A live run with a fresh heartbeat is always left. No signal → left.
// The doctor never deletes, never judges content, and its command face always exits 0.

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import { ok, err, isErr, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { branch_exists, branch_merged, default_branch } from '../../Workspace/useCases/index.ts';
import { is_heartbeat_fresh, read_run_lock } from '../services/runArtifact.ts';
import { derive_worktree_names } from '../services/worktreeNames.ts';
import { archive_artifact } from './archiveArtifact.ts';

// The injected gh edge (Core never names the gh CLI): probe one branch's PR state.
// `available: false` = gh is not on PATH — the PR check is skipped, noted once.
export type PrStateProbe = (branch: string) => Readonly<{ available: boolean; state: string | null }>;

export type StoreDoctorInput = Readonly<{
    storeDir: string;
    repoRoot: string;
    prState: PrStateProbe;
    now?: () => Date;
}>;

export type DoctorRow = Readonly<{
    filename: string;
    kind: 'spec' | 'run';
    signal: string | null; // branch-merged | pr-closed | worktree-gone | null (no signal)
    action: 'archived' | 'orphan-listed' | 'left' | 'archive-failed';
    detail: string;
}>;

export type StoreDoctorReport = Readonly<{
    level: 'clean';
    storeDir: string;
    defaultBranch: string;
    artifacts: readonly DoctorRow[];
    orphans: readonly string[];
    ghAvailable: boolean;
    notes: readonly string[];
}>;

const SPEC_FILE = /^spec-(.+)\.md$/;
const RUN_FILE = /^run-(.+)\.md$/;

type Signals = Readonly<{ signal: string | null; orphan: boolean; detail: string }>;

type ProbeContext = {
    prState: PrStateProbe;
    ghAvailable: boolean;
    cache: Map<string, string | null>; // branch → PR state (null = no PR found)
};

// One PR probe per branch, and none at all once gh reported itself absent.
function pr_state_for(ctx: ProbeContext, branch: string): string | null {
    if (!ctx.ghAvailable) {
        return null;
    }
    if (ctx.cache.has(branch)) {
        return ctx.cache.get(branch) ?? null;
    }
    const probe = ctx.prState(branch);
    if (!probe.available) {
        ctx.ghAvailable = false;
        return null;
    }
    ctx.cache.set(branch, probe.state);
    return probe.state;
}

// The shared terminal-signal ladder. `worktreeRecorded` distinguishes "gone" from "never existed":
// a worktree only counts gone when the work demonstrably existed (its branch does).
function terminal_signals(
    ctx: ProbeContext,
    repoRoot: string,
    defaultBranch: string,
    branch: string | null,
    worktree: string | null,
    orphanEligible: boolean
): Signals {
    const branchExists = branch !== null && branch_exists(branch, repoRoot);
    if (branchExists && branch !== null && branch_merged(branch, defaultBranch, repoRoot)) {
        return { signal: 'branch-merged', orphan: false, detail: `${branch} is merged into ${defaultBranch}` };
    }
    const prState = branch !== null ? pr_state_for(ctx, branch) : null;
    if (prState === 'CLOSED' || prState === 'MERGED') {
        return { signal: 'pr-closed', orphan: false, detail: `the PR for ${branch ?? ''} is ${prState}` };
    }
    if (branchExists && worktree !== null && !existsSync(worktree)) {
        return { signal: 'worktree-gone', orphan: false, detail: `worktree ${worktree} no longer exists` };
    }
    // Orphan = NOTHING ever evidenced the work: no local branch, no worktree, and no PR either
    // (an OPEN PR proves the branch existed — that run is left, not orphaned).
    if (orphanEligible && !branchExists && prState === null && (worktree === null || !existsSync(worktree))) {
        return {
            signal: null,
            orphan: true,
            detail: `branch ${branch ?? '(none recorded)'} and worktree ${worktree ?? '(none recorded)'} never existed`,
        };
    }
    return { signal: null, orphan: false, detail: 'no terminal signal' };
}

function archive_row(storeDir: string, filename: string, kind: 'spec' | 'run', signals: Signals): DoctorRow {
    const archived = archive_artifact(storeDir, filename);
    return isErr(archived)
        ? { filename, kind, signal: signals.signal, action: 'archive-failed', detail: archived.error.message }
        : { filename, kind, signal: signals.signal, action: 'archived', detail: signals.detail };
}

export function store_doctor(input: StoreDoctorInput): Result<StoreDoctorReport, AppError> {
    let names: string[];
    try {
        names = readdirSync(input.storeDir).sort();
    } catch (cause) {
        return err(
            createAppError('store_unreadable', `could not read the store at ${input.storeDir}`, {}, cause)
        );
    }
    const defaultBranch = default_branch(input.repoRoot);
    const ctx: ProbeContext = { prState: input.prState, ghAvailable: true, cache: new Map() };
    const nowMs = (input.now ?? (() => new Date()))().getTime();
    const artifacts: DoctorRow[] = [];
    const orphans: string[] = [];

    for (const name of names) {
        const specMatch = SPEC_FILE.exec(name);
        const runMatch = RUN_FILE.exec(name);
        if (specMatch === null && runMatch === null) {
            continue;
        }
        let source: string;
        try {
            source = readFileSync(join(input.storeDir, name), 'utf8');
        } catch {
            continue; // a dir masquerading as an artifact — skip
        }
        if (runMatch !== null) {
            const lock = read_run_lock(source);
            if (lock.status === 'live' && is_heartbeat_fresh(lock.heartbeat, nowMs)) {
                artifacts.push({ filename: name, kind: 'run', signal: null, action: 'left', detail: 'live run' });
                continue;
            }
            const signals = terminal_signals(
                ctx,
                input.repoRoot,
                defaultBranch,
                lock.branch,
                lock.worktree,
                true
            );
            if (signals.orphan) {
                orphans.push(name);
                artifacts.push({ filename: name, kind: 'run', signal: null, action: 'orphan-listed', detail: signals.detail });
            } else if (signals.signal !== null) {
                artifacts.push(archive_row(input.storeDir, name, 'run', signals));
            } else {
                artifacts.push({ filename: name, kind: 'run', signal: null, action: 'left', detail: signals.detail });
            }
            continue;
        }
        // A spec never launched has no branch — that is a spec awaiting work, not an orphan.
        // (specMatch is non-null here: the run branch above `continue`d and the filter admitted
        // only spec/run names.)
        const derived = derive_worktree_names({ repoRoot: input.repoRoot, specSlug: specMatch![1] });
        const signals = terminal_signals(
            ctx,
            input.repoRoot,
            defaultBranch,
            derived.branch,
            derived.worktreePath,
            false
        );
        if (signals.signal !== null) {
            artifacts.push(archive_row(input.storeDir, name, 'spec', signals));
        } else {
            artifacts.push({ filename: name, kind: 'spec', signal: null, action: 'left', detail: signals.detail });
        }
    }

    const notes = ctx.ghAvailable ? [] : ['gh is not installed — PR-state checks skipped'];
    return ok({
        level: 'clean',
        storeDir: input.storeDir,
        defaultBranch,
        artifacts,
        orphans,
        ghAvailable: ctx.ghAvailable,
        notes,
    });
}
