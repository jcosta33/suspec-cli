import { describe, it, expect } from 'vitest';

import { build_digest_comment_body, digest_markers, render_digest, type Digest } from '../services/doneDigest.ts';

// SPEC-suspec-v2 AC-014: the digest carries per-AC command + exit + evidence REF and the escape
// labels — never raw command output — and the PR comment is ONE marker-tagged block edited in place.

const DIGEST: Digest = {
    runSlug: 'feat',
    specId: 'SPEC-feat',
    rows: [
        {
            ac: 'AC-001',
            command: 'pnpm test:run',
            exit: 0,
            evidenceRef: '001-pnpm-test-run.md',
            provenance: 'cli-verified',
            status: 'verified',
        },
        { ac: 'AC-002', command: 'pnpm lint', exit: null, evidenceRef: null, provenance: null, status: 'missing' },
    ],
    acceptedFailing: null,
    agentEvidenceAllowed: false,
};

describe('render_digest', () => {
    it('renders one row per AC — command, exit, evidence ref, status', () => {
        const text = render_digest(DIGEST);
        expect(text).toContain('digest — run feat · spec SPEC-feat');
        expect(text).toContain('| AC-001 | pnpm test:run | 0 | 001-pnpm-test-run.md | verified |');
        expect(text).toContain('| AC-002 | pnpm lint | — | — | missing |');
        // no escape lines when neither escape was used
        expect(text).not.toContain('accepted failing');
        expect(text).not.toContain('agent evidence');
    });

    it('prints the accepted-failing reason when the gate was explicitly accepted', () => {
        const text = render_digest({ ...DIGEST, acceptedFailing: 'flaky CI, tracked in #12' });
        expect(text).toContain('accepted failing (--accept-failing): flaky CI, tracked in #12');
    });

    it('labels agent evidence when the flag admitted it — and says so even when none counted', () => {
        const withAgent = render_digest({
            ...DIGEST,
            agentEvidenceAllowed: true,
            rows: [
                { ...DIGEST.rows[0], status: 'verified-agent', provenance: 'agent', evidenceRef: '002-agent.md' },
                DIGEST.rows[1],
            ],
        });
        expect(withAgent).toContain('agent evidence allowed (--allow-agent-evidence): AC-001 via 002-agent.md');
        const noneCounted = render_digest({ ...DIGEST, agentEvidenceAllowed: true });
        expect(noneCounted).toContain('agent evidence allowed (--allow-agent-evidence): none counted');
    });
});

describe('the living PR comment body', () => {
    it('creates a fresh marker-wrapped block when no comment exists', () => {
        const body = build_digest_comment_body(null, DIGEST);
        const { start, end } = digest_markers('feat');
        expect(body.startsWith(start)).toBe(true);
        expect(body.trimEnd().endsWith(end)).toBe(true);
        expect(body).toContain('| AC-001 |');
    });

    it('replaces the marker block in place on re-run, preserving the rest of the comment', () => {
        const first = `human preamble\n\n${build_digest_comment_body(null, DIGEST)}`;
        const updated: Digest = {
            ...DIGEST,
            rows: [DIGEST.rows[0], { ...DIGEST.rows[1], status: 'verified', exit: 0, evidenceRef: '003-lint.md' }],
        };
        const second = build_digest_comment_body(first, updated);
        expect(second).toContain('human preamble');
        expect(second).toContain('003-lint.md');
        expect(second).not.toContain('| AC-002 | pnpm lint | — | — | missing |');
        // still exactly one managed block
        expect(second.match(/suspec:digest:feat/g)).toHaveLength(2); // start + end marker only
    });

    it('keys the markers by run slug so two runs never fight over one block', () => {
        expect(digest_markers('feat').start).not.toBe(digest_markers('feat-2').start);
    });
});
