import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { scan_clean_candidates } from '../useCases/scanCleanCandidates.ts';

let ws: string;
beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'corpus-clean-'));
});
afterEach(() => {
    rmSync(ws, { recursive: true, force: true });
});

function writeArtifact(dir: string, name: string, fm: Record<string, string>): void {
    mkdirSync(join(ws, dir), { recursive: true });
    const front = Object.entries(fm)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');
    writeFileSync(join(ws, dir, name), `---\n${front}\n---\n\nbody\n`);
}

describe('scan_clean_candidates (SPEC-corpus-clean, ADR-0106 item 2)', () => {
    it('reports spent tasks (closed) and reviews (pass/waived) as prune candidates', () => {
        writeArtifact('tasks', 'TASK-done.md', { type: 'task', id: 'TASK-done', status: 'closed' });
        writeArtifact('reviews', 'r-passed.md', { type: 'review', id: 'REVIEW-p', status: 'pass' });
        writeArtifact('reviews', 'r-waived.md', { type: 'review', id: 'REVIEW-w', status: 'waived' });
        const report = assertOk(scan_clean_candidates({ workspaceDir: ws }));
        expect(report.candidates.map((c) => c.path)).toEqual(['tasks/TASK-done.md', 'reviews/r-passed.md', 'reviews/r-waived.md']);
        expect(report.candidates.map((c) => c.kind)).toEqual(['task', 'review', 'review']);
        expect(report.candidates[0].id).toBe('TASK-done');
        expect(report.keptCount).toBe(0);
        expect(report.level).toBe('clean');
    });

    it('keeps live work — a running/review-ready task or a draft/needs-human review is never a candidate', () => {
        writeArtifact('tasks', 'TASK-live.md', { type: 'task', id: 'TASK-live', status: 'review-ready' });
        writeArtifact('tasks', 'TASK-run.md', { type: 'task', id: 'TASK-run', status: 'running' });
        writeArtifact('reviews', 'r-draft.md', { type: 'review', id: 'REVIEW-d', status: 'draft' });
        writeArtifact('reviews', 'r-human.md', { type: 'review', id: 'REVIEW-h', status: 'needs-human' });
        const report = assertOk(scan_clean_candidates({ workspaceDir: ws }));
        expect(report.candidates).toEqual([]);
        expect(report.keptCount).toBe(4);
    });

    it('never proposes a README placeholder or a non-markdown file', () => {
        writeArtifact('tasks', 'TASK-done.md', { type: 'task', id: 'T', status: 'closed' });
        writeFileSync(join(ws, 'tasks', 'README.md'), '# tasks\n'); // placeholder — never pruned
        writeFileSync(join(ws, 'tasks', 'notes.txt'), 'scratch\n'); // non-md — ignored
        const report = assertOk(scan_clean_candidates({ workspaceDir: ws }));
        expect(report.candidates.map((c) => c.path)).toEqual(['tasks/TASK-done.md']);
    });

    it('only ever reads tasks/ and reviews/ — durable artifacts are never scanned', () => {
        // A closed-looking spec/finding/decision must never appear as a candidate.
        mkdirSync(join(ws, 'specs', 'x'), { recursive: true });
        writeFileSync(join(ws, 'specs', 'x', 'spec.md'), '---\ntype: spec\nstatus: superseded\n---\n');
        writeArtifact('findings', 'f.md', { type: 'finding', id: 'F', status: 'closed' });
        writeArtifact('decisions', '0001.md', { type: 'adr', id: 'D', status: 'closed' });
        const report = assertOk(scan_clean_candidates({ workspaceDir: ws }));
        expect(report.candidates).toEqual([]);
        expect(report.keptCount).toBe(0);
    });

    it('an empty workspace (no tasks/ or reviews/ dirs) reports nothing, cleanly', () => {
        const report = assertOk(scan_clean_candidates({ workspaceDir: ws }));
        expect(report.candidates).toEqual([]);
        expect(report.keptCount).toBe(0);
        expect(report.level).toBe('clean');
    });
});
