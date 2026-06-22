import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { check_review_file } from '../useCases/checkReviewFile.ts';
import { assertOk } from '../../../infra/errors/testing/assertOk.ts';

let dir: string;

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

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'swarm-check-review-'));
    mkdirSync(join(dir, 'specs', 'feat'), { recursive: true });
    mkdirSync(join(dir, 'tasks'), { recursive: true });
    writeFileSync(join(dir, 'specs', 'feat', 'spec.md'), SPEC);
    writeFileSync(join(dir, 'tasks', 'TASK-feat.md'), TASK);
});
afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

describe('check_review_file — C012 on a review packet (AC-028)', () => {
    it('reports C012 for a coverage gap (AC-002 uncovered)', () => {
        const path = join(dir, 'review.md');
        // AC-001 carries a consistent verify block so the only finding is the C012 coverage gap.
        writeFileSync(path, reviewWithVerify([{ id: 'AC-001', result: 'Pass', verify: true }]));
        const report = assertOk(check_review_file({ workspaceDir: dir, reviewPath: path }));
        expect(report.diagnostics.map((d) => d.code)).toEqual(['C012']);
        expect(report.diagnostics[0].message).toContain('AC-002');
        expect(report.level).toBe('warning');
    });

    it('reports C012 for an orphan row (AC-009 not in spec)', () => {
        const path = join(dir, 'review.md');
        // AC-001/AC-002 carry consistent verify blocks; AC-009 is the orphan — only C012 surfaces.
        // (An orphan id has no spec requirement, so its consistent block reads cmd-mismatch; give it
        // a clean block keyed to AC-009 against the spec's named command — but AC-009 is absent, so
        // there is no named command to match; mark it Unverified so C013 does not key on it.)
        writeFileSync(
            path,
            reviewWithVerify([
                { id: 'AC-001', result: 'Pass', verify: true },
                { id: 'AC-002', result: 'Pass', verify: true },
                { id: 'AC-009', result: 'Unverified' },
            ])
        );
        const report = assertOk(check_review_file({ workspaceDir: dir, reviewPath: path }));
        expect(report.diagnostics.map((d) => d.code)).toEqual(['C012']);
        expect(report.diagnostics[0].message).toContain('(orphan)');
    });

    it('a fully-covered review with consistent verify blocks is clean', () => {
        const path = join(dir, 'review.md');
        writeFileSync(
            path,
            reviewWithVerify([
                { id: 'AC-001', result: 'Pass', verify: true },
                { id: 'AC-002', result: 'Pass', verify: true },
            ])
        );
        const report = assertOk(check_review_file({ workspaceDir: dir, reviewPath: path }));
        expect(report.diagnostics).toEqual([]);
        expect(report.level).toBe('clean');
    });

    it('a draft source spec exempts the review (the scope guard)', () => {
        writeFileSync(join(dir, 'specs', 'feat', 'spec.md'), SPEC.replace('status: ready', 'status: draft'));
        const path = join(dir, 'review.md');
        writeFileSync(path, review('| AC-001 | Pass | p | no |'));
        expect(assertOk(check_review_file({ workspaceDir: dir, reviewPath: path })).diagnostics).toEqual([]);
    });

    it('an unresolvable task (no tasks/<task>.md) cannot run C012 → clean', () => {
        rmSync(join(dir, 'tasks', 'TASK-feat.md'));
        const path = join(dir, 'review.md');
        writeFileSync(path, review('| AC-001 | Pass | p | no |'));
        expect(assertOk(check_review_file({ workspaceDir: dir, reviewPath: path })).diagnostics).toEqual([]);
    });

    it('a review with no task: frontmatter cannot run C012 → clean', () => {
        const path = join(dir, 'review.md');
        writeFileSync(path, '---\ntype: review\nid: REVIEW-x\n---\n# r\n');
        expect(assertOk(check_review_file({ workspaceDir: dir, reviewPath: path })).diagnostics).toEqual([]);
    });

    it('a task whose source spec is not in the workspace cannot run C012 → clean', () => {
        writeFileSync(join(dir, 'tasks', 'TASK-feat.md'), TASK.replace('- SPEC-feat', '- SPEC-absent'));
        const path = join(dir, 'review.md');
        writeFileSync(path, review('| AC-001 | Pass | p | no |'));
        expect(assertOk(check_review_file({ workspaceDir: dir, reviewPath: path })).diagnostics).toEqual([]);
    });

    it('a task packet with no source: key cannot run C012 → clean', () => {
        writeFileSync(
            join(dir, 'tasks', 'TASK-feat.md'),
            '---\ntype: task\nid: TASK-feat\nscope: [AC-001]\nstatus: review-ready\n---\n# Task\n'
        );
        const path = join(dir, 'review.md');
        writeFileSync(path, review('| AC-001 | Pass | p | no |'));
        expect(assertOk(check_review_file({ workspaceDir: dir, reviewPath: path })).diagnostics).toEqual([]);
    });

    it('a spec file whose frontmatter id does not match the task source → not found → clean', () => {
        writeFileSync(join(dir, 'specs', 'feat', 'spec.md'), 'no frontmatter fence here\n');
        const path = join(dir, 'review.md');
        writeFileSync(path, review('| AC-001 | Pass | p | no |'));
        expect(assertOk(check_review_file({ workspaceDir: dir, reviewPath: path })).diagnostics).toEqual([]);
    });

    it('skips a spec directory that has no spec.md', () => {
        mkdirSync(join(dir, 'specs', 'aaa-empty'), { recursive: true }); // sorts before feat/, holds no spec.md
        const path = join(dir, 'review.md');
        // AC-001 carries a consistent verify block so the only finding is the C012 gap (AC-002).
        writeFileSync(path, reviewWithVerify([{ id: 'AC-001', result: 'Pass', verify: true }]));
        const report = assertOk(check_review_file({ workspaceDir: dir, reviewPath: path }));
        expect(report.diagnostics.map((d) => d.code)).toEqual(['C012']); // still resolves specs/feat and runs C012
    });
});

