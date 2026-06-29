import { describe, it, expect } from 'vitest';

import {
    format_verdict,
    format_check_report,
    format_workspace_report,
    format_board,
    format_worktrees,
    format_init_report,
    format_review_report,
    type RenderReviewReport,
} from '../services/render.ts';

function reviewReport(over: Partial<RenderReviewReport> = {}): RenderReviewReport {
    return {
        level: 'clean',
        task: 'TASK-feat',
        diffChangedFiles: ['src/a.ts'],
        coverage: [],
        verifyBinding: [],
        scopeDivergence: [],
        selfReport: { claimedNotInDiff: [], inDiffNotClaimed: [], outsideScope: [] },
        doNotChangeTouched: [],
        emptyEvidencePassRows: [],
        packetStructural: { badResultCells: [], badStatus: null, statusPassContradicted: false, missingSections: [] },
        packetSize: null,
        specCoverageDrift: null,
        evidenceDigest: 'abc123',
        reviewStale: null,
        hasReviewPacket: true,
        ...over,
    };
}

describe('format_verdict', () => {
    it('labels each level', () => {
        expect(format_verdict('clean')).toContain('clean');
        expect(format_verdict('warning')).toContain('warning');
        expect(format_verdict('blocking')).toContain('blocking');
    });
});

describe('format_check_report', () => {
    it('shows just the head when clean', () => {
        const out = format_check_report({ path: 'specs/x/spec.md', level: 'clean', diagnostics: [] });
        expect(out).toContain('specs/x/spec.md');
        expect(out).toContain('0 errors, 0 warnings');
        expect(out).not.toContain('✗');
    });

    it('lists each diagnostic with code, message and line', () => {
        const out = format_check_report({
            path: 'spec.md',
            level: 'blocking',
            diagnostics: [
                { code: 'C003', severity: 'hard-error', message: 'no Verify line', line: 12 },
                { code: 'C006', severity: 'warning', message: 'no Open questions', line: null },
            ],
        });
        expect(out).toContain('1 errors, 1 warnings');
        expect(out).toContain('C003');
        expect(out).toContain('no Verify line');
        expect(out).toContain(':12');
        expect(out).toContain('C006');
    });
});

describe('format_workspace_report', () => {
    it('renders the 3-way severity header from level (clean / warning / blocking)', () => {
        expect(
            format_workspace_report({
                level: 'clean',
                specs: [{ path: 'a', level: 'clean', diagnostics: [] }],
                workspaceFindings: [],
            })
        ).toContain('clean');
        // a warnings-only workspace shows "warning", never a misleading "clean" header (it exits 1)
        const warning = format_workspace_report({
            level: 'warning',
            specs: [{ path: 'w', level: 'warning', diagnostics: [] }],
            workspaceFindings: [],
        });
        expect(warning).toContain('warning');
        expect(warning).not.toContain('clean');
        const blocking = format_workspace_report({
            level: 'blocking',
            specs: [{ path: 'b', level: 'blocking', diagnostics: [] }],
            workspaceFindings: [{ code: 'placeholder', message: 'unfilled' }],
        });
        expect(blocking).toContain('blocking');
        expect(blocking).toContain('placeholder');
    });

    it('renders each spec’s diagnostics (which check, which line) — the gate human surface (#37)', () => {
        const out = format_workspace_report({
            level: 'blocking',
            specs: [
                {
                    path: 'specs/x/spec.md',
                    level: 'blocking',
                    diagnostics: [{ code: 'C003', severity: 'hard-error', message: 'no Verify line', line: 11 }],
                },
            ],
            workspaceFindings: [],
        });
        expect(out).toContain('C003');
        expect(out).toContain('11');
    });
});

describe('format_board', () => {
    it('renders specs, tasks, awaiting-review and needs-human', () => {
        const out = format_board({
            specs: [
                {
                    id: 'SPEC-x',
                    status: 'ready',
                    tasks: [
                        { id: 'T1', status: 'review-ready', hasReview: true, reviewStatus: 'needs-human' },
                        { id: 'T2', status: 'review-ready', hasReview: false, reviewStatus: null },
                        { id: 'T3', status: 'closed', hasReview: true, reviewStatus: null },
                    ],
                },
            ],
            tasksWithoutReview: ['T2'],
            needsHuman: ['T1'],
        });
        expect(out).toContain('SPEC-x');
        expect(out).toContain('T1');
        expect(out).toContain('Awaiting review: T2');
        expect(out).toContain('Needs human: T1');
    });

    it('renders a placeholder when empty', () => {
        expect(format_board({ specs: [], tasksWithoutReview: [], needsHuman: [] })).toContain('no specs yet');
    });
});

describe('format_worktrees', () => {
    it('renders entries and an empty placeholder', () => {
        expect(format_worktrees([])).toContain('no suspec worktrees');
        const out = format_worktrees([
            { branch: 'suspec/x', path: '/wt/x', dirty: false },
            { branch: 'suspec/y', path: '/wt/y', dirty: true },
        ]);
        expect(out).toContain('suspec/x');
        expect(out).toContain('clean');
        expect(out).toContain('dirty');
    });
});

