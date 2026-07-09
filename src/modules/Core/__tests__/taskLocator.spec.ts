import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { frontmatter_value, resolve_task, list_task_ids, find_source_spec } from '../useCases/taskLocator.ts';

// The workspace-tree task/spec locator the worktree + stamp faces still drive (`worktree create
// --task <t>`, `suspec stamp`). Pure-fs coverage of the resolution branches; resolve_worktree
// (git IO) is exercised by the worktree/review integration suites.

let ws: string;
beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'suspec-tasklocator-'));
    mkdirSync(join(ws, 'tasks'), { recursive: true });
    mkdirSync(join(ws, 'specs', 'feat'), { recursive: true });
    writeFileSync(join(ws, 'specs', 'feat', 'spec.md'), '---\ntype: spec\nid: SPEC-feat\n---\n\n# Spec\n');
    writeFileSync(join(ws, 'tasks', 'TASK-feat.md'), '---\ntype: task\nid: TASK-feat\nstatus: ready\n---\n\n# T\n');
    writeFileSync(join(ws, 'tasks', 'legacy.md'), '---\ntype: task\nstatus: ready\n---\n\n# T\n');
    writeFileSync(join(ws, 'tasks', 'README.md'), '# not a task\n');
});
afterEach(() => rmSync(ws, { recursive: true, force: true }));

describe('frontmatter_value', () => {
    it('reads an inline scalar, the first block-list item, and null for misses', () => {
        const listed = '---\nsource:\n  - SPEC-feat extra\n---\n';
        expect(frontmatter_value(listed, 'source')).toBe('SPEC-feat');
        expect(frontmatter_value('---\nstatus: ready\n---\n', 'status')).toBe('ready');
        expect(frontmatter_value('---\nstatus: ready\n---\n', 'id')).toBeNull(); // absent key
        expect(frontmatter_value('no fence here', 'status')).toBeNull(); // no frontmatter at all
        expect(frontmatter_value('---\nsource:\nnot-a-list\n---\n', 'source')).toBeNull(); // bare key, no items
    });
});

describe('resolve_task', () => {
    it('resolves the TASK-<slug>.md form from the id, the bare slug, and the legacy bare file', () => {
        expect(resolve_task(ws, 'TASK-feat')?.id).toBe('TASK-feat');
        expect(resolve_task(ws, 'feat')?.id).toBe('TASK-feat');
        // A legacy bare tasks/legacy.md with no frontmatter id falls back to the stem as its id.
        expect(resolve_task(ws, 'legacy')?.id).toBe('legacy');
    });

    it('returns null for a miss and refuses a traversal-shaped arg before any read', () => {
        expect(resolve_task(ws, 'nope')).toBeNull();
        expect(resolve_task(ws, '../evil')).toBeNull();
    });
});

describe('list_task_ids', () => {
    it('lists frontmatter ids (filename stem as fallback), README excluded, sorted', () => {
        expect(list_task_ids(ws)).toEqual(['TASK-feat', 'legacy']);
    });

    it('an absent tasks/ dir reads as empty', () => {
        expect(list_task_ids(join(ws, 'nowhere'))).toEqual([]);
    });
});

describe('find_source_spec', () => {
    it('finds the specs/<slug>/spec.md whose frontmatter id matches; null otherwise', () => {
        expect(find_source_spec(ws, 'SPEC-feat')).toEqual({ path: join(ws, 'specs', 'feat', 'spec.md'), slug: 'feat' });
        expect(find_source_spec(ws, 'SPEC-nope')).toBeNull();
        expect(find_source_spec(join(ws, 'nowhere'), 'SPEC-feat')).toBeNull(); // no specs/ dir
        // A spec dir without a spec.md file is skipped, not read.
        mkdirSync(join(ws, 'specs', 'empty'), { recursive: true });
        expect(find_source_spec(ws, 'SPEC-feat')?.slug).toBe('feat');
    });
});
