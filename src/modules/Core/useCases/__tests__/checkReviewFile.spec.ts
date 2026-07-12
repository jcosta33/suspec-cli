import { describe, it, expect } from 'vitest';

import { check_review_file } from '../checkReviewFile.ts';
import { assertOk } from '../../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../../infra/errors/testing/assertErr.ts';

const SPEC = `---
type: spec
id: SPEC-feat
status: ready
sources:
  - ADR-0077
---

## Requirements

### AC-001 — one
The tool must do it.
Verify with: a test.

### AC-002 — two
The tool must do it.
Verify with: a test.

## Non-goals

- none.

## Open questions

- none.
`;

const TASK = `---
type: task
id: TASK-feat
source:
  - SPEC-feat
scope: [AC-001, AC-002]
status: review-ready
---

# Task

## Run summary

- Changed files: \`src/a.ts\`
`;

function review(rows: string): string {
    return `---
type: review
id: REVIEW-feat
task: TASK-feat
decision: pending
---

# Review

## Requirement coverage

| ID | Assessment | Evidence |
|---|---|---|
${rows}
`;
}

// A coverage table whose rows may each carry a fenced verify block (C013, ADR-0083). The spec's
// named command (from SPEC) is `a test.`; `verify: true` records a matching block (cmd="a test."
// result=pass) so the row reads C013-consistent — omit it (or pass a verifyLine) to drive a finding.
function reviewWithVerify(
    rows: readonly { id: string; assessment: string; verify?: boolean; verifyLine?: string }[]
): string {
    const rowsTable = rows
        .map((r) => {
            const row = `| ${r.id} | ${r.assessment} | p |`;
            if (r.verifyLine !== undefined) {
                return `${row}\n\n\`\`\`${r.verifyLine}\nout\n\`\`\`\n`;
            }
            return r.verify === true
                ? `${row}\n\n\`\`\`verify id=${r.id} cmd="a test." result=pass\nok (1 passed)\n\`\`\`\n`
                : row;
        })
        .join('\n');
    return review(rowsTable);
}

// The engine is pure over the handed sources (ADR-0143) — every case passes explicit spec/task
// sources; nothing here touches the filesystem.
function check(input: { reviewSource: string; specSource?: string; taskSource?: string | null }) {
    return check_review_file({
        reviewSource: input.reviewSource,
        reviewPath: 'review.md',
        specSource: input.specSource ?? SPEC,
        specPath: 'spec.md',
        // `taskSource: null` = no --task handed (the spec-keyed path); omitted = the matching TASK.
        taskSource: input.taskSource === null ? undefined : (input.taskSource ?? TASK),
    });
}

describe('check_review_file — C012 coverage against the handed spec + task', () => {
    it('reports C012 for a coverage gap (AC-002 uncovered)', () => {
        // AC-001 carries a consistent verify block so the only finding is the C012 coverage gap.
        const report = assertOk(
            check({ reviewSource: reviewWithVerify([{ id: 'AC-001', assessment: 'Supported', verify: true }]) })
        );
        expect(report.diagnostics.map((d) => d.code)).toEqual(['C012']);
        expect(report.diagnostics[0].message).toContain('AC-002');
        expect(report.level).toBe('warning');
    });

    it('reports C012 for an orphan row (AC-009 not in spec)', () => {
        const report = assertOk(
            check({
                reviewSource: reviewWithVerify([
                    { id: 'AC-001', assessment: 'Supported', verify: true },
                    { id: 'AC-002', assessment: 'Supported', verify: true },
                    { id: 'AC-009', assessment: 'Unverified' },
                ]),
            })
        );
        expect(report.diagnostics.map((d) => d.code)).toEqual(['C012']);
        expect(report.diagnostics[0].message).toContain('(orphan)');
    });

    it('a fully-covered review with consistent verify blocks is clean', () => {
        const report = assertOk(
            check({
                reviewSource: reviewWithVerify([
                    { id: 'AC-001', assessment: 'Supported', verify: true },
                    { id: 'AC-002', assessment: 'Supported', verify: true },
                ]),
            })
        );
        expect(report.diagnostics).toEqual([]);
        expect(report.level).toBe('clean');
    });

    it('a draft source spec exempts the review (the scope guard)', () => {
        const report = assertOk(
            check({
                reviewSource: review('| AC-001 | Supported | p |'),
                specSource: SPEC.replace('status: ready', 'status: draft'),
            })
        );
        expect(report.diagnostics).toEqual([]);
    });

    it('keys coverage on the task scope — an out-of-scope spec AC is not demanded', () => {
        const report = assertOk(
            check({
                reviewSource: reviewWithVerify([{ id: 'AC-001', assessment: 'Supported', verify: true }]),
                taskSource: TASK.replace('scope: [AC-001, AC-002]', 'scope: [AC-001]'),
            })
        );
        expect(report.diagnostics).toEqual([]); // AC-002 is outside the slice's scope
    });

    it('a spec that does not parse is an Err (blocking), not a silent clean', () => {
        const error = assertErr(
            check({ reviewSource: review('| AC-001 | Supported | p |'), specSource: 'no fence\n' })
        );
        expect(error.message.length).toBeGreaterThan(0);
    });
});

