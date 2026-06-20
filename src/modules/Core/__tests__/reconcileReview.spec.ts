import { describe, it, expect } from 'vitest';

import { reconcile_review, type ReconcileReviewInput } from '../useCases/reconcileReview.ts';
import { isOk } from '../../../infra/errors/result.ts';

function specSource(status: string, ids: readonly string[]): string {
    const reqs = ids.map((id) => `### ${id} — does it\nThe tool must do it.\nVerify with: a test.\n`).join('\n');
    return `---
type: spec
id: SPEC-feat
status: ${status}
sources:
  - ADR-0077
---

## Requirements

${reqs}
## Non-goals

- none.

## Open questions

- none.
`;
}

function taskSource(scope: readonly string[], areas: readonly string[], claimed: readonly string[]): string {
    return `---
type: task
id: TASK-feat
source:
  - SPEC-feat
scope: [${scope.join(', ')}]
status: review-ready
---

# Task

## Affected areas

${areas.map((a) => `- \`${a}\``).join('\n')}

## Run summary

- Changed files: ${claimed.map((c) => `\`${c}\``).join(', ')}
`;
}

function reviewSource(opts: {
    status?: string;
    // `verify` carries a matching block (cmd = the spec's named command `a test.`, result=pass) so the
    // row reads C013-consistent; omit it and a Pass row surfaces a C013 free-form-only warning.
    rows?: { id: string; result: string; evidence: string; verify?: boolean }[];
    sections?: string[];
}): string {
    const sections = opts.sections ?? [
        'Summary',
        'Changed files',
        'Requirement coverage',
        'Human attention',
        'Suggested decision',
    ];
    const rowsTable = (opts.rows ?? [])
        .map((r) => {
            const row = `| ${r.id} | ${r.result} | ${r.evidence} | no |`;
            return r.verify === true
                ? `${row}\n\n\`\`\`verify id=${r.id} cmd="a test." result=pass\nok (1 passed)\n\`\`\`\n`
                : row;
        })
        .join('\n');
    const body = sections
        .map((s) =>
            s === 'Requirement coverage'
                ? `## Requirement coverage\n\n| ID | Result | Evidence | Human attention |\n|---|---|---|---|\n${rowsTable}\n`
                : `## ${s}\n\nx\n`
        )
        .join('\n');
    return `---
type: review
id: REVIEW-feat
task: TASK-feat
status: ${opts.status ?? 'needs-human'}
---

# Review\n\n${body}`;
}

function input(over: Partial<ReconcileReviewInput>): ReconcileReviewInput {
    return {
        task: 'TASK-feat',
        taskPacketSource: taskSource(['AC-001'], ['src'], ['src/a.ts']),
        specSource: specSource('ready', ['AC-001']),
        reviewPacketSource: null,
        diffChangedFiles: ['src/a.ts'],
        ...over,
    };
}

function ok(over: Partial<ReconcileReviewInput>) {
    const result = reconcile_review(input(over));
    if (!isOk(result)) {
        throw new Error(`expected ok, got err: ${result.error.message}`);
    }
    return result.value;
}

