// The `done` digest (SPEC-suspec-v2 AC-014): per AC — the verify command that ran, its exit code,
// and the evidence REF (never the raw output; that stays in the store) — plus the accepted-failing
// reason and the agent-evidence labels when those escapes were used. One renderer feeds both faces:
// stdout and the living PR comment. The comment is ONE marker-tagged block (reused markerBlock
// semantics) so a re-run edits the same comment in place instead of stacking new ones. PURE.

import { merge_marker_block } from './markerBlock.ts';

// The gate's per-AC reading (computed by gate_evidence; rendered here).
export type DigestRowStatus = 'verified' | 'verified-agent' | 'stale' | 'failing' | 'agent-blocked' | 'missing';

export type DigestRow = Readonly<{
    ac: string;
    command: string | null; // the evidence's recorded command (null when no evidence exists)
    exit: number | null;
    evidenceRef: string | null; // the evidence .md basename — the ref, never the output
    provenance: string | null;
    status: DigestRowStatus;
}>;

export type Digest = Readonly<{
    runSlug: string;
    specId: string;
    rows: readonly DigestRow[];
    acceptedFailing: string | null; // the --accept-failing reason, stamped when used (AC-011)
    agentEvidenceAllowed: boolean; // --allow-agent-evidence was on (labeled, AC-011)
}>;

function cell(value: string | number | null): string {
    return value === null ? '—' : String(value);
}

export function render_digest(digest: Digest): string {
    const lines = [
        `digest — run ${digest.runSlug} · spec ${digest.specId}`,
        '',
        '| AC | command | exit | evidence | status |',
        '| --- | --- | --- | --- | --- |',
        ...digest.rows.map(
            (row) =>
                `| ${row.ac} | ${cell(row.command)} | ${cell(row.exit)} | ${cell(row.evidenceRef)} | ${row.status} |`
        ),
    ];
    if (digest.agentEvidenceAllowed) {
        const agentRows = digest.rows.filter((row) => row.status === 'verified-agent');
        lines.push(
            '',
            `agent evidence allowed (--allow-agent-evidence): ${
                agentRows.length > 0 ? agentRows.map((row) => `${row.ac} via ${cell(row.evidenceRef)}`).join(', ') : 'none counted'
            }`
        );
    }
    if (digest.acceptedFailing !== null) {
        lines.push('', `accepted failing (--accept-failing): ${digest.acceptedFailing}`);
    }
    return lines.join('\n');
}

// The marker pair that tags the ONE living PR comment for a run. Keyed by run slug so two runs on
// one PR never fight over the same block.
export function digest_markers(runSlug: string): Readonly<{ start: string; end: string }> {
    return { start: `<!-- suspec:digest:${runSlug} -->`, end: `<!-- /suspec:digest:${runSlug} -->` };
}

// The PR comment body: the digest merged into the existing comment (replacing the marker block in
// place on a re-run — markerBlock semantics), or a fresh block when no comment exists yet.
export function build_digest_comment_body(existingBody: string | null, digest: Digest): string {
    const { start, end } = digest_markers(digest.runSlug);
    return merge_marker_block({
        existing: existingBody ?? '',
        block: render_digest(digest),
        startMarker: start,
        endMarker: end,
    });
}
