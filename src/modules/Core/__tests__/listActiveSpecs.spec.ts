import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { list_active_specs } from '../useCases/listActiveSpecs.ts';

// SPEC-suspec-v2 AC-019: the WIP-cap COUNT METHOD — active = a store-root spec-*.md with status
// ready|live; draft/terminal statuses, non-spec artifacts, and archived specs never occupy a slot.

let store: string;

function spec(name: string, status: string, id?: string): void {
    writeFileSync(join(store, name), `---\ntype: spec\n${id !== undefined ? `id: ${id}\n` : ''}status: ${status}\n---\n`);
}

beforeEach(() => {
    store = mkdtempSync(join(tmpdir(), 'suspec-active-'));
});
afterEach(() => {
    rmSync(store, { recursive: true, force: true });
});

describe('list_active_specs — the wip-cap count method', () => {
    it('counts ready and live specs; draft and done do not count', () => {
        spec('spec-a.md', 'ready', 'SPEC-a');
        spec('spec-b.md', 'live', 'SPEC-b');
        spec('spec-c.md', 'draft', 'SPEC-c');
        spec('spec-d.md', 'done', 'SPEC-d');
        expect(list_active_specs(store)).toEqual([
            { slug: 'a', id: 'SPEC-a', status: 'ready' },
            { slug: 'b', id: 'SPEC-b', status: 'live' },
        ]);
    });

    it('ignores non-spec artifacts, archived specs, a statusless spec, and dirs masquerading as specs', () => {
        spec('spec-a.md', 'ready', 'SPEC-a');
        writeFileSync(join(store, 'run-a.md'), '---\ntype: run\nstatus: live\n---\n');
        writeFileSync(join(store, 'spec-none.md'), '---\ntype: spec\n---\n');
        mkdirSync(join(store, 'archive'));
        spec(join('archive', 'spec-old.md'), 'ready', 'SPEC-old');
        mkdirSync(join(store, 'spec-dir.md'));
        expect(list_active_specs(store).map((s) => s.id)).toEqual(['SPEC-a']);
    });

    it('an id-less spec falls back to its slug; a missing store dir is an empty list', () => {
        writeFileSync(join(store, 'spec-anon.md'), '---\ntype: spec\nstatus: ready\n---\n');
        expect(list_active_specs(store)).toEqual([{ slug: 'anon', id: 'anon', status: 'ready' }]);
        expect(list_active_specs(join(store, 'nope'))).toEqual([]);
    });
});
