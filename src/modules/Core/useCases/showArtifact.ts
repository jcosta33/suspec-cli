// `swarm show <kind> [ref] --json` — a read-only projection of a parsed Swarm artifact, the loader
// surface the MCP server (swarm-mcp, ADR-0085) adapts over the public `--json` contract. Reconcile-only:
// it parses + projects existing markdown (reusing the same parsers the reconcile engine uses — no
// second source of truth), writes nothing, and renders no verdict. One use-case dispatching on kind.

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { ok, err, isErr, type Result } from '../../../infra/errors/result.ts';
import type { AppError } from '../../../infra/errors/createAppError.ts';
import { parse_task_packet, parse_spec_record } from '../../Sol/useCases/index.ts';
import { parse_review_packet } from '../services/parseReviewPacket.ts';
import { CORE_CHECKS, CONTRACT_VERSION } from '../services/checksContract.ts';
import { frontmatter_value, find_source_spec } from './taskLocator.ts';
import { usage_error } from './unixOutcome.ts';

export type ShowKind = 'task' | 'spec' | 'review' | 'checks';

// A uniform read-only result: level (always clean — a read never warns; a parse/lookup failure is an
// Err → exit 2), the kind, and the parsed `value`. `swarm review`/`swarm check` already cover the
// reconcile/diagnostic surfaces; this is purely the loader projection.
export type ShowResult = Readonly<{ level: 'clean'; kind: ShowKind; value: unknown }>;

export type ShowArtifactInput = Readonly<{ workspaceDir: string; kind: string; ref?: string }>;

export function show_artifact(input: ShowArtifactInput): Result<ShowResult, AppError> {
    const { workspaceDir, kind, ref } = input;

    if (kind === 'checks') {
        // swarm-cli's own enforced contract (drift-guarded against canon's checks.yaml) — not a file read.
        return ok({ level: 'clean', kind: 'checks', value: { version: CONTRACT_VERSION, checks: CORE_CHECKS } });
    }

    if (kind === 'task') {
        if (ref === undefined) {
            return err(usage_error('usage: swarm show task <stem>'));
        }
        const path = join(workspaceDir, 'tasks', `${ref}.md`);
        if (!existsSync(path)) {
            return err(usage_error(`no tasks/${ref}.md in this workspace`));
        }
        const source = readFileSync(path, 'utf8');
        const packet = parse_task_packet(source);
        return ok({
            level: 'clean',
            kind: 'task',
            value: {
                id: frontmatter_value(source, 'id'),
                source: frontmatter_value(source, 'source'),
                status: frontmatter_value(source, 'status'),
                scope: packet.scope,
                affectedAreas: packet.affectedAreas,
                claimedChangedFiles: packet.claimedChangedFiles,
            },
        });
    }

    if (kind === 'spec') {
        if (ref === undefined) {
            return err(usage_error('usage: swarm show spec <id|path>'));
        }
        // Resolve by frontmatter id (the documented form), else treat the ref as a workspace path.
        const byId = find_source_spec(workspaceDir, ref);
        const path = byId !== null ? byId.path : join(workspaceDir, ref);
        if (!existsSync(path)) {
            return err(usage_error(`cannot resolve spec: ${ref}`));
        }
        const parsed = parse_spec_record({ source: readFileSync(path, 'utf8'), path });
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
                requirements: record.requirements.map((r) => ({ id: r.id, line: r.line, verifyCommand: r.verifyCommand })),
                sectionTitles: record.sectionTitles,
                openQuestionsPresent: record.openQuestionsPresent,
            },
        });
    }

    if (kind === 'review') {
        if (ref === undefined) {
            return err(usage_error('usage: swarm show review <stem>'));
        }
        const path = join(workspaceDir, 'reviews', `${ref}.md`);
        if (!existsSync(path)) {
            return err(usage_error(`no reviews/${ref}.md in this workspace`));
        }
        return ok({ level: 'clean', kind: 'review', value: parse_review_packet(readFileSync(path, 'utf8')) });
    }

    return err(usage_error(`unknown show kind: ${kind} (expected task | spec | review | checks)`));
}
