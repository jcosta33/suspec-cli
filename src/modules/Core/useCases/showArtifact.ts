// `suspec show <kind> [ref] --json` — a read-only projection of a parsed Suspec artifact, the loader
// surface suspec-mcp (ADR-0085) adapts over the public `--json` contract. Reconcile-only: it parses +
// projects existing markdown (reusing the same parsers the reconcile engine uses — no second source of
// truth), writes nothing, and renders no verdict. Artifacts live in the STORE (ADR-0137): every kind
// resolves by id-or-slug against the store's flat `<kind>-*.md` files, `archive/` as the fallback; the
// retired workspace tree (repo specs/tasks/reviews) is never consulted — a repo file (e.g. a promoted
// spec) stays reachable via the file-path face (`suspec show <path>`), confined to the launch dir.

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, resolve, relative, isAbsolute } from 'path';

import { ok, err, isErr, type Result } from '../../../infra/errors/result.ts';
import type { AppError } from '../../../infra/errors/createAppError.ts';
import { parse_task_packet, parse_spec_record } from '../../Sol/useCases/index.ts';
import { is_safe_segment } from '../services/safeSegment.ts';
import { parse_review_packet } from '../services/parseReviewPacket.ts';
import { CORE_CHECKS, CONTRACT_VERSION } from '../services/checksContract.ts';
import { fm_scalar, read_frontmatter } from '../services/readFrontmatter.ts';
import { archive_dir } from '../services/storeLayout.ts';
import { find_store_spec } from './findStoreSpec.ts';
import { usage_error } from './unixOutcome.ts';

export type ShowKind = 'spec' | 'run' | 'review' | 'task' | 'finding' | 'intake' | 'checks';

// A uniform read-only result: level (always clean — a read never warns; a parse/lookup failure is an
// Err → exit 2), the kind, and the parsed `value`. `suspec review`/`suspec check` already cover the
// reconcile/diagnostic surfaces; this is purely the loader projection.
export type ShowResult = Readonly<{ level: 'clean'; kind: ShowKind; value: unknown }>;

export type ShowArtifactInput = Readonly<{
    // The repo's store dir; null when the repo has no store yet — the store kinds then resolve to a
    // clean exit-2 error while `checks` and the file-path face keep working.
    storeDir: string | null;
    // What file-path refs are confined to (the launch cwd): `show <path>` reads a repo file.
    repoDir: string;
    kind: string;
    ref?: string;
}>;