describe('reconcile_review — coverage (AC-019)', () => {
    it('uncovered + orphan against a non-draft spec', () => {
        const report = ok({
            taskPacketSource: taskSource(['AC-001', 'AC-002', 'AC-003'], ['src'], ['src/a.ts']),
            specSource: specSource('ready', ['AC-001', 'AC-002', 'AC-003']),
            reviewPacketSource: reviewSource({
                rows: [
                    { id: 'AC-001', result: 'Pass', evidence: 'pasted' },
                    { id: 'AC-009', result: 'Pass', evidence: 'pasted' },
                ],
            }),
        });
        expect(report.coverage.filter((c) => c.kind === 'uncovered').map((c) => c.id)).toEqual(['AC-002', 'AC-003']);
        expect(report.coverage.filter((c) => c.kind === 'orphan').map((c) => c.id)).toEqual(['AC-009']);
        expect(report.level).toBe('warning');
    });

    it('no review packet → every in-scope id reads uncovered', () => {
        const report = ok({
            taskPacketSource: taskSource(['AC-001', 'AC-002', 'AC-003'], ['src'], []),
            specSource: specSource('ready', ['AC-001', 'AC-002', 'AC-003']),
            reviewPacketSource: null,
        });
        expect(report.hasReviewPacket).toBe(false);
        expect(report.coverage.map((c) => c.id)).toEqual(['AC-001', 'AC-002', 'AC-003']);
        expect(report.coverage.every((c) => c.kind === 'uncovered')).toBe(true);
    });

    it('scope-vs-spec divergence is surfaced as its own fact', () => {
        const report = ok({
            taskPacketSource: taskSource(['AC-001', 'AC-009'], ['src'], ['src/a.ts']),
            specSource: specSource('ready', ['AC-001']),
            reviewPacketSource: reviewSource({ rows: [{ id: 'AC-001', result: 'Pass', evidence: 'p' }] }),
        });
        expect(report.scopeDivergence).toEqual(['AC-009']);
    });

    it('a draft source spec produces neither a coverage finding nor a divergence (the scope guard)', () => {
        const report = ok({
            taskPacketSource: taskSource(['AC-001', 'AC-002'], ['src'], []),
            specSource: specSource('draft', ['AC-001']),
            reviewPacketSource: null,
            diffChangedFiles: [], // no self-report mismatch, so the level reflects only the coverage/divergence guard
        });
        expect(report.coverage).toEqual([]);
        // AC-002 is a scope id the draft spec does not define — divergence is suppressed too, the same
        // scope guard as coverage (ADR-0079); a non-draft spec surfaces it (the test above).
        expect(report.scopeDivergence).toEqual([]);
        expect(report.level).toBe('clean');
    });

    it('a packet covering exactly the in-scope ids is a clean reconcile', () => {
        const report = ok({
            taskPacketSource: taskSource(['AC-001'], ['src'], ['src/a.ts']),
            specSource: specSource('ready', ['AC-001', 'AC-002']),
            reviewPacketSource: reviewSource({ rows: [{ id: 'AC-001', result: 'Pass', evidence: 'p', verify: true }] }),
        });
        expect(report.coverage).toEqual([]);
        expect(report.verifyBinding).toEqual([]);
        expect(report.level).toBe('clean');
    });
});

describe('reconcile_review — self-report ↔ diff (AC-018)', () => {
    it('surfaces the three mismatch classes', () => {
        const report = ok({
            taskPacketSource: taskSource(['AC-001'], ['src'], ['a.ts']), // claims a.ts
            diffChangedFiles: ['b.ts', 'src/x.ts', 'vendor/x.ts'], // a.ts not changed; b.ts not claimed
            specSource: specSource('ready', ['AC-001']),
            reviewPacketSource: reviewSource({ rows: [{ id: 'AC-001', result: 'Pass', evidence: 'p' }] }),
        });
        expect(report.selfReport.claimedNotInDiff).toEqual(['a.ts']);
        expect(report.selfReport.inDiffNotClaimed).toEqual(['b.ts', 'src/x.ts', 'vendor/x.ts']);
        expect(report.selfReport.outsideScope).toEqual(['b.ts', 'vendor/x.ts']);
    });

    it('agreement → none surfaced and a clean level', () => {
        const report = ok({
            taskPacketSource: taskSource(['AC-001'], ['src/a.ts'], ['src/a.ts']),
            diffChangedFiles: ['src/a.ts'],
            specSource: specSource('ready', ['AC-001']),
            reviewPacketSource: reviewSource({ rows: [{ id: 'AC-001', result: 'Pass', evidence: 'p', verify: true }] }),
        });
        expect(report.selfReport.claimedNotInDiff).toEqual([]);
        expect(report.selfReport.inDiffNotClaimed).toEqual([]);
        expect(report.selfReport.outsideScope).toEqual([]);
        expect(report.level).toBe('clean');
    });

    it('a prose Run summary notes "unparsed" once and does not flood the gate (#44)', () => {
        const report = ok({
            // The claimed tokens are bare symbols, not paths — a prose Run summary parses to no claims.
            taskPacketSource: taskSource(['AC-001'], ['src'], ['taskLocator', 'deriveBoard']),
            diffChangedFiles: ['src/x.ts', 'src/y.ts'], // real changes, all in scope
            specSource: specSource('ready', ['AC-001']),
            reviewPacketSource: reviewSource({ rows: [{ id: 'AC-001', result: 'Pass', evidence: 'p', verify: true }] }),
        });
        expect(report.selfReport.runSummaryUnparsed).toBe(true);
        expect(report.selfReport.inDiffNotClaimed).toEqual([]); // not a 2-file flood
        expect(report.selfReport.claimedNotInDiff).toEqual([]);
        expect(report.level).toBe('clean'); // the prose summary no longer trips exit-1
    });
});

