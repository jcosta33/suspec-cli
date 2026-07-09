// `suspec next`'s ranking engine (SPEC-suspec-v2 AC-023): read ONLY the store (plus the local
// filesystem for worktree existence) and rank what deserves attention, most actionable first —
// ZERO network, zero gh, by construction (nothing here spawns anything). The ranking:
//   1. a `status: live` run whose heartbeat is DEAD          → reclaim / attach
//   2. a `status: live` run whose heartbeat is fresh         → attach or wait
//   3. a finished-but-not-done run whose spec has ACs        → add evidence / done
//      lacking an exit-0 evidence record
//   4. untriaged findings / expired keeps in the store root  → triage (store doctor / done)
//   5. a ready/draft spec not already surfaced above         → work <id>
// The command prints the TOP item (+ the shared decay line); --json carries the full ranking.
// Read-only; a missing store reads as an empty ranking, never an error.

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import { isOk } from '../../../infra/errors/result.ts';
import { parse_spec_record } from '../../Sol/useCases/index.ts';
import { fm_scalar, read_frontmatter } from '../services/readFrontmatter.ts';
import { is_heartbeat_fresh, read_run_lock } from '../services/runArtifact.ts';
import { find_store_spec } from './findStoreSpec.ts';
import { list_evidence_records } from './listEvidenceRecords.ts';

export type NextItem = Readonly<{
    rank: 1 | 2 | 3 | 4 | 5;
    kind: 'reclaim-run' | 'live-run' | 'gate-gaps' | 'triage' | 'spec';
    ref: string; // the run slug / spec id / 'findings'
    detail: string; // what is going on, one line
    action: string; // the suggested next command(s), one line
}>;

export type NextActionInput = Readonly<{ storeDir: string; now?: Date }>;

const RUN_FILE = /^run-(.+)\.md$/;
const SPEC_FILE = /^spec-(.+)\.md$/;
const FINDING_FILE = /^finding-.+\.md$/;

// The store-root artifacts, read defensively: an unreadable entry is skipped, never an error.
function read_entries(storeDir: string): { name: string; source: string }[] {
    if (!existsSync(storeDir)) {
        return [];
    }
    const entries: { name: string; source: string }[] = [];
    for (const name of readdirSync(storeDir).sort()) {
        if (!name.endsWith('.md')) {
            continue;
        }
        try {
            entries.push({ name, source: readFileSync(join(storeDir, name), 'utf8') });
        } catch {
            continue; // a dir masquerading as an artifact — skip
        }
    }
    return entries;
}

// The AC ids of a run's driving spec that lack ANY exit-0 evidence record mapped to them. Null
// when the run names no resolvable/parseable spec, or the spec declares no requirements — there
// is no gate to have gaps then (a spec-less check-my-work run never ranks here).
function gate_gaps(storeDir: string, runSlug: string, specId: string | null): string[] | null {
    if (specId === null) {
        return null;
    }
    const spec = find_store_spec(storeDir, specId);
    if (spec === null) {
        return null;
    }
    const parsed = parse_spec_record({ source: spec.source, path: spec.path });
    if (!isOk(parsed) || parsed.value.requirements.length === 0) {
        return null;
    }
    const satisfied = new Set(
        list_evidence_records(storeDir, runSlug)
            .filter((record) => record.exit === 0 && record.ac !== null)
            .map((record) => record.ac)
    );
    return parsed.value.requirements.map((requirement) => requirement.id).filter((id) => !satisfied.has(id));
}

