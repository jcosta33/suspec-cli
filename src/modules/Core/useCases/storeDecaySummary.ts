// The ambient decay scan (SPEC-suspec-v2 AC-019): how much of the repo's store has gone stale —
// findings whose keep/defer `expires:` date passed, runs still claiming `status: live` on a dead
// heartbeat, and archived artifacts past the gc retention window. The surfaces (`work`, `status`,
// and `next`) print ONE line via decay_line when the total is nonzero; the fix is always
// `suspec store doctor` / `store gc`, never automatic. Read-only.

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import { fm_scalar, read_frontmatter } from '../services/readFrontmatter.ts';
import { is_heartbeat_fresh, read_run_lock } from '../services/runArtifact.ts';
import { archive_dir } from '../services/storeLayout.ts';
import { DEFAULT_RETENTION_DAYS } from './readStoreSettings.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const FINDING_FILE = /^finding-.+\.md$/;
const RUN_FILE = /^run-.+\.md$/;

export type StoreDecaySummary = Readonly<{
    expiredFindings: number; // kept/deferred findings whose `expires:` date passed
    staleRuns: number; // `status: live` runs with a dead heartbeat
    pastRetentionArchived: number; // archive/ items older than the retention window
    total: number;
}>;

export type StoreDecayOptions = Readonly<{ now?: Date; retentionDays?: number }>;

// The one-line surface hook: `N stale — suspec store doctor`, or null when nothing decayed.
export function decay_line(summary: StoreDecaySummary): string | null {
    return summary.total > 0 ? `${summary.total} stale — suspec store doctor` : null;
}

export function store_decay_summary(storeDir: string, opts: StoreDecayOptions = {}): StoreDecaySummary {
    const now = opts.now ?? new Date();
    const retentionDays = opts.retentionDays ?? DEFAULT_RETENTION_DAYS;
    let expiredFindings = 0;
    let staleRuns = 0;
    let pastRetentionArchived = 0;

    if (existsSync(storeDir)) {
        for (const name of readdirSync(storeDir)) {
            const isFinding = FINDING_FILE.test(name);
            const isRun = RUN_FILE.test(name);
            if (!isFinding && !isRun) {
                continue;
            }
            let source: string;
            try {
                source = readFileSync(join(storeDir, name), 'utf8');
            } catch {
                continue; // a dir masquerading as an artifact — skip
            }
            if (isFinding) {
                const expires = fm_scalar(read_frontmatter(source).expires);
                if (expires !== undefined) {
                    const at = Date.parse(expires);
                    if (!Number.isNaN(at) && at < now.getTime()) {
                        expiredFindings += 1;
                    }
                }
            } else {
                // The run lock read goes through the same reader `store doctor` uses — one
                // parser for the lock fields, not two ad-hoc frontmatter reads.
                const lock = read_run_lock(source);
                if (lock.status === 'live' && !is_heartbeat_fresh(lock.heartbeat, now.getTime())) {
                    staleRuns += 1;
                }
            }
        }
    }

    const archive = archive_dir(storeDir);
    if (existsSync(archive)) {
        const cutoff = now.getTime() - retentionDays * DAY_MS;
        for (const name of readdirSync(archive)) {
            let stat;
            try {
                stat = statSync(join(archive, name));
                /* v8 ignore next 3 -- a race: the entry vanished between readdir and stat */
            } catch {
                continue;
            }
            if (stat.isFile() && stat.mtimeMs < cutoff) {
                pastRetentionArchived += 1;
            }
        }
    }

    return {
        expiredFindings,
        staleRuns,
        pastRetentionArchived,
        total: expiredFindings + staleRuns + pastRetentionArchived,
    };
}
