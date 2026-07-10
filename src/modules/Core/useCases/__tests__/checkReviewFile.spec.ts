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
status: needs-human
---

# Review

## Requirement coverage

| ID | Result | Evidence | Human attention |
|---|---|---|---|
${rows}
`;
}

// A coverage table whose rows may each carry a fenced verify block (C013, ADR-0083). The spec's
// named command (from SPEC) is `a test.`; `verify: true` records a matching block (cmd="a test."
// result=pass) so the row reads C013-consistent — omit it (or pass a verifyLine) to drive a finding.
function reviewWithVerify(
    rows: readonly { id: string; result: string; verify?: boolean; verifyLine?: string }[]
): string {
    const rowsTable = rows
        .map((r) => {
            const row = `| ${r.id} | ${r.result} | p | no |`;
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
function check(input: { reviewSource: string; specSource?: string; taskSource?: string }) {
    return check_review_file({
        reviewSource: input.reviewSource,
        reviewPath: 'review.md',
        specSource: input.specSource ?? SPEC,
        specPath: 'spec.md',
        taskSource: input.taskSource ?? TASK,
    });
}

describe('check_review_file — C012 coverage against the handed spec + task', () => {
    it('reports C012 for a coverage gap (AC-002 uncovered)', () => {
        // AC-001 carries a consistent verify block so the only finding is the C012 coverage gap.
        const report = assertOk(
            check({ reviewSource: reviewWithVerify([{ id: 'AC-001', result: 'Pass', verify: true }]) })
        );
        expect(report.diagnostics.map((d) => d.code)).toEqual(['C012']);
        expect(report.diagnostics[0].message).toContain('AC-002');
        expect(report.level).toBe('warning');
    });

    it('reports C012 for an orphan row (AC-009 not in spec)', () => {
        const report = assertOk(
            check({
                reviewSource: reviewWithVerify([
                    { id: 'AC-001', result: 'Pass', verify: true },
                    { id: 'AC-002', result: 'Pass', verify: true },
                    { id: 'AC-009', result: 'Unverified' },
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
                    { id: 'AC-001', result: 'Pass', verify: true },
                    { id: 'AC-002', result: 'Pass', verify: true },
                ]),
            })
        );
        expect(report.diagnostics).toEqual([]);
        expect(report.level).toBe('clean');
    });

    it('a draft source spec exempts the review (the scope guard)', () => {
        const report = assertOk(
            check({
                reviewSource: review('| AC-001 | Pass | p | no |'),
                specSource: SPEC.replace('status: ready', 'status: draft'),
            })
        );
        expect(report.diagnostics).toEqual([]);
    });

    it('keys coverage on the task scope — an out-of-scope spec AC is not demanded', () => {
        const report = assertOk(
            check({
                reviewSource: reviewWithVerify([{ id: 'AC-001', result: 'Pass', verify: true }]),
                taskSource: TASK.replace('scope: [AC-001, AC-002]', 'scope: [AC-001]'),
            })
        );
        expect(report.diagnostics).toEqual([]); // AC-002 is outside the slice's scope
    });

    it('a spec that does not parse is an Err (blocking), not a silent clean', () => {
        const error = assertErr(
            check({ reviewSource: review('| AC-001 | Pass | p | no |'), specSource: 'no fence\n' })
        );
        expect(error.message.length).toBeGreaterThan(0);
    });
});

describe('check_review_file — C020 unresolvable-ref (the review names a different task)', () => {
    it('BLOCKS when the review names a task the handed packet does not identify as', () => {
        const report = assertOk(
            check({
                reviewSource: review('| AC-001 | Pass | p | no |'),
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
                reviewSource: review('| AC-001 | Pass | p | no |'),
                taskSource: TASK.replace('id: TASK-feat\n', ''),
            })
        );
        expect(report.diagnostics.map((d) => d.code)).toEqual(['C020']);
        expect(report.diagnostics[0].message).toContain('no id');
        expect(report.level).toBe('blocking');
    });

    it('a review with no `task:` ref reconciles against the handed packet as-is (no C020)', () => {
        const taskless = review('| AC-001 | Pass | p | no |').replace('task: TASK-feat\n', '');
        const report = assertOk(check({ reviewSource: taskless }));
        // C012 still runs (AC-002 uncovered) — the checks are not bypassed.
        expect(report.diagnostics.some((d) => d.code === 'C012')).toBe(true);
        expect(report.diagnostics.some((d) => d.code === 'C020')).toBe(false);
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
                        result: 'Pass',
                        verifyLine: 'verify id=AC-001 cmd="a different command" result=pass',
                    },
                    { id: 'AC-002', result: 'Pass', verify: true },
                ]),
            })
        );
        expect(report.diagnostics.map((d) => d.code)).toEqual(['C013']);
        expect(report.diagnostics[0].message).toContain('does not match');
        expect(report.diagnostics[0].severity).toBe('hard-error');
        expect(report.level).toBe('blocking');
    });

    it('reports C013 for a result=fail block under a Pass row', () => {
        const report = assertOk(
            check({
                reviewSource: reviewWithVerify([
                    { id: 'AC-001', result: 'Pass', verifyLine: 'verify id=AC-001 cmd="a test." result=fail' },
                    { id: 'AC-002', result: 'Pass', verify: true },
                ]),
            })
        );
        expect(report.diagnostics.map((d) => d.code)).toEqual(['C013']);
        expect(report.diagnostics[0].message).toContain('result=fail');
        expect(report.level).toBe('warning');
    });

    it('reports C013 free-form-only for a Pass row with no verify block (non-draft spec)', () => {
        const report = assertOk(
            check({ reviewSource: review('| AC-001 | Pass | p | no |\n| AC-002 | Pass | p | no |') })
        );
        expect(report.diagnostics.map((d) => d.code)).toEqual(['C013', 'C013']);
        expect(report.diagnostics.every((d) => d.message.includes('free-form'))).toBe(true);
        expect(report.level).toBe('warning');
    });

    it('a draft source spec exempts C013 even with a mismatched block (the scope guard)', () => {
        const report = assertOk(
            check({
                reviewSource: reviewWithVerify([
                    { id: 'AC-001', result: 'Pass', verifyLine: 'verify id=AC-001 cmd="wrong" result=fail' },
                    { id: 'AC-002', result: 'Pass', verify: true },
                ]),
                specSource: SPEC.replace('status: ready', 'status: draft'),
            })
        );
        expect(report.diagnostics).toEqual([]);
        expect(report.level).toBe('clean');
    });

    it('the C013 fact is verdict-free (a diagnostic + a level, never a review result)', () => {
        const report = assertOk(
            check({ reviewSource: review('| AC-001 | Pass | p | no |\n| AC-002 | Pass | p | no |') })
        );
        expect(report.diagnostics.length).toBeGreaterThan(0);
        const json = JSON.stringify(report);
        expect(json).not.toMatch(/"(verdict|decision|suggestedDecision|mergeDecision)":/);
        expect(report.level).toBe('warning');
    });
});

// C016 (ADR-0097): an empty-Evidence Pass row blocks — a Pass needs pasted output, a CI link, or a
// named manual observation; an empty cell reads Unverified, never Pass.
describe('check_review_file — C016 pass-needs-evidence', () => {
    it('BLOCKS a Pass row with an empty Evidence cell (hard-error → blocking / exit 2)', () => {
        const report = assertOk(
            check({ reviewSource: review('| AC-001 | Pass |  | no |\n| AC-002 | Pass | p | no |') })
        );
        const c016 = report.diagnostics.filter((d) => d.code === 'C016');
        expect(c016).toHaveLength(1);
        expect(c016[0].message).toContain('AC-001');
        expect(c016[0].severity).toBe('hard-error');
        expect(report.level).toBe('blocking');
    });

    it('a Pass row WITH a non-empty Evidence cell does not trip C016 (0-FP on a filled review)', () => {
        const report = assertOk(
            check({
                reviewSource: review('| AC-001 | Pass | pasted output | no |\n| AC-002 | Pass | a CI link | no |'),
            })
        );
        expect(report.diagnostics.filter((d) => d.code === 'C016')).toEqual([]);
    });

    it('an empty-Evidence row that is NOT Pass (Unverified) is not a C016 — only Pass needs evidence', () => {
        const report = assertOk(
            check({ reviewSource: review('| AC-001 | Unverified |  | yes |\n| AC-002 | Pass | p | no |') })
        );
        expect(report.diagnostics.filter((d) => d.code === 'C016')).toEqual([]);
    });

    it('C016 fires even when the source spec is DRAFT — unlike C012/C013, it is not draft-guarded', () => {
        // An empty-evidence Pass is a structural contradiction in the review's OWN rows, independent
        // of the source spec's maturity. Drafting the spec exempts C012/C013, isolating the C016.
        const report = assertOk(
            check({
                reviewSource: review('| AC-001 | Pass |  | no |'),
                specSource: SPEC.replace('status: ready', 'status: draft'),
            })
        );
        expect(report.diagnostics.map((d) => d.code)).toEqual(['C016']);
        expect(report.level).toBe('blocking');
    });
});