export function next_action(input: NextActionInput): NextItem[] {
    const now = input.now ?? new Date();
    const entries = read_entries(input.storeDir);
    const items: NextItem[] = [];
    const surfacedSpecs = new Set<string>();

    // --- runs: ranks 1 (dead-live), 2 (fresh-live), 3 (finished with gate gaps) -----------------
    for (const entry of entries) {
        const match = RUN_FILE.exec(entry.name);
        if (match === null) {
            continue;
        }
        const runSlug = match[1];
        const lock = read_run_lock(entry.source);
        const specId = fm_scalar(read_frontmatter(entry.source).spec) ?? null;
        if (specId !== null) {
            surfacedSpecs.add(specId);
        }
        if (lock.status === 'live') {
            const worktreeGone = lock.worktree === null || !existsSync(lock.worktree);
            if (is_heartbeat_fresh(lock.heartbeat, now.getTime())) {
                items.push({
                    rank: 2,
                    kind: 'live-run',
                    ref: runSlug,
                    detail: `a live run holds ${specId ?? runSlug} (pid ${lock.pid ?? 'unknown'}, heartbeat fresh)`,
                    action: `attach to your runner's session in ${lock.worktree ?? 'its worktree'}, or wait for it to finish`,
                });
            } else {
                items.push({
                    rank: 1,
                    kind: 'reclaim-run',
                    ref: runSlug,
                    detail: `run ${runSlug} still claims live but its heartbeat is dead${worktreeGone ? ' (worktree gone)' : ''}`,
                    action:
                        specId !== null
                            ? `reclaim it: suspec work ${specId} (relaunch takes the lock) — or attach if the session is really alive`
                            : 'reclaim it: suspec store doctor',
                });
            }
            continue;
        }
        if (lock.status !== 'done') {
            const gaps = gate_gaps(input.storeDir, runSlug, specId);
            if (gaps !== null && gaps.length > 0) {
                items.push({
                    rank: 3,
                    kind: 'gate-gaps',
                    ref: runSlug,
                    detail: `run ${runSlug} finished but ${gaps.length} AC(s) lack exit-0 evidence (${gaps.join(', ')})`,
                    action: `capture it: suspec evidence add ${runSlug} --ac <AC> -- <command>, then suspec done ${runSlug}`,
                });
            }
        }
    }

    // --- rank 4: untriaged findings / expired keeps ---------------------------------------------
    let untriaged = 0;
    let expired = 0;
    for (const entry of entries) {
        if (!FINDING_FILE.test(entry.name)) {
            continue;
        }
        const expires = fm_scalar(read_frontmatter(entry.source).expires);
        if (expires === undefined) {
            untriaged += 1;
            continue;
        }
        const at = Date.parse(expires);
        if (!Number.isNaN(at) && at < now.getTime()) {
            expired += 1;
        }
    }
    if (untriaged + expired > 0) {
        const parts = [
            ...(untriaged > 0 ? [`${untriaged} untriaged finding(s)`] : []),
            ...(expired > 0 ? [`${expired} expired keep(s)`] : []),
        ];
        items.push({
            rank: 4,
            kind: 'triage',
            ref: 'findings',
            detail: `${parts.join(' and ')} sit in the store`,
            action: 'triage them: suspec store doctor, or close the owning run with suspec done',
        });
    }

    // --- rank 5: ready/draft specs not already surfaced by a run above --------------------------
    const specs: { id: string; slug: string; status: string }[] = [];
    for (const entry of entries) {
        const match = SPEC_FILE.exec(entry.name);
        if (match === null) {
            continue;
        }
        const fm = read_frontmatter(entry.source);
        const status = fm_scalar(fm.status) ?? '';
        if (status !== 'ready' && status !== 'draft') {
            continue;
        }
        const slug = match[1];
        const id = fm_scalar(fm.id) ?? slug;
        if (surfacedSpecs.has(id) || surfacedSpecs.has(slug)) {
            continue;
        }
        specs.push({ id, slug, status });
    }
    specs.sort((a, b) => {
        if (a.status !== b.status) {
            return a.status === 'ready' ? -1 : 1; // ready outranks draft within the backlog
        }
        return a.slug.localeCompare(b.slug);
    });
    for (const spec of specs) {
        items.push({
            rank: 5,
            kind: 'spec',
            ref: spec.id,
            detail: `spec ${spec.id} is ${spec.status}`,
            action:
                spec.status === 'ready'
                    ? `work it: suspec work ${spec.id}`
                    : `finish authoring it, then: suspec work ${spec.id}`,
        });
    }

    return items.sort((a, b) => a.rank - b.rank);
}