describe('check_review_file — C020 unresolvable-ref (the review names a different task)', () => {
    it('BLOCKS when the review names a task the handed packet does not identify as', () => {
        const report = assertOk(
            check({
                reviewSource: review('| AC-001 | Supported | p |'),
                taskSource: TASK.replace('id: TASK-feat', 'id: TASK-other'),
            })
        );
        expect(report.diagnostics.map((d) => d.code)).toEqual(['C020']);
        expect(report.diagnostics[0].message).toContain('TASK-feat');
        expect(report.diagnostics[0].message).toContain('TASK-other');
        expect(report.level).toBe('blocking'); // hard-error: the dangling ref blocks
    });

    it('BLOCKS when the review names a task and the handed packet carries no id', () => {
        const report = assertOk(
            check({
                reviewSource: review('| AC-001 | Supported | p |'),
                taskSource: TASK.replace('id: TASK-feat\n', ''),
            })
        );
        expect(report.diagnostics.map((d) => d.code)).toEqual(['C020']);
        expect(report.diagnostics[0].message).toContain('no id');
        expect(report.level).toBe('blocking');
    });
});

// The task-ref x --task-given quadrants (ADR-0134: the task is a conditional split slice;
// ADR-0143 D3: the floor never silently degrades).
describe('check_review_file — the conditional --task rule', () => {
    it('Q1: review names a task + task handed → task-keyed checks run (scope keys C012)', () => {
        const report = assertOk(
            check({
                reviewSource: reviewWithVerify([{ id: 'AC-001', assessment: 'Supported', verify: true }]),
                taskSource: TASK.replace('scope: [AC-001, AC-002]', 'scope: [AC-001]'),
            })
        );
        expect(report.diagnostics).toEqual([]); // AC-002 is outside the slice's scope — task-keyed
    });

    it('Q2: review names a task + NO task handed → Err naming --task (never a spec-only downgrade)', () => {
        const error = assertErr(check({ reviewSource: review('| AC-001 | Supported | p |'), taskSource: null }));
        expect(error.message).toContain('missing --task');
        expect(error.message).toContain('TASK-feat');
    });

    it('Q3: task-less review + no task handed → spec-keyed: C012 keys on the full spec id set, no C020', () => {
        const taskless = review('| AC-001 | Supported | p |').replace('task: TASK-feat\n', '');
        const report = assertOk(check({ reviewSource: taskless, taskSource: null }));
        const codes = report.diagnostics.map((d) => d.code);
        expect(codes).toContain('C012'); // AC-002 uncovered against the SPEC's full set
        expect(report.diagnostics.find((d) => d.code === 'C012')?.message).toContain('AC-002');
        expect(codes).toContain('C013'); // the free-form Supported row still surfaces
        expect(codes).not.toContain('C020'); // no ref to resolve
    });

    it('Q3: a task-less review covering the whole spec with consistent blocks is clean', () => {
        const taskless = reviewWithVerify([
            { id: 'AC-001', assessment: 'Supported', verify: true },
            { id: 'AC-002', assessment: 'Supported', verify: true },
        ]).replace('task: TASK-feat\n', '');
        const report = assertOk(check({ reviewSource: taskless, taskSource: null }));
        expect(report.diagnostics).toEqual([]);
        expect(report.level).toBe('clean');
    });

    it('Q3: C016 still blocks a task-less review (an empty-Evidence Supported is spec-independent)', () => {
        const taskless = review('| AC-001 | Supported |  |').replace('task: TASK-feat\n', '');
        const report = assertOk(check({ reviewSource: taskless, taskSource: null }));
        expect(report.diagnostics.map((d) => d.code)).toContain('C016');
        expect(report.level).toBe('blocking');
    });

    it('Q4: task-less review + a task handed anyway → Err (a companion nothing references)', () => {
        const taskless = review('| AC-001 | Supported | p |').replace('task: TASK-feat\n', '');
        const error = assertErr(check({ reviewSource: taskless }));
        expect(error.message).toContain('references no task');
    });
});