// The W4a regression guard: `swarm check <review-file>` must surface the SAME C013 verify-evidence-
// binding fact the `swarm review` reconcile does (AC-005 — BOTH commands). Before the fix, this path
// ran only C012 and read the violating packet as clean (exit 0). Each violating packet here warns via
// `swarm review`; a consistent/draft packet surfaces no C013 finding.
describe('check_review_file — C013 verify-evidence-binding on a review packet (AC-005, ADR-0083)', () => {
    it('reports C013 for a cmd mismatch (block cmd disagrees with the named command)', () => {
        const path = join(dir, 'review.md');
        writeFileSync(
            path,
            reviewWithVerify([
                { id: 'AC-001', result: 'Pass', verifyLine: 'verify id=AC-001 cmd="a different command" result=pass' },
                { id: 'AC-002', result: 'Pass', verify: true },
            ])
        );
        const report = assertOk(check_review_file({ workspaceDir: dir, reviewPath: path }));
        expect(report.diagnostics.map((d) => d.code)).toEqual(['C013']);
        expect(report.diagnostics[0].message).toContain('does not match');
        expect(report.level).toBe('warning');
    });

    it('reports C013 for a result=fail block under a Pass row', () => {
        const path = join(dir, 'review.md');
        writeFileSync(
            path,
            reviewWithVerify([
                { id: 'AC-001', result: 'Pass', verifyLine: 'verify id=AC-001 cmd="a test." result=fail' },
                { id: 'AC-002', result: 'Pass', verify: true },
            ])
        );
        const report = assertOk(check_review_file({ workspaceDir: dir, reviewPath: path }));
        expect(report.diagnostics.map((d) => d.code)).toEqual(['C013']);
        expect(report.diagnostics[0].message).toContain('result=fail');
        expect(report.level).toBe('warning');
    });

    it('reports C013 free-form-only for a Pass row with no verify block (non-draft spec)', () => {
        const path = join(dir, 'review.md');
        // Both rows are Pass with only a free-form Evidence cell → two C013 free-form-only facts.
        writeFileSync(path, review('| AC-001 | Pass | p | no |\n| AC-002 | Pass | p | no |'));
        const report = assertOk(check_review_file({ workspaceDir: dir, reviewPath: path }));
        expect(report.diagnostics.map((d) => d.code)).toEqual(['C013', 'C013']);
        expect(report.diagnostics.every((d) => d.message.includes('free-form'))).toBe(true);
        expect(report.level).toBe('warning');
    });

    it('a consistent packet (matching block + result=pass on each Pass row) → no C013 finding', () => {
        const path = join(dir, 'review.md');
        writeFileSync(
            path,
            reviewWithVerify([
                { id: 'AC-001', result: 'Pass', verify: true },
                { id: 'AC-002', result: 'Pass', verify: true },
            ])
        );
        const report = assertOk(check_review_file({ workspaceDir: dir, reviewPath: path }));
        expect(report.diagnostics).toEqual([]);
        expect(report.level).toBe('clean');
    });

    it('a draft source spec exempts C013 even with a mismatched block (the scope guard)', () => {
        writeFileSync(join(dir, 'specs', 'feat', 'spec.md'), SPEC.replace('status: ready', 'status: draft'));
        const path = join(dir, 'review.md');
        writeFileSync(
            path,
            reviewWithVerify([
                { id: 'AC-001', result: 'Pass', verifyLine: 'verify id=AC-001 cmd="wrong" result=fail' },
                { id: 'AC-002', result: 'Pass', verify: true },
            ])
        );
        const report = assertOk(check_review_file({ workspaceDir: dir, reviewPath: path }));
        expect(report.diagnostics).toEqual([]);
        expect(report.level).toBe('clean');
    });

    it('the C013 fact via `swarm check` is verdict-free (a diagnostic + a level, never a Result)', () => {
        const path = join(dir, 'review.md');
        writeFileSync(path, review('| AC-001 | Pass | p | no |\n| AC-002 | Pass | p | no |'));
        const report = assertOk(check_review_file({ workspaceDir: dir, reviewPath: path }));
        expect(report.diagnostics.length).toBeGreaterThan(0);
        const json = JSON.stringify(report);
        expect(json).not.toMatch(/"(verdict|decision|suggestedDecision|mergeDecision)":/);
        expect(report.level).toBe('warning');
    });
});

