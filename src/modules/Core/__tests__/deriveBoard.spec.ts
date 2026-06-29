import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { derive_board } from '../useCases/deriveBoard.ts';

let ws: string;

beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'suspec-board-'));
});

afterEach(() => {
    rmSync(ws, { recursive: true, force: true });
});

function spec(name: string, fm: string): void {
    mkdirSync(join(ws, 'specs', name), { recursive: true });
    writeFileSync(join(ws, 'specs', name, 'spec.md'), `---\n${fm}\n---\n`);
}
function packet(dir: string, file: string, fm: string): void {
    mkdirSync(join(ws, dir), { recursive: true });
    writeFileSync(join(ws, dir, file), `---\n${fm}\n---\n`);
}

describe('derive_board', () => {
    it('joins specs ← tasks ← reviews and flags gaps + needs-human', () => {
        spec('feat', 'type: spec\nid: SPEC-feat\nstatus: ready');
        packet('tasks', 't1.md', 'type: task\nid: TASK-1\nsource: SPEC-feat\nstatus: review-ready');
        packet('tasks', 't2.md', 'type: task\nid: TASK-2\nsource: SPEC-feat\nstatus: review-ready');
        packet('tasks', 't3.md', 'type: task\nid: TASK-3\nsource: SPEC-feat\nstatus: running');
        packet('reviews', 'r1.md', 'type: review\nid: REV-1\ntask: TASK-1\nstatus: needs-human');

        const board = assertOk(derive_board({ workspaceDir: ws }));
        expect(board.level).toBe('clean');
        expect(board.specs).toHaveLength(1);
        expect(board.specs[0].id).toBe('SPEC-feat');
        expect(board.specs[0].tasks).toHaveLength(3);

        const t1 = board.specs[0].tasks.find((t) => t.id === 'TASK-1');
        expect(t1).toEqual({ id: 'TASK-1', status: 'review-ready', hasReview: true, reviewStatus: 'needs-human' });
        const t2 = board.specs[0].tasks.find((t) => t.id === 'TASK-2');
        expect(t2?.hasReview).toBe(false);

        // TASK-2 is review-ready with no review; TASK-1 is reviewed; TASK-3 isn't review-ready.
        expect(board.tasksWithoutReview).toEqual(['TASK-2']);
        expect(board.needsHuman).toEqual(['TASK-1']);
    });

    it('dedupes needsHuman when one task has two attention-status reviews (#26)', () => {
        spec('feat', 'type: spec\nid: SPEC-feat\nstatus: ready');
        packet('tasks', 't1.md', 'type: task\nid: TASK-1\nsource: SPEC-feat\nstatus: review-ready');
        packet('reviews', 'r1.md', 'type: review\nid: REV-1\ntask: TASK-1\nstatus: needs-human');
        packet('reviews', 'r2.md', 'type: review\nid: REV-2\ntask: TASK-1\nstatus: blocked');
        const board = assertOk(derive_board({ workspaceDir: ws }));
        expect(board.needsHuman).toEqual(['TASK-1']); // flagged once, not ['TASK-1', 'TASK-1']
    });

    it('links a task whose `source` is a block list (the canonical task format) to its spec', () => {
        spec('feat', 'type: spec\nid: SPEC-feat\nstatus: ready');
        // The kit task template + cut_packet write source as a YAML list (spec, optionally a change-plan).
        packet('tasks', 't1.md', 'type: task\nid: TASK-1\nsource:\n  - SPEC-feat\n  - CHANGE-feat\nstatus: ready');
        const board = assertOk(derive_board({ workspaceDir: ws }));
        expect(board.specs[0].tasks.map((t) => t.id)).toEqual(['TASK-1']);
    });

    it('fills in fallback labels when status fields are absent', () => {
        spec('s', 'type: spec\nid: SPEC-s'); // no status → 'unknown'
        packet('tasks', 't.md', 'type: task\nid: TASK-x\nsource: SPEC-s'); // no status → 'unknown'
        packet('reviews', 'r.md', 'type: review\ntask: TASK-x'); // no status → 'draft', not attention
        const board = assertOk(derive_board({ workspaceDir: ws }));
        expect(board.specs[0].status).toBe('unknown');
        expect(board.specs[0].tasks[0].status).toBe('unknown');
        expect(board.specs[0].tasks[0].reviewStatus).toBe('draft');
        expect(board.needsHuman).toEqual([]);
    });

    it('labels a task with no id as (unnamed task)', () => {
        spec('feat', 'type: spec\nid: SPEC-feat\nstatus: ready');
        packet('tasks', 'noid.md', 'type: task\nsource: SPEC-feat\nstatus: review-ready'); // no id
        const board = assertOk(derive_board({ workspaceDir: ws }));
        expect(board.specs[0].tasks[0].id).toBe('(unnamed task)');
        expect(board.tasksWithoutReview).toEqual(['(unnamed task)']);
    });

    it('an empty workspace yields an empty board', () => {
        const board = assertOk(derive_board({ workspaceDir: ws }));
        expect(board.specs).toEqual([]);
        expect(board.tasksWithoutReview).toEqual([]);
        expect(board.needsHuman).toEqual([]);
    });

    it('falls back to the dir name for a spec with no id, skips a dir without spec.md, tolerates malformed packets', () => {
        spec('noid', 'type: spec\nstatus: draft'); // no id → dir name
        mkdirSync(join(ws, 'specs', 'notaspec'), { recursive: true }); // no spec.md → skipped
        packet('tasks', 'orphan.md', 'type: task\nstatus: running'); // no id, no source
        packet('reviews', 'detached.md', 'type: review\nstatus: draft'); // no task field → skipped

        const board = assertOk(derive_board({ workspaceDir: ws }));
        expect(board.specs).toHaveLength(1);
        expect(board.specs[0].id).toBe('noid');
        expect(board.specs[0].status).toBe('draft');
        expect(board.specs[0].tasks).toEqual([]); // the orphan task has no matching source
        expect(board.needsHuman).toEqual([]);
    });
});
