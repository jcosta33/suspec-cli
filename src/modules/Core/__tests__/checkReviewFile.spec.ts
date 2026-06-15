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
        writeFileSync(path, review('| AC-001 | Pass | pasted | no |'));
        const report = assertOk(check_review_file({ workspaceDir: dir, reviewPath: path }));
        expect(report.diagnostics.map((d) => d.code)).toEqual(['C012']);
        expect(report.diagnostics[0].message).toContain('AC-002');
        expect(report.level).toBe('warning');
    });

    it('reports C012 for an orphan row (AC-009 not in spec)', () => {
        const path = join(dir, 'review.md');
        writeFileSync(path, review('| AC-001 | Pass | p | no |\n| AC-002 | Pass | p | no |\n| AC-009 | Pass | p | no |'));
        const report = assertOk(check_review_file({ workspaceDir: dir, reviewPath: path }));
        expect(report.diagnostics.map((d) => d.code)).toEqual(['C012']);
        expect(report.diagnostics[0].message).toContain('(orphan)');
    });

    it('a fully-covered review is clean', () => {
        const path = join(dir, 'review.md');
        writeFileSync(path, review('| AC-001 | Pass | p | no |\n| AC-002 | Pass | p | no |'));
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
        writeFileSync(path, review('| AC-001 | Pass | pasted | no |'));
        const report = assertOk(check_review_file({ workspaceDir: dir, reviewPath: path }));
        expect(report.diagnostics.map((d) => d.code)).toEqual(['C012']); // still resolves specs/feat and runs C012
    });
});