// C016 (ADR-0097): the GATE path BLOCKS an empty-Evidence Pass row — the verified B2 defect (the
// standalone `swarm check <review>` path used to never evaluate the cell). Unlike C012/C013 (warning),
// C016 is hard-error: an empty cell on a Pass is a structural contradiction, so the gate fails it.
describe('check_review_file — C016 pass-needs-evidence (the gate blocks an empty-Evidence Pass)', () => {
    it('BLOCKS a Pass row with an empty Evidence cell (hard-error → blocking / exit 2)', () => {
        const path = join(dir, 'review.md');
        // AC-001 Pass with an EMPTY evidence cell; AC-002 Pass with evidence — isolates the C016 on AC-001.
        writeFileSync(path, review('| AC-001 | Pass |  | no |\n| AC-002 | Pass | p | no |'));
        const report = assertOk(check_review_file({ workspaceDir: dir, reviewPath: path }));
        const c016 = report.diagnostics.filter((d) => d.code === 'C016');
        expect(c016).toHaveLength(1);
        expect(c016[0].message).toContain('AC-001');
        expect(c016[0].severity).toBe('hard-error');
        expect(report.level).toBe('blocking'); // the gate fails — the B2 defect (was clean/exit 0) is closed
    });

    it('a Pass row WITH a non-empty Evidence cell does not trip C016 (0-FP on a filled review)', () => {
        const path = join(dir, 'review.md');
        writeFileSync(path, review('| AC-001 | Pass | pasted output | no |\n| AC-002 | Pass | a CI link | no |'));
        const report = assertOk(check_review_file({ workspaceDir: dir, reviewPath: path }));
        expect(report.diagnostics.filter((d) => d.code === 'C016')).toEqual([]);
    });

    it('an empty-Evidence row that is NOT Pass (Unverified) is not a C016 — only Pass needs evidence', () => {
        const path = join(dir, 'review.md');
        writeFileSync(path, review('| AC-001 | Unverified |  | yes |\n| AC-002 | Pass | p | no |'));
        const report = assertOk(check_review_file({ workspaceDir: dir, reviewPath: path }));
        expect(report.diagnostics.filter((d) => d.code === 'C016')).toEqual([]);
    });

    it('C016 fires even when the source spec is DRAFT — unlike C012/C013, it is not draft-guarded', () => {
        // An empty-evidence Pass is a structural contradiction in the review's OWN rows, independent of
        // the source spec's maturity — so the gate blocks it at draft too (the C012/C013 scope guard
        // does not apply). Drafting the spec exempts C012/C013, isolating the C016.
        writeFileSync(join(dir, 'specs', 'feat', 'spec.md'), SPEC.replace('status: ready', 'status: draft'));
        const path = join(dir, 'review.md');
        writeFileSync(path, review('| AC-001 | Pass |  | no |'));
        const report = assertOk(check_review_file({ workspaceDir: dir, reviewPath: path }));
        expect(report.diagnostics.map((d) => d.code)).toEqual(['C016']); // no C012/C013 (draft-exempt)
        expect(report.level).toBe('blocking');
    });
});
