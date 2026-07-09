import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { list_open_findings } from '../listOpenFindings.ts';

// SPEC-suspec-v2 AC-015: the triage set — flat finding-*.md in the store ROOT, linked by `run:`.

let store: string;

beforeEach(() => {
    store = mkdtempSync(join(realpathSync(tmpdir()), 'suspec-findings-'));
});

afterEach(() => {
    rmSync(store, { recursive: true, force: true });
});

const finding = (fields: string, title = 'A lesson'): string => `---\ntype: finding\n${fields}\n---\n\n# ${title}\n`;

describe('list_open_findings', () => {
    it('is empty when the store is missing or holds nothing for the run', () => {
        expect(list_open_findings(join(store, 'nope'), 'feat')).toEqual([]);
        writeFileSync(join(store, 'finding-001.md'), finding('run: other'));
        expect(list_open_findings(store, 'feat')).toEqual([]);
    });

    it('lists the run\'s findings with id, title, severity, and expiry — sorted by filename', () => {
        writeFileSync(join(store, 'finding-002.md'), finding('id: FIND-002\nrun: feat\nseverity: critical', 'Bad one'));
        writeFileSync(join(store, 'finding-001.md'), finding('run: feat\nexpires: 2026-08-01', 'Small one'));
        expect(list_open_findings(store, 'feat')).toEqual([
            {
                filename: 'finding-001.md',
                path: join(store, 'finding-001.md'),
                id: null,
                title: 'Small one',
                severity: null,
                expires: '2026-08-01',
            },
            {
                filename: 'finding-002.md',
                path: join(store, 'finding-002.md'),
                id: 'FIND-002',
                title: 'Bad one',
                severity: 'critical',
                expires: null,
            },
        ]);
    });

    it('skips non-finding types, archived files, unreadable entries, and falls back to the filename title', () => {
        writeFileSync(join(store, 'finding-003.md'), '---\ntype: note\nrun: feat\n---\n');
        writeFileSync(join(store, 'finding-004.md'), '---\ntype: finding\nrun: feat\n---\nno heading here\n');
        mkdirSync(join(store, 'finding-dir.md')); // a dir masquerading as a finding — skipped
        mkdirSync(join(store, 'archive'));
        writeFileSync(join(store, 'archive', 'finding-009.md'), finding('run: feat')); // closed — not in the root scan
        const open = list_open_findings(store, 'feat');
        expect(open.map((entry) => entry.filename)).toEqual(['finding-004.md']);
        expect(open[0].title).toBe('finding-004.md');
    });
});