describe('format_review_report (AC-023: facts + route, never a verdict)', () => {
    it('a clean reconcile shows the head + a no-facts note and no verdict word', () => {
        const out = format_review_report(reviewReport());
        expect(out).toContain('review TASK-feat');
        expect(out).toContain('1 changed files');
        expect(out).toContain('clean reconcile');
        expect(out).not.toMatch(/\bPass\b|\bFail\b|\bUnverified\b|\bBlocked\b/);
        expect(out).not.toMatch(/merge|Suggested decision/i);
    });

    it('surfaces the diff size as NEUTRAL info when stats are present (never an oversized finding)', () => {
        const out = format_review_report(reviewReport({ packetSize: { changedLoc: 1200, filesTouched: 14 } }));
        expect(out).toContain('1200 LOC across 14 files');
        // even a large diff is NOT flagged — the oversized band is specified-not-shipped (ADR-0097)
        expect(out).not.toMatch(/oversized|consider splitting|C018/i);
        expect(out).toContain('clean reconcile'); // size info does not become a finding / change the level
    });

    it('shows the evidence digest in the header and flags a Stale review (ADR-0107 fast-track)', () => {
        const clean = format_review_report(reviewReport({ evidenceDigest: 'deadbeef00' }));
        expect(clean).toContain('digest deadbeef00'); // shown for stamping, in the header (no extra line)
        expect(clean).toContain('clean reconcile'); // the digest header does not suppress the no-facts note
        const stale = format_review_report(reviewReport({ reviewStale: { reviewedSha: 'abc1234' }, level: 'warning' }));
        expect(stale).toContain('Stale');
        expect(stale).toContain('reviewed at abc1234');
        expect(stale).toContain('re-review');
    });

    it('surfaces spec-coverage drift as NEUTRAL info — a dim line, never a finding (suspec-cli#1)', () => {
        const out = format_review_report(
            reviewReport({
                specCoverageDrift: {
                    specCount: 3,
                    trackedCount: 1,
                    untracked: ['AC-002', 'AC-003'],
                    message: 'spec has 3 requirements; task scope tracks 1; 2 untracked: AC-002, AC-003',
                },
            })
        );
        expect(out).toContain('spec-coverage drift');
        expect(out).toContain('2 untracked: AC-002, AC-003');
        // neutral: it does not become a ⚠ finding and does not flip the clean reconcile to a warning
        expect(out).not.toMatch(/⚠.*spec-coverage/);
        expect(out).not.toMatch(/\bwarning\b/);
    });

    it('surfaces every fact class and routes them', () => {
        const out = format_review_report(
            reviewReport({
                level: 'warning',
                hasReviewPacket: false,
                coverage: [
                    { id: 'AC-002', kind: 'uncovered', message: 'requirement AC-002 ... (uncovered)' },
                    { id: 'AC-009', kind: 'orphan', message: 'coverage row AC-009 ... (orphan)' },
                ],
                verifyBinding: [
                    { id: 'AC-001', kind: 'cmd-mismatch', message: 'AC-001 cmd does not match' },
                    { id: 'AC-004', kind: 'free-form-only', message: 'AC-004 free-form only' },
                ],
                scopeDivergence: ['AC-009'],
                selfReport: { claimedNotInDiff: ['a.ts'], inDiffNotClaimed: ['b.ts'], outsideScope: ['vendor/x.ts'] },
                doNotChangeTouched: ['src/auth/token-family.ts'],
                emptyEvidencePassRows: ['AC-001'],
                packetStructural: {
                    badResultCells: ['AC-003'],
                    badStatus: 'merged',
                    statusPassContradicted: true,
                    missingSections: ['Human attention'],
                },
            })
        );
        expect(out).toContain('no review packet yet');
        expect(out).toContain('C012 uncovered');
        expect(out).toContain('C012 orphan');
        expect(out).toContain('C013 cmd-mismatch');
        expect(out).toContain('C013 free-form-only');
        expect(out).toContain('scope≠spec');
        expect(out).toContain('claimed-not-changed');
        expect(out).toContain('changed-not-claimed');
        expect(out).toContain('outside-scope');
        expect(out).toContain('do-not-change');
        expect(out).toContain('empty-evidence');
        expect(out).toContain('bad-result');
        expect(out).toContain('bad-status');
        expect(out).toContain('status-contradicted');
        expect(out).toContain('missing-section');
    });
});

describe('format_init_report', () => {
    it('lists only the non-empty buckets', () => {
        const out = format_init_report({
            mode: 'workspace',
            written: ['AGENTS.md'],
            skipped: ['README.md'],
            merged: ['.gitignore'],
            backedUp: [],
            overwritten: [],
        });
        expect(out).toContain('init (workspace)');
        expect(out).toContain('written: AGENTS.md');
        expect(out).toContain('skipped: README.md');
        expect(out).toContain('merged: .gitignore');
        expect(out).not.toContain('backed up');
        expect(out).not.toContain('overwritten');
    });
});