// A repo-relative file ref is confined iff resolving it against the repo dir stays inside it
// (no `../` escape, no absolute path) — the same check the retired workspace face used (#42).
function is_confined(repoDir: string, ref: string): boolean {
    const rel = relative(resolve(repoDir), resolve(repoDir, ref));
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

// The raw body text of a `## <title>` section (the heading line excluded), or null when absent. Used to
// surface a spec's append-only `## Execution` run-record (ADR-0103/0104) — post-ephemeral the durable
// record of each change lives there — to the loader without a second parser. Fence-aware: a `## …`
// heading quoted inside a ``` fence neither opens nor closes the section. Captures to the next H2 or EOF.
function section_body(source: string, title: string): string | null {
    const lines = source.split(/\r\n|[\r\n]/);
    const wanted = title.toLowerCase();
    let inFence = false;
    let start = -1;
    let end = lines.length;
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (/^\s*(```|~~~)/.test(line)) {
            inFence = !inFence;
            continue;
        }
        if (inFence) {
            continue;
        }
        const heading = /^##\s+(.+?)\s*$/.exec(line);
        if (heading === null) {
            continue;
        }
        if (start === -1) {
            if (heading[1].toLowerCase() === wanted) {
                start = index + 1;
            }
        } else {
            end = index;
            break;
        }
    }
    if (start === -1) {
        return null;
    }
    const body = lines.slice(start, end).join('\n').trim();
    return body.length > 0 ? body : null;
}

// The body below a leading `---` frontmatter block, or the whole text when there is none (or the
// fence never closes — keep everything rather than guess).
function body_below_frontmatter(source: string): string {
    const lines = source.split(/\r\n|[\r\n]/);
    if (lines[0] !== '---') {
        return source.trim();
    }
    let close = 1;
    while (close < lines.length && lines[close] !== '---') {
        close += 1;
    }
    if (close >= lines.length) {
        return source.trim();
    }
    return lines
        .slice(close + 1)
        .join('\n')
        .trim();
}

// One resolved artifact — the shared shape both faces (store ref, repo file path) hand the projections.
type FoundArtifact = Readonly<{ path: string; source: string; archived: boolean }>;

// Scan ONE dir for `<prefix>-<slug>.md` matching the ref by frontmatter id, filename slug, or full
// filename (with or without `.md`). Mirrors find_store_spec/find_store_finding: the ref is only ever
// COMPARED against names readdir returned — never joined into a path — so a traversal-shaped ref
// cannot escape the store. A frontmatter-id match wins over a slug/filename match.
function scan_flat(dir: string, prefix: string, ref: string, archived: boolean): FoundArtifact | null {
    let names: string[];
    try {
        names = readdirSync(dir).sort();
    } catch {
        return null; // no such dir (a store without archive/, a repo without a store) — no match
    }
    const filePattern = new RegExp(`^${prefix}-(.+)\\.md$`);
    let weak: FoundArtifact | null = null;
    for (const name of names) {
        const match = filePattern.exec(name);
        if (match === null) {
            continue;
        }
        const path = join(dir, name);
        let source: string;
        try {
            source = readFileSync(path, 'utf8');
        } catch {
            continue; // a dir masquerading as <prefix>-*.md — not an artifact, skip
        }
        const found: FoundArtifact = { path, source, archived };
        if (fm_scalar(read_frontmatter(source).id) === ref) {
            return found;
        }
        if (weak === null && (match[1] === ref || name === ref || name === `${ref}.md`)) {
            weak = found;
        }
    }
    return weak;
}

// The store lookup shared by every kind: the store root first, `archive/` as the fallback — an
// archived artifact stays readable (a read never resurrects it). Specs go through find_store_spec
// (the AC-004 resolver `work`/`done` use) so `show` and the launch loop agree on one resolution.
function find_in_store(storeDir: string, kind: string, ref: string): FoundArtifact | null {
    if (kind === 'spec') {
        const open = find_store_spec(storeDir, ref);
        if (open !== null) {
            return { path: open.path, source: open.source, archived: false };
        }
        const archived = find_store_spec(archive_dir(storeDir), ref);
        return archived !== null ? { path: archived.path, source: archived.source, archived: true } : null;
    }
    return scan_flat(storeDir, kind, ref, false) ?? scan_flat(archive_dir(storeDir), kind, ref, true);
}

function project_spec(found: FoundArtifact): Result<ShowResult, AppError> {
    const parsed = parse_spec_record({ source: found.source, path: found.path });
    if (isErr(parsed)) {
        return err(parsed.error);
    }
    const record = parsed.value;
    return ok({
        level: 'clean',
        kind: 'spec',
        value: {
            frontmatter: record.frontmatter,
            // The compact projection: id + line + the named verify command per requirement (the
            // C013-relevant fields). The raw body/links are intentionally omitted from the default.
            requirements: record.requirements.map((r) => ({
                id: r.id,
                line: r.line,
                verifyCommand: r.verifyCommand,
            })),
            sectionTitles: record.sectionTitles,
            openQuestionsPresent: record.openQuestionsPresent,
            // Id-shaped headings the parser refused (C019) — surfaced so a structured consumer
            // can see the vanished requirement, not just miss it.
            malformedRequirementHeadings: record.malformedRequirementHeadings,
            // The append-only `## Execution` run-record (ADR-0103/0104) — the durable history of each
            // change cycle now that the artifacts themselves are transient. Raw text, null when absent.
            execution: section_body(found.source, 'Execution'),
        },
    });
}

function project_task(found: FoundArtifact): ShowResult {
    const fm = read_frontmatter(found.source);
    const packet = parse_task_packet(found.source);
    return {
        level: 'clean',
        kind: 'task',
        value: {
            id: fm_scalar(fm.id) ?? null,
            source: fm_scalar(fm.source) ?? null,
            status: fm_scalar(fm.status) ?? null,
            scope: packet.scope,
            affectedAreas: packet.affectedAreas,
            doNotChange: packet.doNotChange,
            claimedChangedFiles: packet.claimedChangedFiles,
            // The cross-root embedded spec slice (ADR-0100 / `## Spec snapshot`) — present when the
            // task was cut against a spec in a separate repo, so a cross-root review validates against
            // it. `embeddedSpecId` is null and `embeddedRequirements` empty for the co-located case.
            embeddedSpecId: packet.embeddedSpecId,
            embeddedRequirements: packet.embeddedRequirements.map((r) => ({
                id: r.id,
                verifyCommand: r.verifyCommand,
            })),
        },
    };
}