// `suspec check <review> --spec --task` must surface the SAME C013 verify-evidence-binding fact the
// contract defines (ADR-0083); a cmd-mismatch blocks (ADR-0129).
describe('check_review_file — C013 verify-evidence-binding', () => {
    it('reports C013 for a cmd mismatch (block cmd disagrees with the named command) — hard-error', () => {
        const report = assertOk(
            check({
                reviewSource: reviewWithVerify([
                    {
                        id: 'AC-001',
                        assessment: 'Supported',
                        verifyLine: 'verify id=AC-001 cmd="a different command" result=pass',
                    },
                    { id: 'AC-002', assessment: 'Supported', verify: true },
                ]),
            })
        );
        expect(report.diagnostics.map((d) => d.code)).toEqual(['C013']);
        expect(report.diagnostics[0].message).toContain('does not match');
        expect(report.diagnostics[0].severity).toBe('hard-error');
        expect(report.level).toBe('blocking');
    });

    it('reports C013 for a result=fail block under a Supported row', () => {
        const report = assertOk(
            check({
                reviewSource: reviewWithVerify([
                    { id: 'AC-001', assessment: 'Supported', verifyLine: 'verify id=AC-001 cmd="a test." result=fail' },
                    { id: 'AC-002', assessment: 'Supported', verify: true },
                ]),
            })
        );
        expect(report.diagnostics.map((d) => d.code)).toEqual(['C013']);
        expect(report.diagnostics[0].message).toContain('result=fail');
        expect(report.level).toBe('warning');
    });

    it('reports C013 free-form-only for a Supported row with no verify block (non-draft spec)', () => {
        const report = assertOk(
            check({ reviewSource: review('| AC-001 | Supported | p |\n| AC-002 | Supported | p |') })
        );
        expect(report.diagnostics.map((d) => d.code)).toEqual(['C013', 'C013']);
        expect(report.diagnostics.every((d) => d.message.includes('free-form'))).toBe(true);
        expect(report.level).toBe('warning');
    });

    it('a draft source spec exempts C013 even with a mismatched block (the scope guard)', () => {
        const report = assertOk(
            check({
                reviewSource: reviewWithVerify([
                    { id: 'AC-001', assessment: 'Supported', verifyLine: 'verify id=AC-001 cmd="wrong" result=fail' },
                    { id: 'AC-002', assessment: 'Supported', verify: true },
                ]),
                specSource: SPEC.replace('status: ready', 'status: draft'),
            })
        );
        expect(report.diagnostics).toEqual([]);
        expect(report.level).toBe('clean');
    });

    it('the C013 fact is verdict-free (a diagnostic + a level, never a review result)', () => {
        const report = assertOk(
            check({ reviewSource: review('| AC-001 | Supported | p |\n| AC-002 | Supported | p |') })
        );
        expect(report.diagnostics.length).toBeGreaterThan(0);
        const json = JSON.stringify(report);
        expect(json).not.toMatch(/"(verdict|decision|suggestedDecision|mergeDecision)":/);
        expect(report.level).toBe('warning');
    });
});

// C016 (ADR-0097): an empty-Evidence Supported row blocks — a Supported needs pasted output, a CI link, or a
// named manual observation; an empty cell reads Unverified, never Supported.
describe('check_review_file — C016 supported-needs-evidence', () => {
    it('BLOCKS a Supported row with an empty Evidence cell (hard-error → blocking / exit 2)', () => {
        const report = assertOk(
            check({ reviewSource: review('| AC-001 | Supported |  |\n| AC-002 | Supported | p |') })
        );
        const c016 = report.diagnostics.filter((d) => d.code === 'C016');
        expect(c016).toHaveLength(1);
        expect(c016[0].message).toContain('AC-001');
        expect(c016[0].severity).toBe('hard-error');
        expect(report.level).toBe('blocking');
    });

    it('a Supported row WITH a non-empty Evidence cell does not trip C016 (0-FP on a filled review)', () => {
        const report = assertOk(
            check({
                reviewSource: review('| AC-001 | Supported | pasted output |\n| AC-002 | Supported | a CI link |'),
            })
        );
        expect(report.diagnostics.filter((d) => d.code === 'C016')).toEqual([]);
    });

    it('an empty-Evidence row that is NOT Supported (Unverified) is not a C016 — only Supported needs evidence', () => {
        const report = assertOk(
            check({ reviewSource: review('| AC-001 | Unverified |  |\n| AC-002 | Supported | p |') })
        );
        expect(report.diagnostics.filter((d) => d.code === 'C016')).toEqual([]);
    });

    it('C016 fires even when the source spec is DRAFT — unlike C012/C013, it is not draft-guarded', () => {
        // An empty-evidence Supported is a structural contradiction in the review's OWN rows, independent
        // of the source spec's maturity. Drafting the spec exempts C012/C013, isolating the C016.
        const report = assertOk(
            check({
                reviewSource: review('| AC-001 | Supported |  |'),
                specSource: SPEC.replace('status: ready', 'status: draft'),
            })
        );
        expect(report.diagnostics.map((d) => d.code)).toEqual(['C016']);
        expect(report.level).toBe('blocking');
    });
});