describe('reconcile_review — do-not-change-touched (C014, ADR-0086)', () => {
    const protectedFile = 'src/auth/token-family.ts';
    // taskSource has no `## Do not change` section; build one that declares a protected file INSIDE the
    // declared Affected area `src/auth`, so the C014 fact is isolated from outsideScope.
    const taskProtecting = (claimed: readonly string[]): string => `---
type: task
id: TASK-feat
source:
  - SPEC-feat
scope: [AC-001]
status: review-ready
---

# Task

## Do not change

- \`${protectedFile}\` — rotation logic is frozen.

## Affected areas

- \`src/auth\`

## Run summary

- Changed files: ${claimed.map((c) => `\`${c}\``).join(', ')}
`;
    const cleanRow = reviewSource({ rows: [{ id: 'AC-001', result: 'Pass', evidence: 'p', verify: true }] });

    it('a changed file touching a Do-not-change entry is surfaced and trips the warning level ALONE', () => {
        const report = ok({
            taskPacketSource: taskProtecting([protectedFile]),
            specSource: specSource('ready', ['AC-001']),
            reviewPacketSource: cleanRow,
            diffChangedFiles: [protectedFile],
        });
        expect(report.doNotChangeTouched).toEqual([protectedFile]);
        // the protected file is INSIDE the declared Affected area `src/auth`, so outsideScope misses it —
        // C014 is the fact that catches it, with no other mismatch in play.
        expect(report.selfReport.outsideScope).toEqual([]);
        expect(report.selfReport.claimedNotInDiff).toEqual([]);
        expect(report.selfReport.inDiffNotClaimed).toEqual([]);
        expect(report.coverage).toEqual([]);
        expect(report.level).toBe('warning');
    });

    it('no collision → doNotChangeTouched empty and a clean reconcile', () => {
        const report = ok({
            taskPacketSource: taskProtecting(['src/auth/refresh.ts']),
            specSource: specSource('ready', ['AC-001']),
            reviewPacketSource: cleanRow,
            diffChangedFiles: ['src/auth/refresh.ts'],
        });
        expect(report.doNotChangeTouched).toEqual([]);
        expect(report.level).toBe('clean');
    });

    it('not draft-guarded: a draft source spec still surfaces a do-not-change touch', () => {
        const report = ok({
            taskPacketSource: taskProtecting([protectedFile]),
            specSource: specSource('draft', ['AC-001']),
            reviewPacketSource: null,
            diffChangedFiles: [protectedFile],
        });
        expect(report.doNotChangeTouched).toEqual([protectedFile]);
    });
});

describe('reconcile_review — packet facts (AC-020 / AC-021)', () => {
    it('flags a Pass row with empty evidence', () => {
        const report = ok({
            reviewPacketSource: reviewSource({ rows: [{ id: 'AC-001', result: 'Pass', evidence: '' }] }),
        });
        expect(report.emptyEvidencePassRows).toEqual(['AC-001']);
    });

    it('surfaces a bad Result cell, a bad status, a contradicted pass, a missing section', () => {
        expect(
            ok({
                reviewPacketSource: reviewSource({ rows: [{ id: 'AC-001', result: 'Maybe', evidence: 'p' }] }),
            }).packetStructural.badResultCells
        ).toEqual(['AC-001']);
        expect(
            ok({ reviewPacketSource: reviewSource({ status: 'merged', rows: [{ id: 'AC-001', result: 'Pass', evidence: 'p' }] }) })
                .packetStructural.badStatus
        ).toBe('merged');
        expect(
            ok({ reviewPacketSource: reviewSource({ status: 'pass', rows: [{ id: 'AC-001', result: 'Fail', evidence: 'p' }] }) })
                .packetStructural.statusPassContradicted
        ).toBe(true);
        expect(
            ok({
                reviewPacketSource: reviewSource({
                    rows: [{ id: 'AC-001', result: 'Pass', evidence: 'p' }],
                    sections: ['Summary', 'Changed files', 'Requirement coverage', 'Suggested decision'],
                }),
            }).packetStructural.missingSections
        ).toEqual(['Human attention']);
    });
});

describe('reconcile_review — C013 verify-evidence-binding (ADR-0083, AC-005/006)', () => {
    // The spec's named command (from specSource) is `a test.`; a row with `verify: true` records it.
    it('a matching verify block → no C013 finding (consistent)', () => {
        const report = ok({
            taskPacketSource: taskSource(['AC-001'], ['src'], ['src/a.ts']),
            specSource: specSource('ready', ['AC-001']),
            reviewPacketSource: reviewSource({ rows: [{ id: 'AC-001', result: 'Pass', evidence: 'p', verify: true }] }),
        });
        expect(report.verifyBinding).toEqual([]);
    });

    it('a cmd mismatch → one C013 cmd-mismatch fact (with its rendered message)', () => {
        const review = reviewSource({ rows: [{ id: 'AC-001', result: 'Pass', evidence: 'p' }] }).replace(
            '| AC-001 | Pass | p | no |\n',
            '| AC-001 | Pass | p | no |\n\n```verify id=AC-001 cmd="a different command" result=pass\nok\n```\n'
        );
        const report = ok({
            taskPacketSource: taskSource(['AC-001'], ['src'], ['src/a.ts']),
            specSource: specSource('ready', ['AC-001']),
            reviewPacketSource: review,
        });
        expect(report.verifyBinding.map((f) => f.kind)).toEqual(['cmd-mismatch']);
        expect(report.verifyBinding[0].message).toContain('does not match');
        expect(report.level).toBe('warning');
    });

    it('a result=fail under a Pass row → one C013 result-fail fact', () => {
        const review = reviewSource({ rows: [{ id: 'AC-001', result: 'Pass', evidence: 'p' }] }).replace(
            '| AC-001 | Pass | p | no |\n',
            '| AC-001 | Pass | p | no |\n\n```verify id=AC-001 cmd="a test." result=fail\nfailed\n```\n'
        );
        const report = ok({
            taskPacketSource: taskSource(['AC-001'], ['src'], ['src/a.ts']),
            specSource: specSource('ready', ['AC-001']),
            reviewPacketSource: review,
        });
        expect(report.verifyBinding.map((f) => f.kind)).toEqual(['result-fail']);
    });

    it('a free-form-only Pass row → a C013 free-form-only warning routed to attention', () => {
        const report = ok({
            taskPacketSource: taskSource(['AC-001'], ['src'], ['src/a.ts']),
            specSource: specSource('ready', ['AC-001']),
            reviewPacketSource: reviewSource({ rows: [{ id: 'AC-001', result: 'Pass', evidence: 'p' }] }),
        });
        expect(report.verifyBinding.map((f) => f.kind)).toEqual(['free-form-only']);
        expect(report.level).toBe('warning');
    });

    it('a draft source spec is exempt — no C013 fact even with a mismatched block', () => {
        const review = reviewSource({ rows: [{ id: 'AC-001', result: 'Pass', evidence: 'p' }] }).replace(
            '| AC-001 | Pass | p | no |\n',
            '| AC-001 | Pass | p | no |\n\n```verify id=AC-001 cmd="wrong" result=fail\nx\n```\n'
        );
        const report = ok({
            taskPacketSource: taskSource(['AC-001'], ['src'], []),
            specSource: specSource('draft', ['AC-001']),
            reviewPacketSource: review,
            diffChangedFiles: [],
        });
        expect(report.verifyBinding).toEqual([]);
    });

    it('the C013 fact is verdict-free: it adds no Result/status:pass/merge field and writes nothing', () => {
        const report = ok({
            taskPacketSource: taskSource(['AC-001'], ['src'], ['src/a.ts']),
            specSource: specSource('ready', ['AC-001']),
            reviewPacketSource: reviewSource({ rows: [{ id: 'AC-001', result: 'Pass', evidence: 'p' }] }),
        });
        // A C013 fact is present (free-form-only) yet the serialized report carries no verdict field.
        expect(report.verifyBinding.length).toBeGreaterThan(0);
        const json = JSON.stringify(report);
        expect(json).not.toMatch(/"(result|verdict|decision|suggestedDecision|mergeDecision|status)":/);
        // The fact folds into the advisory level only.
        expect(report.level).toBe('warning');
    });
});

describe('reconcile_review — the boundary (AC-023)', () => {
    it('the report carries no Result / status:pass / merge-decision field, on no surface', () => {
        const report = ok({
            reviewPacketSource: reviewSource({ rows: [{ id: 'AC-001', result: 'Pass', evidence: 'p' }] }),
        });
        const keys = Object.keys(report);
        expect(keys).not.toContain('result');
        expect(keys).not.toContain('verdict');
        expect(keys).not.toContain('decision');
        expect(keys).not.toContain('suggestedDecision');
        // The serialized report (the --json surface) carries no Pass/Fail/Unverified/Blocked value and
        // no merge wording as a *field value the engine decided* — only the literal coverage-row data.
        const json = JSON.stringify(report);
        expect(json).not.toMatch(/"(result|verdict|decision|suggestedDecision|mergeDecision)":/);
    });
});

describe('reconcile_review — errors', () => {
    it('an unparseable source spec returns an Err', () => {
        const result = reconcile_review(input({ specSource: 'no frontmatter fence here' }));
        expect(isOk(result)).toBe(false);
    });
});