function project_review(found: FoundArtifact): ShowResult {
    const fm = read_frontmatter(found.source);
    const packet = parse_review_packet(found.source);
    return {
        level: 'clean',
        kind: 'review',
        value: {
            ...packet,
            // The review's identity + staleness provenance from frontmatter (parse_review_packet reads
            // only `status`): which spec/run/task it reviews (review-to-spec, ADR-0103 — `spec:` for the
            // 1:1 task-less case), and the fast-track pins (ADR-0107) `reviewed_sha` + `evidence_hash` a
            // loader needs to detect a stale review. Each is null when the key is absent.
            frontmatter: {
                status: fm_scalar(fm.status) ?? null,
                spec: fm_scalar(fm.spec) ?? null,
                run: fm_scalar(fm.run) ?? null,
                task: fm_scalar(fm.task) ?? null,
                pr: fm_scalar(fm.pr) ?? null,
                reviewedSha: fm_scalar(fm.reviewed_sha) ?? null,
                evidenceHash: fm_scalar(fm.evidence_hash) ?? null,
            },
        },
    };
}

function project_finding(found: FoundArtifact): ShowResult {
    const fm = read_frontmatter(found.source);
    const heading = /^#\s+(.+)$/m.exec(found.source);
    const rawAreas = fm.affected_areas ?? [];
    return {
        level: 'clean',
        kind: 'finding',
        value: {
            path: found.path,
            archived: found.archived,
            id: fm_scalar(fm.id) ?? null,
            title: heading !== null ? heading[1].trim() : found.path,
            severity: fm_scalar(fm.severity) ?? null,
            run: fm_scalar(fm.run) ?? null,
            affectedAreas: typeof rawAreas === 'string' ? [rawAreas] : [...rawAreas],
            body: body_below_frontmatter(found.source),
        },
    };
}

// Runs and intakes have no dedicated parser — their projection is the honest raw split: the
// frontmatter record (the CLI-owned half) + the markdown body (the agent-owned half) + the path.
function project_raw(kind: 'run' | 'intake', found: FoundArtifact): ShowResult {
    return {
        level: 'clean',
        kind,
        value: {
            path: found.path,
            archived: found.archived,
            frontmatter: read_frontmatter(found.source),
            body: body_below_frontmatter(found.source),
        },
    };
}

const STORE_KINDS = new Set(['spec', 'run', 'review', 'task', 'finding', 'intake']);

export function show_artifact(input: ShowArtifactInput): Result<ShowResult, AppError> {
    const { storeDir, repoDir } = input;
    let kind = input.kind;
    const ref = input.ref;

    // R4-ISS-16: accept `suspec show <file-path>` (kind omitted), the way `suspec check <path>` does.
    // When the first arg isn't a known kind but is a confined, existing .md file, infer the kind from
    // its frontmatter `type:` and project THAT file — the one face that still reads a repo file now
    // that id/slug refs resolve from the store.
    let found: FoundArtifact | null = null;
    if (ref === undefined && /\.(md|markdown)$/i.test(kind) && is_confined(repoDir, kind)) {
        const filePath = join(repoDir, kind);
        if (existsSync(filePath)) {
            const source = readFileSync(filePath, 'utf8');
            const type = fm_scalar(read_frontmatter(source).type);
            if (type !== undefined && STORE_KINDS.has(type)) {
                found = { path: filePath, source, archived: false };
                kind = type;
            }
        }
    }

    if (kind === 'checks') {
        // suspec-cli's own enforced contract (drift-guarded against canon's checks.yaml) — not a file read.
        return ok({ level: 'clean', kind: 'checks', value: { version: CONTRACT_VERSION, checks: CORE_CHECKS } });
    }

    if (!STORE_KINDS.has(kind)) {
        return err(
            usage_error(
                `unknown show kind: ${kind} (expected spec | run | review | task | finding | intake | checks — or a file path, e.g. \`suspec show docs/plan.md\`)`
            )
        );
    }

    // The store face: a ref is an id or slug — never a path — compared against readdir names only.
    if (found === null) {
        if (ref === undefined) {
            return err(usage_error(`usage: suspec show ${kind} <id|slug>`));
        }
        if (!is_safe_segment(ref)) {
            return err(usage_error(`invalid ${kind} ref: ${ref} — an id or slug, never a path`));
        }
        if (storeDir === null) {
            return err(usage_error(`cannot resolve ${kind}: ${ref} — this repo has no store yet`));
        }
        found = find_in_store(storeDir, kind, ref);
        if (found === null) {
            return err(
                usage_error(
                    `cannot resolve ${kind}: ${ref} (looked for ${kind}-*.md in ${storeDir}, archive/ included)`
                )
            );
        }
    }

    if (kind === 'spec') {
        return project_spec(found);
    }
    if (kind === 'task') {
        return ok(project_task(found));
    }
    if (kind === 'review') {
        return ok(project_review(found));
    }
    if (kind === 'finding') {
        return ok(project_finding(found));
    }
    return ok(project_raw(kind as 'run' | 'intake', found));
}
